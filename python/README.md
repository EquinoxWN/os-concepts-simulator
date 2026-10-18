# os-concepts-simulator: Python reference

Reference CPU schedulers (FCFS, SJF, SRTF, round robin, priority) written independently of the
TypeScript engine, with the same documented rules. They generate `../traces/expected/*.json`,
which the engine's tests must reproduce exactly.

```bash
python -m os_concepts_simulator.cli ../traces ../traces/expected          # regenerate
python -m os_concepts_simulator.cli ../traces ../traces/expected --check  # CI: fail if stale
pytest                                                                     # textbook cases
```

See the main [README](../README.md) and [ADR 0002](../docs/adr/0002-python-reference-as-test-oracle.md).
