.PHONY: setup lint test expected build serve bench audit ci

PY ?= python
export PYTHONDONTWRITEBYTECODE := 1

setup:
	cd js && npm ci
	cd python && $(PY) -m pip install --upgrade pip && $(PY) -m pip install -e ".[dev]" "setuptools>=80"

# tsc strict over engine, worker, page, scripts and tests; ruff and mypy --strict for the
# Python reference; the expected outputs must match what the reference produces now.
lint:
	cd js && npm run -s lint
	cd python && $(PY) -m ruff check . && $(PY) -m ruff format --check . && $(PY) -m mypy
	cd python && $(PY) -m os_concepts_simulator.cli ../traces ../traces/expected --check

# TypeScript engine tests (including every trace against the Python reference) and the
# reference's own tests against textbook results.
test:
	cd js && npm test
	cd python && $(PY) -m pytest -q

# Regenerate traces/expected/*.json from the Python reference.
expected:
	cd python && $(PY) -m os_concepts_simulator.cli ../traces ../traces/expected

# Compile the engine, worker and page to js/dist (plain ES modules, no bundler).
build:
	cd js && npm run -s build

# The page on http://127.0.0.1:8080/web/ (a module Worker cannot load from file://).
serve: build
	cd js && npm run -s serve

# Every algorithm on every trace: the comparison tables in docs/results/m1.md.
bench:
	cd js && npm run -s compare

audit:
	cd js && npm audit --audit-level=low
	cd python && $(PY) -m pip_audit --skip-editable --cache-dir ../.tmp/pip-audit

ci: setup lint test build
