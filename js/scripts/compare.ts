// Runs every algorithm on every trace in traces/ and prints one Markdown table per trace.
// Usage: node scripts/compare.ts [quantum]

import { readdirSync, readFileSync } from "node:fs";

import { compareAll } from "../src/engine/simulate.ts";
import { parseTrace } from "../src/engine/trace.ts";

const quantum = Number(process.argv[2] ?? 2);
const dir = new URL("../../traces/", import.meta.url);
const f2 = (x: number): string => (Number.isInteger(x) ? String(x) : x.toFixed(2));

for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const trace = parseTrace(JSON.parse(readFileSync(new URL(file, dir), "utf8")));
  const total = trace.jobs.reduce((s, j) => s + j.burst, 0);
  console.log(`\n${trace.name}: ${trace.jobs.length} jobs, ${total} ticks of CPU work`);
  console.log("| algorithm | mean waiting | mean turnaround | mean response | max slowdown | fairness (Jain) | dispatches |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of compareAll(trace, { quantum })) {
    const s = r.summary;
    const name = r.quantum === null ? r.algorithm : `${r.algorithm} q=${r.quantum}`;
    console.log(`| ${name} | ${f2(s.meanWaiting)} | ${f2(s.meanTurnaround)} | ${f2(s.meanResponse)} | ${f2(s.maxSlowdown)} | ${s.fairness.toFixed(3)} | ${s.dispatches} |`);
  }
}
