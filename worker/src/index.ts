// The host for rig's agents that wake alone (plan: pulse; ADR 0005, 0006).
// GET  /.well-known/mega-pulse.json  what each agent may do
// POST /                             a signed ping from the course; routed on `kind`
//
// Status to the course: 200 the work is finished · 401 not from the course, or too old ·
// 400 signed but not a ping we know · 5xx the work failed, send the ping again.

import { verifyPing } from './verify.js';
import { askModel } from './pulse-model.js';
import { runPulse } from './pulse.js';
import { PLAN_TEXTS } from './texts.js';

export interface Env {
  OWNER_CODE: string;
  COURSE_URL: string;
  PING_KEY: string;
  OPENAI_API_KEY: string;
}

export interface PulsePing {
  kind: 'pulse';
  text?: unknown;
  phrase?: unknown;
  reply: string;
  tracker: string;
}

export interface TestPing {
  kind: 'test';
  issue: number;
  reply: string;
  files: Record<string, string>;
}

export type Ping = PulsePing | TestPing;

export function agentsFile(ownerCode: string) {
  return {
    owner: ownerCode,
    agents: {
      pulse: { wakes: 'pulse', may: ['answer'] },
      'test-writer': { wakes: 'test', may: ['test'] },
    },
  };
}

// `reply` and `tracker` always start with the course address. Compared as an origin, so that
// https://hq.mega.dev.example.com does not pass for https://hq.mega.dev.
export function isCourseAddress(value: unknown, courseUrl: string): value is string {
  if (typeof value !== 'string') return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.origin === new URL(courseUrl).origin;
  } catch {
    return false;
  }
}

// A signed body → a ping we know, or the reason it is not one.
export function readPing(body: unknown, courseUrl: string): Ping | string {
  if (typeof body !== 'object' || body === null) return 'body is not an object';

  const bodyRecord = body as Record<string, unknown>;
  if (!isCourseAddress(bodyRecord.reply, courseUrl)) return 'reply is not a course address';

  if (bodyRecord.kind === 'pulse') {
    if (!isCourseAddress(bodyRecord.tracker, courseUrl)) return 'tracker is not a course address';
    return { kind: 'pulse', text: bodyRecord.text, phrase: bodyRecord.phrase, reply: bodyRecord.reply, tracker: bodyRecord.tracker };
  }

  if (bodyRecord.kind === 'test') {
    if (typeof bodyRecord.issue !== 'number' || !Number.isInteger(bodyRecord.issue) || bodyRecord.issue < 1) return 'issue is not a number';
    if (typeof bodyRecord.files !== 'object' || bodyRecord.files === null) return 'files is not an object';

    const files: Record<string, string> = {};
    for (const [path, text] of Object.entries(bodyRecord.files)) {
      if (typeof text !== 'string') return 'a file is not text';
      files[path] = text;
    }
    
    return { kind: 'test', issue: bodyRecord.issue, reply: bodyRecord.reply, files };
  }

  return 'unknown kind';
}

function line(status: number, text: string): Response {
  return new Response(`${text}\n`, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/.well-known/mega-pulse.json') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return line(405, 'GET only');
      return Response.json(agentsFile(env.OWNER_CODE));
    }

    if (url.pathname !== '/') return line(404, 'not found');
    if (request.method !== 'POST') return line(405, 'POST only');

    const rawBody = await request.text();
    const verified = await verifyPing({
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
      rawBody,
      pingKey: env.PING_KEY ?? '',
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    if (!verified.ok) {
      console.log(`ping refused: ${verified.reason}`);
      return line(401, 'not a ping from the course');
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return line(400, 'body is not JSON');
    }
    
    const ping = readPing(body, env.COURSE_URL);
    if (typeof ping === 'string') {
      console.log(`ping ${request.headers.get('webhook-id')} not understood: ${ping}`);
      return line(400, ping);
    }

    if (ping.kind === "pulse") {
      const outFetch: typeof fetch = (input, init) => fetch(input, init);
      const outcome = await runPulse(ping, {
        fetch: outFetch,
        askModel: (openSet) => askModel({ fetch: outFetch, apiKey: env.OPENAI_API_KEY }, PLAN_TEXTS, openSet)
      });

      console.log(`ping ${request.headers.get('webhook-id')}: pulse, ${outcome.log}`);
      return line(outcome.status, outcome.log);
    }

    // The test writer comes with issue #4. Until then its work cannot finish: 5xx, never a 200.
    console.log(`ping ${request.headers.get('webhook-id')}: ${ping.kind}, no agent for it yet`);
    return line(503, `the ${ping.kind} agent is not on this host yet`);
  },
} satisfies ExportedHandler<Env>;
