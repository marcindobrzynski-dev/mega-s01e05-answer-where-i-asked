---
id: 3
title: "Pulse: one line when a check fails"
state: closed
labels: []
created: 2026-11-10T23:06:27+01:00
closed: 2026-11-11T16:53:41+01:00
---

plan: pulse §4.

Scope: the failure path of the `pulse` agent.

- No phrase in the ping, the tracker does not answer (or answers in a wrong shape), nothing is open, the model's answer cannot be used (a refusal, an incomplete response, JSON off the schema), or it fails the check in #2: answer `pulse stopped: <what failed>`, one line, to the reply address, and stop. No guess, no silence.
- The line says what failed, for example `pulse stopped: the answer names #9, which is not open`.
- Not a stopped line: the model does not answer at all (network, timeout, `429`, `5xx`). That is `5xx` to the course (#2), so the one answer for the ping is not spent.
- That line counts as finished work: `200` to the course.

Blocked by: #2

Done when: each failed check (no phrase, no tracker, nothing open, bad model answer) leaves exactly one `pulse stopped: ...` line at the reply address.

## Closing comment

done: each failed check sends exactly one pulse stopped line to the reply address; shown by the worker tests, no real ping took this path
worker: Claude Code · claude-fable-5-2 with Opus and Sonnet subagents · default
commit: de08ccd
