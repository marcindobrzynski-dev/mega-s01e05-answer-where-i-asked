---
id: 3
title: "Pulse: one line when a check fails"
state: open
labels: []
created: 2026-11-10T23:06:27+01:00
closed: null
---

plan: pulse §4.

Scope: the failure path of the `pulse` agent.

- No phrase in the ping, the tracker does not answer, nothing is open, or the model's answer fails the check in #2: answer `pulse stopped: <what failed>`, one line, to the reply address, and stop. No guess, no silence.
- That line counts as finished work: `200` to the course.

Blocked by: #2

Done when: each failed check (no phrase, no tracker, nothing open, bad model answer) leaves exactly one `pulse stopped: ...` line at the reply address.
