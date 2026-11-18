import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPing } from '../src/verify.js';

// A made-up key, never the course's.
const KEY_BYTES = Buffer.from('a made-up ping key for the tests');
const PING_KEY = `whsec_${KEY_BYTES.toString('base64')}`;
const OTHER_KEY = `whsec_${Buffer.from('some other key, not the right one').toString('base64')}`;

const NOW = 1_794_000_000;
const ID = 'msg_2f6c';
const BODY = '{"kind":"pulse","phrase":"low tide"}';

function sign(id: string, timestamp: number | string, body: string, key: Buffer = KEY_BYTES): string {
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')}`;
}

function ping(over: Partial<Parameters<typeof verifyPing>[0]> = {}) {
  return {
    id: ID,
    timestamp: String(NOW),
    signature: sign(ID, NOW, BODY),
    rawBody: BODY,
    pingKey: PING_KEY,
    nowSeconds: NOW,
    ...over,
  };
}

describe('verifyPing', () => {
  it('accepts a ping signed with the ping key', async () => {
    expect(await verifyPing(ping())).toEqual({ ok: true });
  });

  it('refuses a ping signed with another key', async () => {
    const other = Buffer.from('some other key, not the right one');
    const res = await verifyPing(ping({ signature: sign(ID, NOW, BODY, other) }));
    expect(res).toEqual({ ok: false, reason: 'no signature matches' });
  });

  it('refuses a body that changed after signing', async () => {
    const res = await verifyPing(ping({ rawBody: BODY.replace('low tide', 'high tide') }));
    expect(res.ok).toBe(false);
  });

  it('refuses a signature moved to another ping id', async () => {
    expect((await verifyPing(ping({ id: 'msg_other' }))).ok).toBe(false);
  });

  it('accepts when any of the space-separated signatures matches (key change)', async () => {
    const old = sign(ID, NOW, BODY, Buffer.from('the key before the change........'));
    expect(await verifyPing(ping({ signature: `${old} ${sign(ID, NOW, BODY)}` }))).toEqual({ ok: true });
    expect(await verifyPing(ping({ signature: `${sign(ID, NOW, BODY)} ${old}` }))).toEqual({ ok: true });
  });

  it('skips signatures of a version it does not know', async () => {
    const v2 = sign(ID, NOW, BODY).replace('v1,', 'v2,');
    expect((await verifyPing(ping({ signature: v2 }))).ok).toBe(false);
    expect(await verifyPing(ping({ signature: `${v2} ${sign(ID, NOW, BODY)}` }))).toEqual({ ok: true });
  });

  it('refuses a ping older than 5 minutes', async () => {
    const then = NOW - 301;
    const res = await verifyPing(ping({ timestamp: String(then), signature: sign(ID, then, BODY) }));
    expect(res).toEqual({ ok: false, reason: 'timestamp too old' });
  });

  it('accepts a ping exactly 5 minutes old', async () => {
    const then = NOW - 300;
    expect(await verifyPing(ping({ timestamp: String(then), signature: sign(ID, then, BODY) }))).toEqual({ ok: true });
  });

  it('refuses a ping from more than 5 minutes ahead', async () => {
    const then = NOW + 301;
    const res = await verifyPing(ping({ timestamp: String(then), signature: sign(ID, then, BODY) }));
    expect(res).toEqual({ ok: false, reason: 'timestamp in the future' });
  });

  it('refuses a timestamp that is not a whole number of seconds', async () => {
    for (const timestamp of ['', 'soon', '1e9', '12.5', ' 1794000000']) {
      const res = await verifyPing(ping({ timestamp, signature: sign(ID, timestamp, BODY) }));
      expect(res).toEqual({ ok: false, reason: 'bad timestamp' });
    }
  });

  it('refuses a ping with a header missing', async () => {
    expect(await verifyPing(ping({ id: null }))).toEqual({ ok: false, reason: 'missing header' });
    expect(await verifyPing(ping({ timestamp: null }))).toEqual({ ok: false, reason: 'missing header' });
    expect(await verifyPing(ping({ signature: null }))).toEqual({ ok: false, reason: 'missing header' });
  });

  it('refuses a signature that is not base64, without throwing', async () => {
    expect((await verifyPing(ping({ signature: 'v1,***not base64***' }))).ok).toBe(false);
    expect((await verifyPing(ping({ signature: 'v1,' }))).ok).toBe(false);
    expect((await verifyPing(ping({ signature: 'garbage' }))).ok).toBe(false);
  });

  it('refuses everything when the host has no usable ping key', async () => {
    expect(await verifyPing(ping({ pingKey: '' }))).toEqual({ ok: false, reason: 'no ping key on the host' });
    expect(await verifyPing(ping({ pingKey: 'whsec_' }))).toEqual({ ok: false, reason: 'no ping key on the host' });
    expect((await verifyPing(ping({ pingKey: OTHER_KEY }))).ok).toBe(false);
  });
});
