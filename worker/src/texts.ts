// The texts the agents read, bundled as text with the Worker: a Worker has no disk.
// - the plan texts the pulse reads (plan §2);
// - the existing tests the test writer reads (issue #4), for their style and what they cover.
// Both lists are written by hand: a plan that moves to docs/plans/done/, or a new test in test/,
// gets a line here.
// Each is a `?raw` import: the file's text (`rules` in wrangler.jsonc, src/raw.d.ts).

import plan from '../../plan.md?raw';
import heartbeat from '../../docs/plans/done/2026-10-12-heartbeat.md?raw';
import statusBoard from '../../docs/plans/done/2026-10-19-status-board.md?raw';
import morningDigest from '../../docs/plans/done/2026-10-29-morning-digest.md?raw';
import digestTest from '../../test/digest.test.ts?raw';
import statusTest from '../../test/status.test.tsx?raw';

import type { PlanTexts } from './pulse-model.js';
import type { ExistingTest } from './test-writer.js';

export const PLAN_TEXTS: PlanTexts = {
  plan,
  done: [
    { name: '2026-10-12-heartbeat.md', text: heartbeat },
    { name: '2026-10-19-status-board.md', text: statusBoard },
    { name: '2026-10-29-morning-digest.md', text: morningDigest },
  ],
};

export const EXISTING_TESTS: ExistingTest[] = [
  { path: 'test/digest.test.ts', text: digestTest },
  { path: 'test/status.test.tsx', text: statusTest },
];
