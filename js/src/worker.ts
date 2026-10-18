// Web Worker entry: runs simulations off the page's main thread, so no server is needed and the
// page stays responsive. Messages: {type: "run", id, trace, algorithms?, quantum?} in,
// {type: "result", id, results} or {type: "error", id, message} out.

import { compareAll, simulate } from "./engine/simulate.ts";
import { parseTrace } from "./engine/trace.ts";
import { ALGORITHMS, type Algorithm, type Result } from "./engine/types.ts";

/** A reply to the page. */
export type Reply = { type: "result"; id: number; results: Result[] } | { type: "error"; id: number | null; message: string };

/** Validates one request and runs it; never throws. */
export function handle(data: unknown): Reply {
  let id: number | null = null;
  try {
    if (typeof data !== "object" || data === null) throw new Error("message must be an object");
    const m = data as Record<string, unknown>;
    if (typeof m["id"] === "number" && Number.isInteger(m["id"])) id = m["id"];
    if (m["type"] !== "run" || id === null) throw new Error('expected {type: "run", id: integer, trace}');
    const trace = parseTrace(m["trace"]);
    const quantum = m["quantum"] === undefined ? undefined : Number(m["quantum"]);
    const opts = quantum === undefined ? {} : { quantum };
    const algs = m["algorithms"];
    if (algs === undefined) return { type: "result", id, results: compareAll(trace, opts) };
    if (!Array.isArray(algs) || algs.length === 0 || !algs.every((a): a is Algorithm => (ALGORITHMS as readonly unknown[]).includes(a))) {
      throw new Error(`algorithms must be a non-empty list of ${ALGORITHMS.join(", ")}`);
    }
    return { type: "result", id, results: algs.map((a) => simulate(trace, a, opts)) };
  } catch (e) {
    return { type: "error", id, message: e instanceof Error ? e.message : String(e) };
  }
}

/** The worker global, typed by what this file uses. */
interface WorkerScope {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage(message: Reply): void;
}

const scope = (globalThis as unknown as { self?: WorkerScope }).self;
if (scope !== undefined && typeof scope.postMessage === "function" && !("document" in globalThis)) {
  scope.onmessage = (ev) => scope.postMessage(handle(ev.data));
}
