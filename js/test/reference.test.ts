// The engine must reproduce, for every trace and algorithm, the output of the independent Python
// reference implementation (traces/expected, regenerated with python -m os_concepts_simulator.cli).

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { simulate } from "../src/engine/simulate.ts";
import { parseTrace } from "../src/engine/trace.ts";
import { ALGORITHMS } from "../src/engine/types.ts";

const traces = new URL("../../traces/", import.meta.url);
const expectedDir = new URL("expected/", traces);

/** Compares numbers to 1e-12 and everything else exactly. */
function same(got: unknown, want: unknown, path: string): void {
  if (typeof want === "number" && typeof got === "number") {
    assert.ok(Math.abs(got - want) <= 1e-12 * Math.max(1, Math.abs(want)), `${path}: ${got} != ${want}`);
  } else if (Array.isArray(want)) {
    assert.ok(Array.isArray(got) && got.length === want.length, `${path}: length differs`);
    want.forEach((w, i) => same((got as unknown[])[i], w, `${path}[${i}]`));
  } else if (want !== null && typeof want === "object") {
    assert.ok(got !== null && typeof got === "object", `${path}: not an object`);
    const g = got as Record<string, unknown>;
    const w = want as Record<string, unknown>;
    assert.deepEqual(Object.keys(g).sort(), Object.keys(w).sort(), `${path}: keys differ`);
    for (const k of Object.keys(w)) same(g[k], w[k], `${path}.${k}`);
  } else {
    assert.equal(got, want, path);
  }
}

const files = readdirSync(traces).filter((f) => f.endsWith(".json")).sort();

test("there are traces and an expected file for each algorithm", () => {
  assert.ok(files.length >= 9);
  const expected = new Set(readdirSync(expectedDir));
  for (const f of files) for (const a of ALGORITHMS) assert.ok(expected.has(f.replace(/\.json$/, `.${a}.json`)), `missing expected for ${f} ${a}`);
});

for (const f of files) {
  test(`matches the Python reference: ${f}`, () => {
    const trace = parseTrace(JSON.parse(readFileSync(new URL(f, traces), "utf8")));
    for (const alg of ALGORITHMS) {
      const want: unknown = JSON.parse(readFileSync(new URL(f.replace(/\.json$/, `.${alg}.json`), expectedDir), "utf8"));
      same(JSON.parse(JSON.stringify(simulate(trace, alg))), want, `${f}:${alg}`);
    }
  });
}
