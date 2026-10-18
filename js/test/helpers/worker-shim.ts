// Gives the unchanged worker script the Web Worker API (self.onmessage, self.postMessage) on top of
// a Node worker thread, so the test exercises a real thread boundary.

import { parentPort } from "node:worker_threads";

interface Scope {
  onmessage: ((ev: { data: unknown }) => void) | null;
  postMessage(message: unknown): void;
}

const port = parentPort;
if (port === null) throw new Error("must run in a worker thread");
const scope: Scope = { onmessage: null, postMessage: (m) => port.postMessage(m) };
(globalThis as unknown as { self: Scope }).self = scope;
await import("../../src/worker.ts");
port.on("message", (data: unknown) => scope.onmessage?.({ data }));
