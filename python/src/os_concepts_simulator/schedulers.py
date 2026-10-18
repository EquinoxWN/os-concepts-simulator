"""Reference CPU schedulers, written independently of the TypeScript engine.

The rules are the same as in js/src/engine/simulate.ts: at each tick new arrivals join the ready
queue first (trace order); fcfs, sjf and priority are non-preemptive; srtf and rr preempt; ties go
to the earlier arrival, then the earlier trace position; an expired round-robin job rejoins the
queue behind same-tick arrivals; the CPU idles until the next arrival when nothing is ready.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

ALGORITHMS = ("fcfs", "sjf", "srtf", "rr", "priority")
DEFAULT_QUANTUM = 2
ID = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
MAX_JOBS, MAX_BURST, MAX_ARRIVAL, MAX_TOTAL = 2000, 10_000, 1_000_000, 1_000_000


@dataclass(frozen=True)
class Job:
    """One job: id, arrival tick, CPU burst in ticks, priority (lower is more important)."""

    id: str
    arrival: int
    burst: int
    priority: int = 0


@dataclass
class _State:
    """A job's progress during a run."""

    job: Job
    index: int
    remaining: int
    first_run: int | None = None
    completion: int | None = None


@dataclass
class Run:
    """Timeline segments and per-job states of a finished run."""

    timeline: list[dict[str, Any]] = field(default_factory=list)

    def record(self, job: str | None, start: int, end: int) -> None:
        """Append a segment, merging with the previous one when the same job continues."""
        if self.timeline and self.timeline[-1]["job"] == job and self.timeline[-1]["end"] == start:
            self.timeline[-1]["end"] = end
        else:
            self.timeline.append({"job": job, "start": start, "end": end})


def parse_trace(doc: Any) -> tuple[str, list[Job]]:
    """Validate a trace document and return its name and jobs."""
    if not isinstance(doc, dict) or not isinstance(doc.get("name"), str) or not 1 <= len(doc["name"]) <= 64:
        raise ValueError("trace needs a name of 1..64 characters")
    raw = doc.get("jobs")
    if not isinstance(raw, list) or not 1 <= len(raw) <= MAX_JOBS:
        raise ValueError(f"trace needs 1..{MAX_JOBS} jobs")
    jobs: list[Job] = []
    seen: set[str] = set()
    for i, j in enumerate(raw):
        if not isinstance(j, dict) or not isinstance(j.get("id"), str) or not ID.match(j["id"]) or j["id"] in seen:
            raise ValueError(f"job {i}: missing, invalid or duplicate id")
        seen.add(j["id"])
        vals = [j.get("arrival"), j.get("burst"), j.get("priority", 0)]
        bounds = [(0, MAX_ARRIVAL), (1, MAX_BURST), (0, 1000)]
        for v, (lo, hi) in zip(vals, bounds, strict=True):
            if type(v) is not int or not lo <= v <= hi:
                raise ValueError(f"job {j['id']}: arrival, burst and priority must be integers in range")
        jobs.append(Job(j["id"], vals[0], vals[1], vals[2]))
    if sum(j.burst for j in jobs) > MAX_TOTAL:
        raise ValueError("total burst too large")
    return doc["name"], jobs


def _key(alg: str, s: _State) -> tuple[int, int, int]:
    """Selection key: the algorithm's criterion, then arrival, then trace position."""
    crit = {"sjf": s.job.burst, "priority": s.job.priority, "srtf": s.remaining}.get(alg, 0)
    return (crit, s.job.arrival, s.index)


def simulate(jobs: list[Job], alg: str, quantum: int = DEFAULT_QUANTUM) -> tuple[list[_State], Run]:
    """Run one algorithm to completion."""
    if alg not in ALGORITHMS:
        raise ValueError(f"unknown algorithm {alg}")
    if not 1 <= quantum <= 1000:
        raise ValueError("quantum must be 1..1000")
    states = [_State(j, i, j.burst) for i, j in enumerate(jobs)]
    pending = sorted(states, key=lambda s: (s.job.arrival, s.index))
    run = Run()
    ready: list[_State] = []
    running: _State | None = None
    now = nxt = used = done = 0
    while done < len(states):
        while nxt < len(pending) and pending[nxt].job.arrival <= now:
            ready.append(pending[nxt])
            nxt += 1
        if running is None and not ready:
            until = pending[nxt].job.arrival
            run.record(None, now, until)
            now = until
            continue
        if alg in ("fcfs", "sjf", "priority"):
            if running is None:
                pick = ready[0] if alg == "fcfs" else min(ready, key=lambda s: _key(alg, s))
                ready.remove(pick)
                running, used = pick, 0
        elif alg == "srtf":
            candidates = [*ready, running] if running is not None else ready
            pick = min(candidates, key=lambda s: _key(alg, s))
            if pick is not running:
                if running is not None:
                    ready.append(running)
                ready.remove(pick)
                running = pick
        elif running is None or used >= quantum:  # rr: a new slice starts
            if running is not None:
                ready.append(running)
            running, used = ready.pop(0), 0
        assert running is not None
        if running.first_run is None:
            running.first_run = now
        run.record(running.job.id, now, now + 1)
        running.remaining -= 1
        used += 1
        now += 1
        if running.remaining == 0:
            running.completion = now
            done += 1
            running, used = None, 0
    return states, run


def result(name: str, jobs: list[Job], alg: str, quantum: int = DEFAULT_QUANTUM) -> dict[str, Any]:
    """The same document the TypeScript engine returns."""
    states, run = simulate(jobs, alg, quantum)
    per_job: list[dict[str, Any]] = []
    for s in states:
        assert s.completion is not None
        assert s.first_run is not None
        turnaround = s.completion - s.job.arrival
        per_job.append(
            {
                "id": s.job.id,
                "completion": s.completion,
                "turnaround": turnaround,
                "waiting": turnaround - s.job.burst,
                "response": s.first_run - s.job.arrival,
                "slowdown": turnaround / s.job.burst,
            }
        )
    n = len(per_job)
    w = t = r = sl = sl2 = mx = 0.0
    last = 0
    for j in per_job:
        w += j["waiting"]
        t += j["turnaround"]
        r += j["response"]
        sl += j["slowdown"]
        sl2 += j["slowdown"] * j["slowdown"]
        mx = max(mx, j["slowdown"])
        last = max(last, j["completion"])
    busy = sum(j.burst for j in jobs)
    makespan = last - min(j.arrival for j in jobs)
    summary = {
        "meanWaiting": w / n,
        "meanTurnaround": t / n,
        "meanResponse": r / n,
        "maxSlowdown": mx,
        "fairness": (sl * sl) / (n * sl2),
        "makespan": makespan,
        "utilization": busy / makespan,
        "dispatches": sum(1 for seg in run.timeline if seg["job"] is not None),
    }
    return {
        "trace": name,
        "algorithm": alg,
        "quantum": quantum if alg == "rr" else None,
        "jobs": per_job,
        "summary": summary,
        "timeline": run.timeline,
    }
