// Serves the built page from dist/ on 127.0.0.1 (a Worker module cannot load from file://).
// Usage: node scripts/serve.ts [port]   (default 8080; 0 picks a free port)

import { createReadStream, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { extname, resolve, sep } from "node:path";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".css": "text/css; charset=utf-8",
};

/** Maps a URL path to a file inside root, or null if it would leave root or is not servable. */
export function resolveStatic(root: string, urlPath: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(urlPath, "http://x").pathname);
  } catch {
    return null;
  }
  if (path.includes("\0")) return null;
  if (path.endsWith("/")) path += "index.html";
  const base = resolve(root);
  const file = resolve(base, "." + path);
  if (file !== base && !file.startsWith(base + sep)) return null;
  if (!(extname(file) in TYPES)) return null;
  return file;
}

/** Starts the static server on loopback. */
export function serve(root: string, port: number): Server {
  const server = createServer((req, res) => {
    const file = req.method === "GET" ? resolveStatic(root, req.url ?? "/") : null;
    let ok = false;
    try {
      ok = file !== null && statSync(file).isFile();
    } catch {
      ok = false;
    }
    if (!ok || file === null) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }
    const stream = createReadStream(file);
    stream.once("open", () => {
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)]!,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
      });
      stream.pipe(res);
    });
    // A read error (file removed after the stat, permissions) must not crash the server.
    stream.once("error", () => {
      if (res.headersSent) res.destroy();
      else res.writeHead(500, { "Content-Type": "text/plain" }).end("read error");
    });
  });
  return server.listen(port, "127.0.0.1");
}

/** The port from the command line: an integer in 0..65535, 8080 when absent. */
export function parsePort(arg: string | undefined): number {
  if (arg === undefined) return 8080;
  if (!/^[0-9]{1,5}$/.test(arg) || Number(arg) > 65535) throw new Error(`port must be an integer in 0..65535, got ${JSON.stringify(arg)}`);
  return Number(arg);
}

if (import.meta.main) {
  const port = parsePort(process.argv[2]);
  const root = resolve(import.meta.dirname, "..", "dist");
  const server = serve(root, port);
  server.on("listening", () => {
    const addr = server.address();
    console.log(`serving ${root} on http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : port}/web/`);
  });
}
