// The page: reads a trace, asks the worker to run every algorithm, shows metrics and timelines.

import type { Result } from "../engine/types.ts";
import type { Reply } from "../worker.ts";

const SAMPLE = {
  name: "convoy",
  jobs: [
    { id: "A", arrival: 0, burst: 24, priority: 3 },
    { id: "B", arrival: 1, burst: 3, priority: 1 },
    { id: "C", arrival: 2, burst: 3, priority: 2 },
    { id: "D", arrival: 6, burst: 2, priority: 0 },
  ],
};

const worker = new Worker(new URL("../worker.js", import.meta.url), { type: "module" });
let nextId = 1;

/** Looks up an element that index.html must contain. */
function el<T extends HTMLElement>(id: string): T {
  const e = document.getElementById(id);
  if (e === null) throw new Error(`missing #${id}`);
  return e as T;
}

const input = el<HTMLTextAreaElement>("trace");
const quantum = el<HTMLInputElement>("quantum");
const status = el<HTMLParagraphElement>("status");
const output = el<HTMLDivElement>("output");
input.value = JSON.stringify(SAMPLE, null, 2);

/** One table row of numbers, formatted with two decimals. */
function cells(values: readonly (string | number)[]): HTMLTableRowElement {
  const tr = document.createElement("tr");
  for (const v of values) {
    const td = document.createElement("td");
    td.textContent = typeof v === "number" ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : v;
    tr.append(td);
  }
  return tr;
}

/** Renders the comparison table and a text timeline per algorithm (DOM text only, no HTML parsing). */
function render(results: readonly Result[]): void {
  const table = document.createElement("table");
  const head = cells(["algorithm", "mean waiting", "mean turnaround", "mean response", "max slowdown", "fairness", "dispatches"]);
  head.querySelectorAll("td").forEach((td) => td.setAttribute("role", "columnheader"));
  table.append(head);
  for (const r of results) {
    const s = r.summary;
    table.append(cells([r.quantum === null ? r.algorithm : `${r.algorithm} (q=${r.quantum})`, s.meanWaiting, s.meanTurnaround, s.meanResponse, s.maxSlowdown, s.fairness, s.dispatches]));
  }
  const timelines = document.createElement("pre");
  timelines.textContent = results
    .map((r) => `${r.algorithm.padEnd(8)} ${r.timeline.map((seg) => `${seg.job ?? "idle"}[${seg.start}-${seg.end})`).join(" ")}`)
    .join("\n");
  output.replaceChildren(table, timelines);
}

worker.onmessage = (ev: MessageEvent<Reply>) => {
  const reply = ev.data;
  if (reply.type === "error") {
    status.textContent = `error: ${reply.message}`;
    return;
  }
  status.textContent = `ran ${reply.results.length} algorithms in a Web Worker`;
  render(reply.results);
};

el<HTMLButtonElement>("run").addEventListener("click", () => {
  let trace: unknown;
  try {
    trace = JSON.parse(input.value);
  } catch {
    status.textContent = "error: the trace is not valid JSON";
    return;
  }
  status.textContent = "running...";
  worker.postMessage({ type: "run", id: nextId++, trace, quantum: Number(quantum.value) });
});
