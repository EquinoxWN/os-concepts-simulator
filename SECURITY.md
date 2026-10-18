# Security policy

## Reporting a vulnerability

Please report security problems privately through GitHub:
**Security > Report a vulnerability** on this repository
(`https://github.com/EquinoxWN/os-concepts-simulator/security/advisories/new`). Do not open a public issue.

Include what you found, how to reproduce it, and the impact you expect. You will get an answer
within 7 days. Fixes are released as soon as they are ready, and you are credited unless you ask
not to be.

## Supported versions

This project is pre-1.0. Only the latest commit on `main` receives fixes.

## Scope

- **In scope:** a trace or worker message that hangs, crashes or injects markup into the page; the
  static server serving files outside `dist/` or listening beyond loopback; the Python reference
  writing outside the folder it is given.
- **Out of scope:** scheduling results that follow the documented rules but differ from another
  textbook's conventions.

## How this repository protects itself

- Traces are validated before simulation: types, integer ranges, id characters, unique ids, at most
  2,000 jobs, bursts up to 10,000 and 1,000,000 ticks in total.
- The worker never throws: every bad message gets an error reply. The page writes results with
  DOM text nodes only and declares a Content Security Policy (`default-src 'self'`).
- The static server answers only GET for known file types inside `dist/`, refuses paths that leave
  the root or contain NUL bytes, sends `nosniff` and binds to 127.0.0.1.
- Exact `typescript` and `@types/node` versions with a lockfile; no runtime dependencies.
- Every GitHub Action is pinned to a full commit SHA, and workflows run with read-only
  permissions and without persisted credentials.
- Dependabot update pull requests are paused (`open-pull-requests-limit: 0`) so the repository keeps a single `main` branch; dependencies are updated by hand and checked by the CI audit.
- CI runs tsc strict, ruff, mypy --strict, both test suites, npm audit and pip-audit on every push and pull request.
