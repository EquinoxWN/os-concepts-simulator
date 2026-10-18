// Shared types of the scheduling engine. Time is in integer ticks.

/** One job of a trace. A lower priority number means a more important job. */
export interface Job {
  readonly id: string;
  readonly arrival: number;
  readonly burst: number;
  readonly priority: number;
}

/** A named workload. */
export interface Trace {
  readonly name: string;
  readonly jobs: readonly Job[];
}

/** Scheduling algorithms the engine implements. */
export const ALGORITHMS = ["fcfs", "sjf", "srtf", "rr", "priority"] as const;
export type Algorithm = (typeof ALGORITHMS)[number];

/** Options that change how an algorithm runs. */
export interface Options {
  /** Round-robin time slice in ticks. */
  readonly quantum: number;
}

/** A stretch of time during which one job (or nothing) ran. */
export interface Segment {
  readonly job: string | null;
  readonly start: number;
  readonly end: number;
}

/** Per-job outcome. */
export interface JobResult {
  readonly id: string;
  readonly completion: number;
  readonly turnaround: number;
  readonly waiting: number;
  readonly response: number;
  readonly slowdown: number;
}

/** Whole-run outcome. */
export interface Summary {
  readonly meanWaiting: number;
  readonly meanTurnaround: number;
  readonly meanResponse: number;
  readonly maxSlowdown: number;
  /** Jain's fairness index over slowdowns: 1 when every job is slowed down equally. */
  readonly fairness: number;
  readonly makespan: number;
  readonly utilization: number;
  readonly dispatches: number;
}

/** Everything one simulation produces. */
export interface Result {
  readonly trace: string;
  readonly algorithm: Algorithm;
  readonly quantum: number | null;
  readonly jobs: readonly JobResult[];
  readonly summary: Summary;
  readonly timeline: readonly Segment[];
}

/** What happened in one step, for pausing and stepping through a run. */
export interface StepEvent {
  readonly time: number;
  /** Job that ran during [time, time + ticks), or null if the CPU was idle. */
  readonly running: string | null;
  readonly ticks: number;
  readonly arrived: readonly string[];
  readonly finished: string | null;
  readonly ready: readonly string[];
}
