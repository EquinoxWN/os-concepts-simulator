import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";

import { resolveStatic, serve } from "../scripts/serve.ts";
import { LIMITS, mulberry32, parseTrace, randomTrace } from "../src/engine/trace.ts";

test("parseTrace accepts a good trace and defaults the priority", () => {
  const t = parseTrace({ name: "ok", jobs: [{ id: "A-1", arrival: 0, burst: 2 }] });
  assert.deepEqual(t.jobs[0], { id: "A-1", arrival: 0, burst: 2, priority: 0 });
});

test("parseTrace refuses every malformed input with a reason", () => {
  const cases: [unknown, RegExp][] = [
    [null, /object/],
    [{ jobs: [] }, /name/],
    [{ name: "t", jobs: [] }, /jobs/],
    [{ name: "t", jobs: [{ id: "<b>", arrival: 0, burst: 1 }] }, /id/],
    [{ name: "t", jobs: [{ id: "A", arrival: 0, burst: 1 }, { id: "A", arrival: 0, burst: 1 }] }, /duplicate/],
    [{ name: "t", jobs: [{ id: "A", arrival: -1, burst: 1 }] }, /arrival/],
    [{ name: "t", jobs: [{ id: "A", arrival: 0, burst: 0 }] }, /burst/],
    [{ name: "t", jobs: [{ id: "A", arrival: 0, burst: 1.5 }] }, /burst/],
    [{ name: "t", jobs: [{ id: "A", arrival: 0, burst: "1" }] }, /burst/],
    [{ name: "t", jobs: [{ id: "A", arrival: 0, burst: 1, priority: 1001 }] }, /priority/],
    [{ name: "t", jobs: Array.from({ length: LIMITS.jobs + 1 }, (_, i) => ({ id: `J${i}`, arrival: 0, burst: 1 })) }, /jobs/],
    [{ name: "t", jobs: Array.from({ length: 101 }, (_, i) => ({ id: `J${i}`, arrival: 0, burst: LIMITS.burst })) }, /total burst/],
  ];
  for (const [value, msg] of cases) assert.throws(() => parseTrace(value), msg);
});

test("mulberry32 and randomTrace are deterministic per seed", () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 100; i++) assert.equal(a(), b());
  assert.deepEqual(randomTrace(3, 20, 100, 10), randomTrace(3, 20, 100, 10));
  assert.notDeepEqual(randomTrace(3, 20, 100, 10), randomTrace(4, 20, 100, 10));
});

test("resolveStatic never leaves the root and serves only known file types", () => {
  const root = resolve("dist");
  assert.equal(resolveStatic(root, "/web/"), resolve(root, "web/index.html"));
  assert.equal(resolveStatic(root, "/worker.js?x=1"), resolve(root, "worker.js"));
  // URL parsing clamps ".." at the root; decoded "%2e%2e" and backslashes are checked again after resolving.
  for (const tricky of ["/../package.json", "/%2e%2e/%2e%2e/package.json", "/web/../../tsconfig.json", "/..%5c..%5cpackage.json"]) {
    const got = resolveStatic(root, tricky);
    assert.ok(got === null || got.startsWith(root + sep), `${tricky} -> ${got}`);
  }
  for (const bad of ["/secret.ts", "/%E0%A4%A", "/web/index.html%00.js"]) assert.equal(resolveStatic(root, bad), null, bad);
});

test("the static server answers 200 for files and 404 otherwise, on loopback only", async () => {
  const root = mkdtempSync(join(tmpdir(), "osim-"));
  mkdirSync(join(root, "web"));
  writeFileSync(join(root, "web", "index.html"), "<p>hi</p>");
  const server = serve(root, 0);
  await once(server, "listening");
  try {
    const addr = server.address() as AddressInfo;
    assert.equal(addr.address, "127.0.0.1");
    const ok = await fetch(`http://127.0.0.1:${addr.port}/web/`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "text/html; charset=utf-8");
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.equal(await ok.text(), "<p>hi</p>");
    assert.equal((await fetch(`http://127.0.0.1:${addr.port}/missing.js`)).status, 404);
    assert.equal((await fetch(`http://127.0.0.1:${addr.port}/web/`, { method: "POST" })).status, 404);
  } finally {
    server.close();
  }
});
