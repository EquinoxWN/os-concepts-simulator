import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { Worker } from "node:worker_threads";

import { handle } from "../src/worker.ts";

const TRACE = { name: "t", jobs: [{ id: "A", arrival: 0, burst: 3 }, { id: "B", arrival: 1, burst: 1 }] };

test("handle runs every algorithm by default and a chosen subset on request", () => {
  const all = handle({ type: "run", id: 1, trace: TRACE });
  assert.equal(all.type, "result");
  if (all.type === "result") assert.deepEqual(all.results.map((r) => r.algorithm), ["fcfs", "sjf", "srtf", "rr", "priority"]);
  const two = handle({ type: "run", id: 2, trace: TRACE, algorithms: ["srtf", "rr"], quantum: 1 });
  assert.ok(two.type === "result" && two.results.length === 2 && two.results[1]!.quantum === 1);
});

test("handle answers every bad message with an error instead of throwing", () => {
  const bad: unknown[] = [
    null,
    "run",
    { type: "run" },
    { type: "other", id: 1, trace: TRACE },
    { type: "run", id: 3, trace: { name: "t", jobs: [] } },
    { type: "run", id: 4, trace: TRACE, algorithms: ["lottery"] },
    { type: "run", id: 5, trace: TRACE, algorithms: [] },
    { type: "run", id: 6, trace: TRACE, quantum: 0 },
    { type: "run", id: 7, trace: { name: "t", jobs: [{ id: "A", arrival: 0, burst: 1e9 }] } },
  ];
  for (const m of bad) {
    const r = handle(m);
    assert.equal(r.type, "error", JSON.stringify(m));
  }
  const withId = handle({ type: "run", id: 6, trace: TRACE, quantum: 0 });
  assert.ok(withId.type === "error" && withId.id === 6 && /quantum/.test(withId.message));
});

test("the worker script answers over a real thread boundary", async () => {
  const w = new Worker(new URL("./helpers/worker-shim.ts", import.meta.url));
  try {
    w.postMessage({ type: "run", id: 42, trace: TRACE, algorithms: ["fcfs"] });
    const [reply] = (await once(w, "message")) as [{ type: string; id: number; results: { summary: { meanWaiting: number } }[] }];
    assert.equal(reply.type, "result");
    assert.equal(reply.id, 42);
    assert.equal(reply.results[0]!.summary.meanWaiting, 1);
  } finally {
    await w.terminate();
  }
});
