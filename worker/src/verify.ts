// Checks that a ping is from the course: Standard Webhooks (docs/course-api.md, "Pings").
// The signature is an HMAC-SHA256 over `<id>.<timestamp>.<raw body>`; the key is the bytes after
// `whsec_`, base64-decoded. Pure: the clock and the key come in as arguments.

const KEY_PREFIX = 'whsec_';
const MAX_AGE_SECONDS = 5 * 60;

interface PingToVerify {
  /** `webhook-id` header */
  id: string | null;
  /** `webhook-timestamp` header: unix seconds */
  timestamp: string | null;
  /** `webhook-signature` header: one or more `v1,<base64>`, separated by a space */
  signature: string | null;
  /** the body exactly as it arrived, before any JSON parsing */
  rawBody: string;
  /** the ping key from the host's secrets, `whsec_<base64>` */
  pingKey: string;
  nowSeconds: number;
}

type Verified = { ok: true } | { ok: false; reason: string };

function fromBase64(text: string): Uint8Array<ArrayBuffer> | null {
  if (text === '') return null;

  try {
    const bin = atob(text);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

    return bytes;
  } catch {
    return null;
  }
}

export async function verifyPing(ping: PingToVerify): Promise<Verified> {
  const keyBytes = ping.pingKey.startsWith(KEY_PREFIX) ? fromBase64(ping.pingKey.slice(KEY_PREFIX.length)) : null;
  if (!keyBytes) return { ok: false, reason: 'no ping key on the host' };

  if (!ping.id || ping.timestamp === null || !ping.signature) return { ok: false, reason: 'missing header' };

  if (!/^\d+$/.test(ping.timestamp)) return { ok: false, reason: 'bad timestamp' };
  const sentAt = Number(ping.timestamp);
  if (ping.nowSeconds - sentAt > MAX_AGE_SECONDS) return { ok: false, reason: 'timestamp too old' };
  if (sentAt - ping.nowSeconds > MAX_AGE_SECONDS) return { ok: false, reason: 'timestamp in the future' };

  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${ping.id}.${ping.timestamp}.${ping.rawBody}`);

  for (const candidate of ping.signature.split(' ')) {
    const [version, value] = candidate.split(',', 2);
    if (version !== 'v1' || value === undefined) continue;

    const mac = fromBase64(value);
    if (!mac) continue;
    
    // subtle.verify compares in constant time; a string compare would not.
    if (await crypto.subtle.verify('HMAC', key, mac, signed)) return { ok: true };
  }
  
  return { ok: false, reason: 'no signature matches' };
}
