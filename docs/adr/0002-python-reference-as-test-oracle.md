# ADR 0002: Test the TypeScript engine against a Python reference, built in M1

- **Status:** Accepted

## Context

A scheduling simulator is easy to get subtly wrong: an off-by-one in when arrivals join the queue,
a different tie-break, a round-robin job re-queued ahead of instead of behind a new arrival. Each
mistake still produces plausible numbers. Textbook examples catch some of these, but they are
small and mostly start every job at time 0. The roadmap puts Python reference implementations in
M3; without them, M1's claims about "the same traces" rest on the engine checking itself.

## Decision

Write the Python reference in M1. It implements the same written rules in a different language
and style (a single loop over plain lists), with no shared code. It generates
`traces/expected/<trace>.<algorithm>.json` for every trace, and the TypeScript tests require the
engine to reproduce every file: integers exactly, floats within 1e-12. CI also fails when the
expected files are stale. Both implementations are separately tested against textbook results.

## Consequences

- 45 trace and algorithm pairs, including a 1,000-job random trace, are checked on every push;
  a rule change has to be made in both places and regenerated, which makes it deliberate.
- Twice the scheduling code to maintain, and the reference shares the author's reading of the
  rules, so a misunderstanding of a rule would be reproduced in both. The textbook tests (OSTEP,
  Operating System Concepts) guard against that.
- The M3 roadmap item is partly delivered early; M3 still adds the animated interface.
- Summary floats agree because both sides sum in trace order with IEEE-754 doubles; if an
  implementation changes the order, the 1e-12 tolerance still holds for these sizes.
