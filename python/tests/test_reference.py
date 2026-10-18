"""The reference schedulers against textbook results worked out by hand."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from os_concepts_simulator import cli
from os_concepts_simulator.schedulers import ALGORITHMS, Job, parse_trace, result

TRACES = Path(__file__).resolve().parents[2] / "traces"


def load(name: str) -> tuple[str, list[Job]]:
    """A trace from the shared traces folder."""
    return parse_trace(json.loads((TRACES / f"{name}.json").read_text(encoding="utf-8")))


def summary(trace: str, alg: str, quantum: int = 2) -> dict[str, float]:
    """The summary of one run."""
    name, jobs = load(trace)
    s: dict[str, float] = result(name, jobs, alg, quantum)["summary"]
    return s


def test_ostep_turnaround_examples() -> None:
    # OSTEP chapter 7: three equal 10-tick jobs: FCFS average turnaround 20.
    assert summary("ostep-equal", "fcfs")["meanTurnaround"] == 20
    # A 100-tick job ahead of two 10-tick jobs: FCFS 110, SJF 50.
    assert summary("ostep-convoy", "fcfs")["meanTurnaround"] == 110
    assert summary("ostep-convoy", "sjf")["meanTurnaround"] == 50
    # The short jobs arrive at 10: SJF cannot preempt (103.33), STCF/SRTF can (50).
    assert summary("ostep-late-short", "sjf")["meanTurnaround"] == pytest.approx(310 / 3)
    assert summary("ostep-late-short", "srtf")["meanTurnaround"] == 50


def test_round_robin_response_time() -> None:
    # OSTEP: three 5-tick jobs at time 0, RR with a 1-tick slice: average response 1; SJF: 5.
    jobs = [Job(x, 0, 5) for x in "ABC"]
    assert result("rr", jobs, "rr", 1)["summary"]["meanResponse"] == 1
    assert result("sjf", jobs, "sjf")["summary"]["meanResponse"] == 5


def test_silberschatz_examples() -> None:
    # Operating System Concepts: SRTF on P1..P4 has average waiting time 6.5.
    assert summary("silberschatz-srtf", "srtf")["meanWaiting"] == 6.5
    # Non-preemptive priority on P1..P5 has average waiting time 8.2.
    assert summary("silberschatz-priority", "priority")["meanWaiting"] == pytest.approx(8.2)
    # RR with a 4-tick slice on bursts 24, 3, 3: average waiting 17/3.
    jobs = [Job("P1", 0, 24), Job("P2", 0, 3), Job("P3", 0, 3)]
    assert result("rr4", jobs, "rr", 4)["summary"]["meanWaiting"] == pytest.approx(17 / 3)


def test_timeline_merges_and_idles() -> None:
    jobs = [Job("A", 2, 3), Job("B", 10, 1)]
    doc = result("gaps", jobs, "rr", 1)
    assert doc["timeline"] == [
        {"job": None, "start": 0, "end": 2},
        {"job": "A", "start": 2, "end": 5},
        {"job": None, "start": 5, "end": 10},
        {"job": "B", "start": 10, "end": 11},
    ]
    s = doc["summary"]
    assert s["makespan"] == 9
    assert s["utilization"] == pytest.approx(4 / 9)
    assert s["dispatches"] == 2
    assert s["fairness"] == 1.0


def test_round_robin_puts_expired_job_behind_new_arrivals() -> None:
    jobs = [Job("A", 0, 4), Job("B", 2, 2)]
    timeline = [seg["job"] for seg in result("t", jobs, "rr", 2)["timeline"]]
    assert timeline == ["A", "B", "A"]


def test_every_algorithm_completes_every_trace_consistently() -> None:
    for f in sorted(TRACES.glob("*.json")):
        name, jobs = parse_trace(json.loads(f.read_text(encoding="utf-8")))
        for alg in ALGORITHMS:
            doc = result(name, jobs, alg)
            busy = sum(seg["end"] - seg["start"] for seg in doc["timeline"] if seg["job"] is not None)
            assert busy == sum(j.burst for j in jobs)
            for j, out in zip(jobs, doc["jobs"], strict=True):
                assert out["waiting"] >= 0
                assert out["response"] <= out["waiting"]
                assert out["turnaround"] == out["completion"] - j.arrival
            assert 0 < doc["summary"]["fairness"] <= 1


@pytest.mark.parametrize(
    "doc",
    [
        None,
        {"name": "x"},
        {"name": "x", "jobs": []},
        {"name": "x", "jobs": [{"id": "a b", "arrival": 0, "burst": 1}]},
        {"name": "x", "jobs": [{"id": "a", "arrival": -1, "burst": 1}]},
        {"name": "x", "jobs": [{"id": "a", "arrival": 0, "burst": 0}]},
        {"name": "x", "jobs": [{"id": "a", "arrival": 0, "burst": 1.5}]},
        {"name": "x", "jobs": [{"id": "a", "arrival": 0, "burst": 1}, {"id": "a", "arrival": 0, "burst": 1}]},
    ],
)
def test_parse_trace_rejects_bad_input(doc: object) -> None:
    with pytest.raises(ValueError):  # noqa: PT011 (each case has its own message)
        parse_trace(doc)


def test_cli_check_detects_stale_files(tmp_path: Path) -> None:
    traces = tmp_path / "traces"
    traces.mkdir()
    (traces / "t.json").write_text(json.dumps({"name": "t", "jobs": [{"id": "A", "arrival": 0, "burst": 2}]}), encoding="utf-8")
    exp = tmp_path / "expected"
    assert cli.main([str(traces), str(exp)]) == 0
    assert cli.main([str(traces), str(exp), "--check"]) == 0
    (exp / "t.fcfs.json").write_text("{}\n", encoding="utf-8")
    assert cli.main([str(traces), str(exp), "--check"]) == 1
    with pytest.raises(ValueError, match="unknown algorithm"):
        result("t", [Job("A", 0, 1)], "lottery")
