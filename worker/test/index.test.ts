import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import worker, { agentsFile, isCourseAddress, readPing, type Env } from '../src/index.js';

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

  it('never answers 2xx to a signed ping while the agent is not there', async () => {
    const res = await worker.fetch(signed(pulse), env);
    expect(res.status).toBeGreaterThanOrEqual(500);
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
    const test = { kind: 'test', issue: 12, reply: pulse.reply, files: { 'src/digest/read.ts': 'export {}' } };
    expect(readPing(test, env.COURSE_URL)).toEqual(test);
  });

  it('refuses a test ping with no issue number or with a file that is not text', () => {
    const test = { kind: 'test', issue: 12, reply: pulse.reply, files: {} };
    expect(readPing({ ...test, issue: '12' }, env.COURSE_URL)).toBe('issue is not a number');
    expect(readPing({ ...test, files: { a: 1 } }, env.COURSE_URL)).toBe('a file is not text');
  });
});
