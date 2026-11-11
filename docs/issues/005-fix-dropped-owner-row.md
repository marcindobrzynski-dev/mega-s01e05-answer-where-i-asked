---
id: 5
title: "Digest: keep a row whose owner already is the placeholder"
state: closed
labels: []
created: 2026-11-10T23:06:27+01:00
closed: 2026-11-10T23:26:00+01:00
---

plan: pulse, Known issues (tracker issue #12, reopened by rook).

Scope: local only. The course tracker is read-only from here (ADR 0004).

- `src/digest/read.ts` drops every line whose owner is `—`. `runs/2026-10-04.jsonl` has 6 jobs and the digest shows 5 (job `7f3a`, 04:04 +00:00, is missing). Keep the row; a missing owner still renders as `—`.
- `plan.md` "Known issues" disagrees with the tracker (it lists #8–#11 as open and #12 as shipped). Bring it in line with ADR 0004 rule 1 (the tracker is the state; do not copy it), after the human decides how.
- This fix is what the test writer's test must go green on (#4).

Blocked by: —

Done when: the digest for 2026-10-04 shows 6 jobs and `pnpm test` is green.

## Closing comment

done: readNight keeps a row whose owner is the placeholder; plan.md points to the tracker instead of copying it
worker: Claude Code · claude-fable-5-2 · default
commit: none
