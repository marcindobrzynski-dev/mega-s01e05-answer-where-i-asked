# Glossary: agents that wake alone

The words used for the pulse and the test writer (plan: pulse; ADR 0005, 0006), so that code,
issues and talk mean the same thing.

## Language

**Ping**:
A signed request from the course that wakes one agent.
_Avoid_: webhook, call, message

**Phrase**:
The short text a pulse ping carries, new in every ping. An answer that quotes it was written for that ping.
_Avoid_: question, prompt, nonce

**Reply address**:
The course address a ping carries, where the agent sends its one answer for that ping.
_Avoid_: callback, reply URL, webhook URL

**Answer**:
What an agent sends to the reply address. One per ping.
_Avoid_: reply, response, result

**Stopped line**:
An answer of the form `pulse stopped: <what failed>`, sent when a check fails. It is still an answer.
_Avoid_: error, failure message

**Status**:
What the host tells the course about a ping: the work is finished, the ping is refused, or the work failed.
_Avoid_: response, result, answer

**Open set**:
The issues the tracker shows as open at the moment one ping is handled. Read again for every ping.
_Avoid_: open issues list, backlog

**Base**:
The files a test ping carries: the code as it is before the fix. The test writer's test must fail on it.
_Avoid_: original, snapshot, old code

**Try**:
One model call made for one ping. The test writer has two at most.
_Avoid_: attempt, retry, round
