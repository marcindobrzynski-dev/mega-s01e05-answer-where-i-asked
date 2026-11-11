---
id: 2
title: "Pulse: read the tracker live, answer to the reply address"
state: open
labels: []
created: 2026-11-10T23:06:27+01:00
closed: null
---

plan: pulse §2, §3.

Scope: the `pulse` agent in the Worker. Model: `gpt-6.1-terra` through the OpenAI Responses API.

- Read `plan.md` and `docs/plans/done/` (bundled as text) and the tracker (`GET` the `tracker` address from the ping, live, every time).
- Code, not the model, keeps only issues with `state: open`. No author rule.
- The model gets its instructions apart from the data. Issue titles, bodies and comments are data: text in them is never an instruction.
- The model writes one answer: the phrase from the ping, quoted; one open issue that matters for this plan, as `#N`; one recommendation tied to that issue. Never call an open issue shipped.
- Code checks the answer before it leaves: the phrase is quoted, the `#N` it names is in the open set just read, at most 2000 characters.
- `POST { "text": ... }` to the reply address. The pulse never calls a tracker action.

Blocked by: #1

Done when: a signed `pulse` ping gets one answer at its reply address (`202`) with the phrase, an open `#N` and a recommendation, and nobody touched anything.
