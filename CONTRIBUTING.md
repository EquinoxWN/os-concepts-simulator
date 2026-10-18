# Contributing

Thanks for helping. This is a TypeScript engine with a Python reference; issues and pull requests
are welcome.

## Set up and check your change

Needs Node.js 24+, Python 3.11+ (in a virtual environment) and make.

```bash
make setup     # npm ci and the Python reference with its dev tools
make lint      # tsc strict, ruff, mypy, expected outputs current
make test      # TypeScript and Python tests
make bench     # every algorithm on every trace
make serve     # the page on http://127.0.0.1:8080/web/
```

A pull request is ready when `make lint` and `make test` pass and CI is green.

## Guidelines

- A scheduling rule is written twice, in `js/src/engine/simulate.ts` and
  `python/src/os_concepts_simulator/schedulers.py`. Change both, run `make expected`, and commit the
  regenerated `traces/expected` files with the change.
- New traces go in `traces/` and need `make expected`; keep them within the limits in `trace.ts`.
- Add or update a test for every behaviour change, and update `docs/results/` when numbers change.
- Significant design changes need an ADR in `docs/adr/` (copy `0001` for the format).
- Keep function comments to one short phrase; let names and tests explain the rest.
- Report security problems privately, as described in [SECURITY.md](SECURITY.md).

By contributing you agree that your work is released under the [MIT License](LICENSE).
