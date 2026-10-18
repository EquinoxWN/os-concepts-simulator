# RFC 0001: os-concepts-simulator design

- **Status:** Accepted for M1
- **Author:** EquinoxWN
- **Created:** 2026-10-18

## Problem

CPU scheduling is taught with Gantt charts drawn by hand. Students see one example per algorithm,
rarely on the same workload, and never get to change the workload and watch the trade-off move:
shortest-job-first minimises waiting but starves long jobs, round robin answers quickly but
finishes everything late. Existing simulators are command-line tools or need a server.

M1 builds the engine: a scheduling simulator in TypeScript that runs in a Web Worker in the
browser, so it needs no backend, and that runs every algorithm on the same job trace and reports
waiting time, turnaround and fairness.

**Users:** students and teachers of operating systems, and engineers who want to reason about
queueing and fairness with concrete numbers.

## Define: critical-to-quality measures (CTQs)

| CTQ | Target | Measured by |
|---|---|---|
| Correct against textbooks | every worked example from OSTEP chapter 7 and Operating System Concepts reproduced exactly | engine tests, Python tests |
| Correct against an independent implementation | all 45 trace and algorithm pairs equal to the Python reference (integers exact, floats within 1e-12) | `reference.test.ts` |
| Scheduling invariants | on 200 seeded random workloads: CPU time equals total burst, no job runs before it arrives, no overlap, waiting >= 0, SRTF has the lowest mean waiting time | property test |
| No backend | the page runs every algorithm in a Web Worker; the only server is a static file server on loopback | browser check, worker thread test |
| Stepable | stepping through a run and running it give the same result; a run can be paused and resumed | engine test |
| Safe input | traces validated (types, ranges, ids, size limits); the worker answers every bad message with an error | trace and worker tests |
| Fast | all 9 traces x 5 algorithms in about a second | `npm run compare` |

## Goals (M1)

- The simulation engine is written in TypeScript and runs in a Web Worker, so it needs no backend.
- Scheduling algorithms run on the same job traces and report waiting time, turnaround and fairness.

## Non-goals

- Paging, TLB and replacement policies (M2); inodes and journaling (M2); the animated React + D3
  interface (M3). M1's page is a minimal table and text timeline that proves the worker path.
- Multiprocessor scheduling, I/O bursts, context-switch cost, MLFQ and lottery scheduling.

## Design

```
traces/*.json ──> parseTrace (validation, limits) ──> Simulation(trace, algorithm, {quantum})
                                                        step(): one tick or one idle stretch
                                                        run(): Result { jobs, summary, timeline }
page (dist/web) ──postMessage──> worker.js ──> handle(): validate, simulate, reply ──> table + timeline
python/ reference ──> traces/expected/*.json <── reference.test.ts compares every pair
```

- **Time** is integer ticks. At each tick, arrivals join the ready queue first (in trace order);
  then the algorithm chooses who runs for that tick. When nothing is ready, the CPU idles until the
  next arrival (one step).
- **Algorithms:** FCFS, SJF (non-preemptive), SRTF (preemptive shortest remaining time), round
  robin (quantum, default 2), priority (non-preemptive, lower number first). Ties: earlier arrival,
  then earlier position in the trace. An expired round-robin job rejoins the queue behind jobs that
  arrived in the same tick. These rules are written once in the engine's header and once in the
  reference's docstring.
- **Metrics per job:** completion, turnaround, waiting, response, slowdown (turnaround / burst).
  **Per run:** means, maximum slowdown, Jain's fairness index over slowdowns
  ((Σx)² / (n·Σx²), 1 when every job is slowed down equally), makespan, utilisation and dispatches
  (non-idle timeline segments).
- **Worker:** `worker.ts` exports a pure `handle(message)` and attaches it to `self.onmessage` only
  when it runs as a worker; the page posts traces and renders replies with DOM text nodes only.
  The engine compiles to plain ES modules with `tsc` (no bundler) and loads as a module worker.
- **Reference:** a Python implementation of the same rules (ADR 0002) writes `traces/expected`;
  CI fails when those files are stale or when the engine differs from them.

## Alternatives considered

| Option | Why not (yet) |
|---|---|
| Event-driven simulation (jump from arrival to completion) | Faster for long traces, but harder to step through tick by tick and to keep identical across two implementations; the tick loop runs 10,705 ticks of a 1,000-job trace for five algorithms in well under a second. |
| Running the engine on the main thread | Simpler, but a long trace would freeze the page while it runs; a worker keeps the page responsive and is what the M3 UI needs. |
| A server-side API (Node or Python) | Would add hosting, latency and an attack surface for a computation that fits in a browser tab. |
| Hand-written expected values only | Covers the textbook cases but not 1,000-job random traces; an independent reference covers both, and the textbook cases still pin it down. |
| Bundling with esbuild or Vite | Not needed for M1: `tsc` with rewritten `.ts` imports emits modules the browser loads directly. Revisit with React and D3 in M3. |

## Measurement plan

- Engine and reference tests in CI; the comparison of every algorithm on every trace
  (`make bench`) recorded in `docs/results/m1.md`.
- A manual check of the built page in Chromium (worker path, console errors), recorded with its output.

## Milestones

- **M1:** The simulation engine is written in TypeScript and runs in a Web Worker, so it needs no backend. Scheduling algorithms run on the same job traces and report waiting time, turnaround and fairness.
- **M2:** The memory module simulates paging with a TLB and replacement policies (LRU, Clock, FIFO), counting page faults. The storage module shows inodes and how journaling lets a file system recover after a simulated crash.
- **M3:** A React + D3 interface animates every step, so you can pause and compare algorithms side by side. Python reference implementations generate expected outputs used to test the TypeScript engine.

## Risks and open questions

- Tie-breaking and round-robin conventions differ between textbooks; results on hand-made traces
  depend on them. They are documented and tested, not hidden.
- The reference was written by the same author; it shares the rules (by design) but not code.
  The textbook cases are the independent check on both.
- The browser check was done once, by hand, in one browser; there is no automated browser test in CI.
