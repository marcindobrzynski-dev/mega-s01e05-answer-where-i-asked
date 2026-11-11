---
id: 4
title: "Test writer: fill the stub, answer the test ping"
state: open
labels: []
created: 2026-11-10T23:06:27+01:00
closed: null
---

plan: pulse §5. Rules: ADR 0006, `docs/agents/test-writer.md`.

Scope: the `test-writer` agent in the Worker. Model: `gpt-6.1-terra` through the OpenAI Responses API.

- Fill the four `_TODO_` lines under "This repo" in `docs/agents/test-writer.md`. That file, whole, is the model's instructions; it and the existing tests are bundled as text.
- On a signed `test` ping: read the issue it names from the tracker, give the model the issue, the files the ping carries (the base) and the existing tests, all as data.
- The model returns `path`, `test`, `red`. Code checks: `path` is `test/<name>.test.ts`; the test imports the code under test from `../src/`; it does not write to `runs/` or `src/`; `red` is one non-empty line; at most 20 KB. One more try on a failed check, with the reason given to the model.
- `POST { path, test, red }` to the reply address. Only that one file is ever sent.
- Both tries fail the check: send nothing, log it, `5xx` to the course (it sends the ping again).
- The Worker cannot run vitest. Before the deploy, calibrate locally: a made-up `test` ping with the base files, and the test it gives must be red on the base and green with the fix from #5.

Blocked by: #1, #5 (for the local green run)

Done when: locally, the test the agent writes for tracker issue #12 fails on the base and passes with the fix; on the host, a signed `test` ping gets one test file at its reply address (`202`).
