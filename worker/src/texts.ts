// The plan texts the pulse reads (plan §2), bundled as text with the Worker: a Worker has no disk.
// The list is written by hand: a plan that moves to docs/plans/done/ gets a line here.
// Imported only from index.ts, so the tests never need to load a .md file.

import plan from '../../plan.md';
import heartbeat from '../../docs/plans/done/2026-10-12-heartbeat.md';
import statusBoard from '../../docs/plans/done/2026-10-19-status-board.md';
import morningDigest from '../../docs/plans/done/2026-10-29-morning-digest.md';

import type { PlanTexts } from './model.js';

export const PLAN_TEXTS: PlanTexts = {
  plan,
  done: [
    { name: '2026-10-12-heartbeat.md', text: heartbeat },
    { name: '2026-10-19-status-board.md', text: statusBoard },
    { name: '2026-10-29-morning-digest.md', text: morningDigest },
  ],
};
