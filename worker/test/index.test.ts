import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { agentsFile, isCourseAddress, readPing, type Env } from '../src/index.js';
import { RESPONSES_URL } from '../src/model.js';

const KEY_BYTES = Buffer.from('a made-up ping key for the tests');
const env: Env = {
  OWNER_CODE: 'own-test',
  COURSE_URL: 'https://course.test',
  PING_KEY: `whsec_${KEY_BYTES.toString('base64')}`,
  OPENAI_API_KEY: 'not-a-key',
};

const pulse = {
  kind: 'pulse',
  text: 'pulse? low tide',
  phrase: 'low tide',
  reply: 'https://course.test/rig/reply/abc',
  tracker: 'https://course.test/rig/tracker/issues',
};

const testPing = {
  kind: 'test',
  issue: 12,
  reply: 'https://course.test/rig/reply/abc',
  files: {
    'src/digest/read.ts': 'export {}',
  },
};

// What the test ping's network looks like, made up: the tracker's issue, the model's answer, the
// reply address. No real network: `stubNetwork` replaces the global `fetch` index.ts wraps.

const TRACKER_ISSUE = 'https://course.test/rig/tracker/issues/12';
/** A text only the test's source carries: it must reach the reply address and the log, never the HTTP body. */
const SOURCE_MARK = 'keeps-the-row-with-a-dash-owner';

const TEST_ANSWER = {
  path: 'test/digest-dash-owner.test.ts',
  test: [
    "import { describe, expect, it } from 'vitest';",
    "import { readNight } from '../src/digest/read.js';",
    '',
    `describe('${SOURCE_MARK}', () => {`,
    "  it('reads a night', () => {",
    '    expect(readNight).toBeDefined();',
    '  });',
    '});',
    '',
  ].join('\n'),
  red: 'expect(jobs).toHaveLength(6) fails: received 5',
};

const trackerIssue = {
  number: 12,
  title: 'Digest prints null instead of — for a missing owner',
  state: 'open',
  labels: ['bug'],
  by: 'rook',
  body: 'The digest shows 5 jobs, the run log has 6.',
  comments: [],
};

/** A completed Responses API body whose text is the given JSON. */
function modelResponse(value: unknown): Record<string, unknown> {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] }],
  };
}

interface SeenRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Replaces the global `fetch`: tracker → the issue, model → the test, reply address → 202. */
function stubNetwork(opts: { tracker?: 'throws' } = {}): SeenRequest[] {
  const seen: SeenRequest[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      const raw = typeof init?.body === 'string' ? init.body : undefined;
      seen.push({
        url,
        method,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: raw === undefined ? undefined : JSON.parse(raw),
      });

      if (url === TRACKER_ISSUE && method === 'GET') {
        if (opts.tracker === 'throws') throw new TypeError('fetch failed');
        return Response.json(trackerIssue);
      }
      if (url === RESPONSES_URL && method === 'POST') return Response.json(modelResponse(TEST_ANSWER));
      if (url === testPing.reply && method === 'POST') return new Response(null, { status: 202 });

      return new Response('not here', { status: 404 });
    }),
  );

  return seen;
}

