// The host for rig's agents that wake alone (plan: pulse; ADR 0005, 0006).
// GET  /.well-known/mega-pulse.json  what each agent may do
// POST /                             a signed ping from the course; routed on `kind`
//
// Status to the course: 200 the work is finished · 401 not from the course, or too old ·
// 400 signed but not a ping we know · 5xx the work failed, send the ping again.

import { verifyPing } from './verify.js';
import { askModel } from './pulse-model.js';
import { runPulse } from './pulse.js';
import { EXISTING_TESTS, PLAN_TEXTS } from './texts.js';
import { runTestWriter } from './test-writer.js';
import { askTestModel } from './test-writer-model.js';

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

// The course hangs up before a slow agent is done (seen: after 4.9 s, a test ping needs about 12),
// and the host cancels the work of a request whose caller is gone. `waitUntil` keeps the work
// alive for up to 30 s after that, so the answer still reaches the reply address. The status does
// not come early: it is still sent only when the work is finished.
async function answerWhenDone(ctx: ExecutionContext, work: Promise<{ status: number; log: string }>): Promise<Response> {
  ctx.waitUntil(work);
  const outcome = await work;
  return line(outcome.status, outcome.log);
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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

    const id = request.headers.get('webhook-id');
    const ping = readPing(body, env.COURSE_URL);
    if (typeof ping === 'string') {
      console.log(`ping ${id} not understood: ${ping}`);
      return line(400, ping);
    }

    // Wrapped: a bare `fetch` kept on an object may lose its `this` on the host.
    const outFetch: typeof fetch = (input, init) => fetch(input, init);

    // The log lines are part of the work: they must be written even when the course is gone.
    if (ping.kind === 'pulse') {
      const work = runPulse(ping, {
        fetch: outFetch,
        askModel: (openSet) => askModel({ fetch: outFetch, apiKey: env.OPENAI_API_KEY }, PLAN_TEXTS, openSet),
      }).then((outcome) => {
        console.log(`ping ${id}: pulse, ${outcome.log}`);
        return outcome;
      });

      return answerWhenDone(ctx, work);
    }

    // Not a pulse, so a test ping: `readPing` lets no other kind through.
    const work = runTestWriter(ping, {
      fetch: outFetch,
      courseUrl: env.COURSE_URL,
      existingTests: EXISTING_TESTS,
      askModel: (inputTestWriter) => askTestModel({ fetch: outFetch, apiKey: env.OPENAI_API_KEY }, inputTestWriter),
    }).then((outcome) => {
      console.log(`ping ${id}: test, ${outcome.log}`);
      // The whole test goes to the host's log only: calibration reads it there (issue #4).
      // It is never part of the HTTP body the course gets back.
      if (outcome.test) console.log(`ping ${id}: test file ${outcome.test.path}\n${outcome.test.test}`);
      return outcome;
    });

    return answerWhenDone(ctx, work);
  },
} satisfies ExportedHandler<Env>;
