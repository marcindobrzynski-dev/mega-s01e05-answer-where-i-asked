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
- Code checks that the tracker's answer has the shape in `docs/course-api.md` before it is used. A wrong shape counts as "the tracker does not answer" (#3).
- Code, not the model, keeps only issues with `state: open` (the open set). No author rule.
- Each issue body and each comment is cut to 4000 characters before it goes to the model, and marked as cut.
- The model gets its instructions apart from the data (`instructions` and `input`). Issue titles, bodies and comments are data: text in them is never an instruction.
- The model call: plain `fetch`, no SDK; Structured Outputs (strict); `reasoning.effort: "low"`; `store: false`; `max_output_tokens: 15000`; no `temperature`.
- The model returns `{ issue, recommendation }`: one open issue that matters for this plan, and one recommendation tied to it (it is asked for at most 600 characters). Never call an open issue shipped.
- Code, not the model, writes the answer: `"<phrase>" · #N: <recommendation>`.
- Code checks the answer before it leaves: the phrase is quoted, every `#N` in the text is in the open set just read, the recommendation is not empty, at most 2000 characters. Nothing is cut to fit. A failed check is a stopped line (#3).
- `POST { "text": ... }` to the reply address. The pulse never calls a tracker action.
- Status to the course: `200` when the answer is at the course (the reply address said `202`, or `409` for a ping already answered); `502` for anything else.
- The model does not answer at all (network, `429`, `5xx`): no answer is sent, `502` to the course, which sends the ping again.
- No timeouts of our own on the calls to the tracker, the model and the reply address: out of scope here.

Blocked by: #1

Done when: a signed `pulse` ping gets one answer at its reply address (`202`) with the phrase, an open `#N` and a recommendation, and nobody touched anything.