function signed(body: unknown, over: { timestamp?: number; key?: Buffer } = {}): Request {
  const raw = JSON.stringify(body);
  const timestamp = over.timestamp ?? Math.floor(Date.now() / 1000);
  const mac = createHmac('sha256', over.key ?? KEY_BYTES).update(`msg_1.${timestamp}.${raw}`).digest('base64');
  return new Request('https://host.test/', {
    method: 'POST',
    body: raw,
    headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${mac}` },
  });
}

describe('the agents file', () => {
  it('names the owner and what each agent may do, nothing more', async () => {
    const res = await worker.fetch(new Request('https://host.test/.well-known/mega-pulse.json'), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      owner: 'own-test',
      agents: {
        pulse: { wakes: 'pulse', may: ['answer'] },
        'test-writer': { wakes: 'test', may: ['test'] },
      },
    });
  });

  it('gives no agent a tracker action', () => {
    const may = Object.values(agentsFile('x').agents).flatMap((a) => a.may);
    for (const action of ['comment', 'label', 'close', 'reopen']) expect(may).not.toContain(action);
  });
});

describe('POST /', () => {
  it('401s a ping with a wrong signature', async () => {
    const res = await worker.fetch(signed(pulse, { key: Buffer.from('some other key, not the right one') }), env);
    expect(res.status).toBe(401);
  });

  it('401s a ping older than 5 minutes', async () => {
    const res = await worker.fetch(signed(pulse, { timestamp: Math.floor(Date.now() / 1000) - 400 }), env);
    expect(res.status).toBe(401);
  });

  it('401s a ping with no signature headers', async () => {
    const res = await worker.fetch(new Request('https://host.test/', { method: 'POST', body: '{}' }), env);
    expect(res.status).toBe(401);
  });

  it('401s every ping when the host has no ping key', async () => {
    const res = await worker.fetch(signed(pulse), { ...env, PING_KEY: undefined as unknown as string });
    expect(res.status).toBe(401);
  });

  it('400s a signed ping whose reply address is not the course', async () => {
    const res = await worker.fetch(signed({ ...pulse, reply: 'https://elsewhere.test/reply' }), env);
    expect(res.status).toBe(400);
  });

  it('400s a signed ping of an unknown kind', async () => {
    expect((await worker.fetch(signed({ ...pulse, kind: 'deploy' }), env)).status).toBe(400);
  });

  describe('a signed test ping', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it('sends the test to the reply address, answers 200, and keeps the test out of the HTTP body', async () => {
      const seen = stubNetwork();
      const logged = vi.spyOn(console, 'log').mockImplementation(() => {});

      const res = await worker.fetch(signed(testPing), env);

      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toBe(`sent ${TEST_ANSWER.path}, reply address said 202 | red: ${TEST_ANSWER.red}\n`);
      expect(body).not.toContain(SOURCE_MARK);

      expect(seen.map((req) => `${req.method} ${req.url}`)).toEqual([
        `GET ${TRACKER_ISSUE}`,
        `POST ${RESPONSES_URL}`,
        `POST ${testPing.reply}`,
      ]);
      expect(seen[1]?.headers.authorization).toBe(`Bearer ${env.OPENAI_API_KEY}`);
      expect(seen[2]?.body).toEqual(TEST_ANSWER);

      // Two log lines: the outcome, then the whole test for calibration.
      const lines = logged.mock.calls.map((call) => String(call[0]));
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe(`ping msg_1: test, sent ${TEST_ANSWER.path}, reply address said 202 | red: ${TEST_ANSWER.red}`);
      expect(lines[0]).not.toContain(SOURCE_MARK);
      expect(lines[1]).toBe(`ping msg_1: test file ${TEST_ANSWER.path}\n${TEST_ANSWER.test}`);
    });

    it('answers 502 and sends nothing when the tracker does not answer', async () => {
      const seen = stubNetwork({ tracker: 'throws' });
      const logged = vi.spyOn(console, 'log').mockImplementation(() => {});

      const res = await worker.fetch(signed(testPing), env);

      expect(res.status).toBe(502);
      expect(seen.map((req) => `${req.method} ${req.url}`)).toEqual([`GET ${TRACKER_ISSUE}`]);
      // No test was sent, so there is no second log line.
      expect(logged.mock.calls).toHaveLength(1);
    });
  });

  it('404s other paths and 405s other methods', async () => {
    expect((await worker.fetch(new Request('https://host.test/elsewhere'), env)).status).toBe(404);
    expect((await worker.fetch(new Request('https://host.test/'), env)).status).toBe(405);
  });
});

describe('isCourseAddress', () => {
  it('holds for an https address on the course origin only', () => {
    const course = 'https://course.test';
    expect(isCourseAddress('https://course.test/rig/reply/abc', course)).toBe(true);
    expect(isCourseAddress('https://course.test.example.com/rig/reply', course)).toBe(false);
    expect(isCourseAddress('https://course.test@example.com/rig/reply', course)).toBe(false);
    expect(isCourseAddress('http://course.test/rig/reply', course)).toBe(false);
    expect(isCourseAddress('not a url', course)).toBe(false);
    expect(isCourseAddress(undefined, course)).toBe(false);
  });
});

describe('readPing', () => {
  it('reads a pulse ping, with or without a phrase', () => {
    expect(readPing(pulse, env.COURSE_URL)).toEqual(pulse);
    const { phrase: _phrase, text: _text, ...bare } = pulse;
    expect(readPing(bare, env.COURSE_URL)).toMatchObject({ kind: 'pulse', reply: pulse.reply });
  });

  it('refuses a pulse ping whose tracker is not the course', () => {
    expect(readPing({ ...pulse, tracker: 'https://elsewhere.test/issues' }, env.COURSE_URL)).toBe(
      'tracker is not a course address',
    );
  });

  it('reads a test ping', () => {
    expect(readPing(testPing, env.COURSE_URL)).toEqual(testPing);
  });

  it('refuses a test ping with no issue number or with a file that is not text', () => {
    const test = { ...testPing, files: {} };
    expect(readPing({ ...test, issue: '12' }, env.COURSE_URL)).toBe('issue is not a number');
    expect(readPing({ ...test, files: { a: 1 } }, env.COURSE_URL)).toBe('a file is not text');
  });
});
