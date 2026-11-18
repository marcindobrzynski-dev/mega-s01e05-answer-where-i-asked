---
id: 1
title: "Worker: verify the ping, serve /.well-known/mega-pulse.json"
state: closed
labels: []
created: 2026-11-10T23:06:27+01:00
closed: 2026-11-11T16:53:41+01:00
---

plan: pulse §1.

Scope: a Cloudflare Worker (free plan) with one public https address.

- `GET /.well-known/mega-pulse.json`: `owner` is the owner code from start-challenge; agents are `pulse` (`wakes: pulse`, `may: [answer]`) and `test-writer` (`wakes: test`, `may: [test]`). Nothing more in `may`.
- `POST /`: check the ping per Standard Webhooks (`docs/course-api.md`): HMAC-SHA256 over `<id>.<timestamp>.<raw body>` with the ping key bytes, any of the space-separated signatures may match, timestamp at most 5 minutes old. Then route on `kind`.
- `reply` and `tracker` must start with the course address; otherwise treat the ping as bad.
- Secrets (ping key, model key) live in the host secrets, never in the repo.
- Status to the course: `200` when the work is finished, `401` for a bad or old ping, `5xx` when the work failed (the course sends the ping again, same id). No own memory of ping ids: a second answer gets `409` from the course.

Blocked by: —

Done when: a ping with a wrong signature or an old timestamp gets `401` and wakes nothing; the agents file returns the owner code and the two `may` lists above.

## Closing comment

done: the Worker rig-pulse answers 401 to a wrong signature or an old ping and serves the agents file with the owner code and both may lists; seen on the host
worker: Claude Code · claude-fable-5-2 · default
commit: d70eb2b
