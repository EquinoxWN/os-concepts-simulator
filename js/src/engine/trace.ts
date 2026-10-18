// Trace validation and seeded random workloads.

import type { Job, Trace } from "./types.ts";

/** Limits that keep a run small enough for a browser tab. */
export const LIMITS = { jobs: 2000, burst: 10_000, arrival: 1_000_000, totalBurst: 1_000_000, idLength: 32, priority: 1000 } as const;

const ID = /^[A-Za-z0-9_-]+$/;

/** Checks an untrusted value and returns it as a trace, or throws with the first problem found. */
export function parseTrace(value: unknown): Trace {
  if (typeof value !== "object" || value === null) throw new Error("trace must be an object");
  const v = value as Record<string, unknown>;
  const name = v["name"];
  if (typeof name !== "string" || name.length === 0 || name.length > 64) throw new Error("trace name must be 1..64 characters");
  const jobs = v["jobs"];
  if (!Array.isArray(jobs) || jobs.length === 0 || jobs.length > LIMITS.jobs) throw new Error(`trace needs 1..${LIMITS.jobs} jobs`);
  const seen = new Set<string>();
  let total = 0;
  const out: Job[] = jobs.map((raw: unknown, i: number): Job => {
    if (typeof raw !== "object" || raw === null) throw new Error(`job ${i}: must be an object`);
    const j = raw as Record<string, unknown>;
    const id = j["id"];
    if (typeof id !== "string" || !ID.test(id) || id.length > LIMITS.idLength) throw new Error(`job ${i}: id must be 1..${LIMITS.idLength} of [A-Za-z0-9_-]`);
    if (seen.has(id)) throw new Error(`job ${i}: duplicate id ${id}`);
    seen.add(id);
    const arrival = int(j["arrival"], 0, LIMITS.arrival, `job ${id}: arrival`);
    const burst = int(j["burst"], 1, LIMITS.burst, `job ${id}: burst`);
    const priority = j["priority"] === undefined ? 0 : int(j["priority"], 0, LIMITS.priority, `job ${id}: priority`);
    total += burst;
    return { id, arrival, burst, priority };
  });
  if (total > LIMITS.totalBurst) throw new Error(`total burst ${total} exceeds ${LIMITS.totalBurst}`);
  return { name, jobs: out };
}

/** Requires an integer within bounds. */
function int(value: unknown, min: number, max: number, what: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${what} must be an integer in ${min}..${max}`);
  }
  return value;
}

/** Mulberry32: a small, fast, seeded 32-bit generator returning numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random workload: n jobs, arrivals within spread ticks, bursts 1..maxBurst, priorities 0..4. */
export function randomTrace(seed: number, n: number, spread: number, maxBurst: number): Trace {
  const r = mulberry32(seed);
  const jobs: Job[] = [];
  for (let i = 0; i < n; i++) {
    jobs.push({
      id: `J${i}`,
      arrival: Math.floor(r() * (spread + 1)),
      burst: 1 + Math.floor(r() * maxBurst),
      priority: Math.floor(r() * 5),
    });
  }
  return parseTrace({ name: `random-${seed}`, jobs });
}
