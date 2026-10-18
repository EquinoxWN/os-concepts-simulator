// A tick-by-tick CPU scheduling simulation that can be stepped, paused and resumed.
//
// Rules shared with the Python reference (python/src/os_concepts_simulator/schedulers.py):
// - At each tick, jobs whose arrival time has come join the ready queue first, in trace order.
// - fcfs, sjf and priority are non-preemptive; srtf and rr preempt.
// - Ties are broken by arrival time, then by position in the trace.
// - rr: a job whose slice ran out goes to the back of the ready queue, behind jobs that arrived
//   at the same tick.
// - When nothing is ready, the CPU idles until the next arrival.

import { ALGORITHMS, type Algorithm, type JobResult, type Options, type Result, type Segment, type StepEvent, type Summary, type Trace } from "./types.ts";
import type { Job } from "./types.ts";

interface State {
  readonly job: Job;
  readonly index: number;
  remaining: number;
  firstRun: number | null;
  completion: number | null;
}

/** The default round-robin slice. */
export const DEFAULT_QUANTUM = 2;
const MAX_QUANTUM = 1000;

/** One run of one algorithm over one trace. */
export class Simulation {
  readonly algorithm: Algorithm;
  readonly quantum: number;
  readonly trace: Trace;
  private now = 0;
  private readonly states: State[];
  private readonly arrivals: State[];
  private next = 0;
  private ready: State[] = [];
  private running: State | null = null;
  private used = 0;
  private done = 0;
  private readonly segments: Segment[] = [];

  /** Prepares a run; the trace must already be validated with parseTrace. */
  constructor(trace: Trace, algorithm: Algorithm, options: Partial<Options> = {}) {
    if (!ALGORITHMS.includes(algorithm)) throw new Error(`unknown algorithm ${String(algorithm)}`);
    const q = options.quantum ?? DEFAULT_QUANTUM;
    if (!Number.isInteger(q) || q < 1 || q > MAX_QUANTUM) throw new Error(`quantum must be an integer in 1..${MAX_QUANTUM}`);
    this.trace = trace;
    this.algorithm = algorithm;
    this.quantum = q;
    this.states = trace.jobs.map((job, index) => ({ job, index, remaining: job.burst, firstRun: null, completion: null }));
    this.arrivals = [...this.states].sort((a, b) => a.job.arrival - b.job.arrival || a.index - b.index);
  }

  /** Current simulated time. */
  get time(): number {
    return this.now;
  }

  /** True once every job has completed. */
  get finished(): boolean {
    return this.done === this.states.length;
  }

  /** Advances one tick (or one idle stretch) and describes it; null when the run is over. */
  step(): StepEvent | null {
    if (this.finished) return null;
    const arrived = this.admit();
    if (this.running === null && this.ready.length === 0) {
      const until = this.arrivals[this.next]!.job.arrival;
      const event: StepEvent = { time: this.now, running: null, ticks: until - this.now, arrived, finished: null, ready: [] };
      this.record(null, this.now, until);
      this.now = until;
      return event;
    }
    this.decide();
    const r = this.running!;
    if (r.firstRun === null) r.firstRun = this.now;
    this.record(r.job.id, this.now, this.now + 1);
    r.remaining--;
    this.used++;
    const time = this.now++;
    let finished: string | null = null;
    if (r.remaining === 0) {
      r.completion = this.now;
      this.done++;
      this.running = null;
      this.used = 0;
      finished = r.job.id;
    }
    return { time, running: r.job.id, ticks: 1, arrived, finished, ready: this.ready.map((s) => s.job.id) };
  }

  /** Runs to the end and returns the result. */
  run(): Result {
    while (this.step() !== null);
    return this.result();
  }

  /** Moves jobs that have arrived by now into the ready queue. */
  private admit(): string[] {
    const arrived: string[] = [];
    while (this.next < this.arrivals.length && this.arrivals[this.next]!.job.arrival <= this.now) {
      const s = this.arrivals[this.next++]!;
      this.ready.push(s);
      arrived.push(s.job.id);
    }
    return arrived;
  }

