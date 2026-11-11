// Sends a made-up signed ping to a local Worker (`pnpm dev`), the way the course would.
// Reads the ping key from .dev.vars; never prints it. Run from worker/:
//
//   node scripts/ping.mjs [pulse|test] [--old] [--tamper] [--wrong-key] [--bad-reply] [--url <address>] [--base <folder>]
//
//   --old        timestamp 400 s in the past        → 401
//   --tamper     body changed after signing         → 401
//   --wrong-key  signed with another key            → 401
//   --bad-reply  reply address is not the course's  → 400
//   --base       a `test` ping carries src/digest/read.ts from this folder (the base: the project
//                before the fix) instead of from this repo

import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => (has(flag) ? args[args.indexOf(flag) + 1] : undefined);
const VALUE_FLAGS = ['--url', '--base'];
const kind = args.find((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1])) ?? 'pulse';
const url = valueOf('--url') ?? 'http://127.0.0.1:8799/';
const base = valueOf('--base') ?? '..';

if (has('--base') && (valueOf('--base') === undefined || valueOf('--base').startsWith('--'))) {
  console.error('--base needs a folder');
  process.exit(2);
}

if (!/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?\//.test(url)) {
  console.error('This script signs with the real ping key: local addresses only.');
  process.exit(2);
}

const match = /^PING_KEY="?whsec_([^"\r\n]+)"?/m.exec(readFileSync('.dev.vars', 'utf8'));
if (!match) {
  console.error('No PING_KEY="whsec_..." line in .dev.vars');
  process.exit(2);
}
const key = has('--wrong-key') ? Buffer.from('some other key, not the right one') : Buffer.from(match[1], 'base64');

const course = 'https://hq.mega.dev';
const reply = has('--bad-reply') ? 'https://example.com/reply/made-up' : `${course}/rig/reply/made-up`;
const ping =
  kind === 'test'
    ? { kind: 'test', issue: 12, reply, files: { 'src/digest/read.ts': readFileSync(join(base, 'src/digest/read.ts'), 'utf8') } }
    : { kind: 'pulse', text: 'pulse? low tide', phrase: 'low tide', reply, tracker: `${course}/rig/tracker/issues` };

const body = JSON.stringify(ping);
const id = `msg_local_${Date.now()}`;
const timestamp = Math.floor(Date.now() / 1000) - (has('--old') ? 400 : 0);
const signature = createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');

const res = await fetch(url, {
  method: 'POST',
  body: has('--tamper') ? body.replace('made-up', 'made-up-2') : body,
  headers: {
    'content-type': 'application/json',
    'webhook-id': id,
    'webhook-timestamp': String(timestamp),
    'webhook-signature': `v1,${signature}`,
  },
});
console.log(`${res.status} ${(await res.text()).trim()}`);
