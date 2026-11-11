// The plan texts the pulse reads (plan §2), bundled as text with the Worker: a Worker has no disk.
// The list is written by hand: a plan that moves to docs/plans/done/ gets a line here.
// Each is a `?raw` import: the file's text (`rules` in wrangler.jsonc, src/raw.d.ts).

import plan from '../../plan.md?raw';
import heartbeat from '../../docs/plans/done/2026-10-12-heartbeat.md?raw';
import statusBoard from '../../docs/plans/done/2026-10-19-status-board.md?raw';
import morningDigest from '../../docs/plans/done/2026-10-29-morning-digest.md?raw';

import type { PlanTexts } from './pulse-model.js';

export const PLAN_TEXTS: PlanTexts = {
  plan,
  done: [
    { name: '2026-10-12-heartbeat.md', text: heartbeat },
    { name: '2026-10-19-status-board.md', text: statusBoard },
    { name: '2026-10-29-morning-digest.md', text: morningDigest },
  ],
};