  /** Chooses the job for the coming tick according to the algorithm. */
  private decide(): void {
    switch (this.algorithm) {
      case "fcfs":
        if (this.running === null) this.dispatch(this.take(0));
        return;
      case "sjf":
        if (this.running === null) this.dispatch(this.take(this.best((s) => s.job.burst)));
        return;
      case "priority":
        if (this.running === null) this.dispatch(this.take(this.best((s) => s.job.priority)));
        return;
      case "srtf": {
        if (this.running !== null) this.ready.push(this.running);
        this.running = null;
        this.dispatch(this.take(this.best((s) => s.remaining)));
        return;
      }
      case "rr":
        if (this.running !== null && this.used < this.quantum) return;
        if (this.running !== null) this.ready.push(this.running);
        this.running = null;
        this.dispatch(this.take(0));
        return;
    }
  }

  /** Index of the ready job with the smallest key, ties by arrival then trace position. */
  private best(key: (s: State) => number): number {
    let bi = 0;
    for (let i = 1; i < this.ready.length; i++) {
      const a = this.ready[i]!;
      const b = this.ready[bi]!;
      const d = key(a) - key(b) || a.job.arrival - b.job.arrival || a.index - b.index;
      if (d < 0) bi = i;
    }
    return bi;
  }

  /** Removes and returns the ready job at index i. */
  private take(i: number): State {
    return this.ready.splice(i, 1)[0]!;
  }

  /** Gives the CPU to s and starts a fresh slice if it was not already running. */
  private dispatch(s: State): void {
    if (this.running !== s) this.used = 0;
    this.running = s;
  }

  /** Appends to the timeline, merging with the previous segment when the same job continues. */
  private record(job: string | null, start: number, end: number): void {
    const last = this.segments.at(-1);
    if (last !== undefined && last.job === job && last.end === start) {
      this.segments[this.segments.length - 1] = { job, start: last.start, end };
    } else {
      this.segments.push({ job, start, end });
    }
  }

  /** Per-job and whole-run metrics. */
  result(): Result {
    if (!this.finished) throw new Error("simulation has not finished");
    const jobs: JobResult[] = this.states.map((s) => {
      const turnaround = s.completion! - s.job.arrival;
      return {
        id: s.job.id,
        completion: s.completion!,
        turnaround,
        waiting: turnaround - s.job.burst,
        response: s.firstRun! - s.job.arrival,
        slowdown: turnaround / s.job.burst,
      };
    });
    return {
      trace: this.trace.name,
      algorithm: this.algorithm,
      quantum: this.algorithm === "rr" ? this.quantum : null,
      jobs,
      summary: summarize(this.trace, jobs, this.segments),
      timeline: [...this.segments],
    };
  }
}

/** Averages, fairness and utilisation; sums are taken in trace order in both implementations. */
export function summarize(trace: Trace, jobs: readonly JobResult[], timeline: readonly Segment[]): Summary {
  const n = jobs.length;
  let w = 0;
  let t = 0;
  let r = 0;
  let s = 0;
  let s2 = 0;
  let maxSlowdown = 0;
  let lastCompletion = 0;
  for (const j of jobs) {
    w += j.waiting;
    t += j.turnaround;
    r += j.response;
    s += j.slowdown;
    s2 += j.slowdown * j.slowdown;
    maxSlowdown = Math.max(maxSlowdown, j.slowdown);
    lastCompletion = Math.max(lastCompletion, j.completion);
  }
  let busy = 0;
  let firstArrival = Number.POSITIVE_INFINITY;
  for (const job of trace.jobs) {
    busy += job.burst;
    firstArrival = Math.min(firstArrival, job.arrival);
  }
  const makespan = lastCompletion - firstArrival;
  return {
    meanWaiting: w / n,
    meanTurnaround: t / n,
    meanResponse: r / n,
    maxSlowdown,
    fairness: (s * s) / (n * s2),
    makespan,
    utilization: busy / makespan,
    dispatches: timeline.filter((seg) => seg.job !== null).length,
  };
}

/** Runs one algorithm to completion. */
export function simulate(trace: Trace, algorithm: Algorithm, options: Partial<Options> = {}): Result {
  return new Simulation(trace, algorithm, options).run();
}

/** Runs every algorithm on the same trace. */
export function compareAll(trace: Trace, options: Partial<Options> = {}): Result[] {
  return ALGORITHMS.map((a) => simulate(trace, a, options));
}
