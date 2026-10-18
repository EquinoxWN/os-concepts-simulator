import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Simulation, compareAll, simulate } from "../src/engine/simulate.ts";
import { parseTrace, randomTrace } from "../src/engine/trace.ts";
import { ALGORITHMS, type Job, type Trace } from "../src/engine/types.ts";

/** A trace from the shared traces folder. */
function load(name: string): Trace {
  return parseTrace(JSON.parse(readFileSync(new URL(`../../traces/${name}.json`, import.meta.url), "utf8")));
}

/** A trace from (id, arrival, burst[, priority]) tuples. */
function jobs(...js: [string, number, number, number?][]): Trace {
  return parseTrace({ name: "t", jobs: js.map(([id, arrival, burst, priority]) => ({ id, arrival, burst, priority: priority ?? 0 })) });
}

test("OSTEP chapter 7 turnaround examples", () => {
  assert.equal(simulate(load("ostep-equal"), "fcfs").summary.meanTurnaround, 20);
  assert.equal(simulate(load("ostep-convoy"), "fcfs").summary.meanTurnaround, 110);
  assert.equal(simulate(load("ostep-convoy"), "sjf").summary.meanTurnaround, 50);
  assert.ok(Math.abs(simulate(load("ostep-late-short"), "sjf").summary.meanTurnaround - 310 / 3) < 1e-12);
  assert.equal(simulate(load("ostep-late-short"), "srtf").summary.meanTurnaround, 50);
});

test("round robin trades turnaround for response time", () => {
  const t = jobs(["A", 0, 5], ["B", 0, 5], ["C", 0, 5]);
  assert.equal(simulate(t, "rr", { quantum: 1 }).summary.meanResponse, 1);
  assert.equal(simulate(t, "sjf").summary.meanResponse, 5);
  assert.ok(simulate(t, "rr", { quantum: 1 }).summary.meanTurnaround > simulate(t, "sjf").summary.meanTurnaround);
});

test("Operating System Concepts examples", () => {
  assert.equal(simulate(load("silberschatz-srtf"), "srtf").summary.meanWaiting, 6.5);
  assert.ok(Math.abs(simulate(load("silberschatz-priority"), "priority").summary.meanWaiting - 8.2) < 1e-12);
  const t = jobs(["P1", 0, 24], ["P2", 0, 3], ["P3", 0, 3]);
  assert.ok(Math.abs(simulate(t, "rr", { quantum: 4 }).summary.meanWaiting - 17 / 3) < 1e-12);
  assert.equal(simulate(t, "fcfs").summary.meanWaiting, 17);
});

test("timeline merges runs, records idle time and counts dispatches", () => {
  const r = simulate(jobs(["A", 2, 3], ["B", 10, 1]), "rr", { quantum: 1 });
  assert.deepEqual(r.timeline, [
    { job: null, start: 0, end: 2 },
    { job: "A", start: 2, end: 5 },
    { job: null, start: 5, end: 10 },
    { job: "B", start: 10, end: 11 },
  ]);
  assert.equal(r.summary.makespan, 9);
  assert.equal(r.summary.dispatches, 2);
  assert.equal(r.summary.fairness, 1);
});

test("round robin puts an expired job behind same-tick arrivals", () => {
  const r = simulate(jobs(["A", 0, 4], ["B", 2, 2]), "rr", { quantum: 2 });
  assert.deepEqual(r.timeline.map((s) => s.job), ["A", "B", "A"]);
});

test("stepping is the same run as running, and can pause and resume", () => {
  const t = load("interactive-mix");
  for (const alg of ALGORITHMS) {
    const sim = new Simulation(t, alg);
    let ticks = 0;
    let finished = 0;
    for (let i = 0; i < 10; i++) {
      const e = sim.step();
      assert.ok(e !== null);
      ticks += e.ticks;
      if (e.finished !== null) finished++;
    }
    assert.throws(() => sim.result(), /not finished/);
    const paused = sim.time;
    for (let e = sim.step(); e !== null; e = sim.step()) {
      assert.ok(e.time >= paused);
      ticks += e.ticks;
      if (e.finished !== null) finished++;
    }
    assert.equal(finished, t.jobs.length);
    assert.deepEqual(sim.result(), simulate(t, alg));
    assert.equal(ticks, sim.result().timeline.at(-1)!.end);
  }
});

test("properties on 200 seeded random workloads", () => {
  for (let seed = 1; seed <= 200; seed++) {
    const t = randomTrace(seed, 1 + (seed % 40), seed % 3 === 0 ? 0 : 200, 25);
    const results = compareAll(t, { quantum: 1 + (seed % 5) });
    const totalBurst = t.jobs.reduce((s, j) => s + j.burst, 0);
    for (const r of results) {
      let busy = 0;
      let prevEnd = -1;
      for (const seg of r.timeline) {
        assert.ok(seg.start >= prevEnd && seg.end > seg.start, `${r.algorithm}: overlapping timeline`);
        prevEnd = seg.end;
        if (seg.job === null) continue;
        busy += seg.end - seg.start;
        const job = t.jobs.find((j: Job) => j.id === seg.job)!;
        assert.ok(seg.start >= job.arrival, `${r.algorithm}: ${job.id} ran before it arrived`);
      }
      assert.equal(busy, totalBurst, `${r.algorithm} seed ${seed}: CPU time != total burst`);
      for (const j of r.jobs) assert.ok(j.waiting >= 0 && j.response <= j.waiting);
      assert.ok(r.summary.fairness > 0 && r.summary.fairness <= 1 + 1e-12);
    }
    // SRTF minimises mean waiting time among these schedulers (no switch cost).
    const srtf = results.find((r) => r.algorithm === "srtf")!.summary.meanWaiting;
    for (const r of results) assert.ok(srtf <= r.summary.meanWaiting + 1e-9, `seed ${seed}: srtf ${srtf} > ${r.algorithm} ${r.summary.meanWaiting}`);
    // With every job present at time 0, SJF is optimal among non-preemptive schedulers.
    if (seed % 3 === 0) {
      const sjf = results.find((r) => r.algorithm === "sjf")!.summary.meanWaiting;
      for (const a of ["fcfs", "priority"] as const) assert.ok(sjf <= results.find((r) => r.algorithm === a)!.summary.meanWaiting);
    }
  }
});

test("bad algorithm and quantum are refused", () => {
  const t = jobs(["A", 0, 1]);
  assert.throws(() => simulate(t, "lottery" as never), /unknown algorithm/);
  assert.throws(() => simulate(t, "rr", { quantum: 0 }), /quantum/);
  assert.throws(() => simulate(t, "rr", { quantum: 1.5 }), /quantum/);
});
