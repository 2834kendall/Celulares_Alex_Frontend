# SGRH-105 — Automated testing improvements

Base: `dev` at `113975d6c9a5d3427a4c2610a28293e5ecacb375`.
Branch: `test/SGRH-105-system-test-coverage`.

## Implemented first batch

| Area | New behavior checked | Level |
| --- | --- | --- |
| Kiosk access | Invalid company claims never call the privileged RPC; network failure fails closed; a new request can retry; malformed responses do not authorize access | Unit, RPC mocked |
| Facial capture | Missing camera API, permission denied, detector failure and encryption failure never publish a facial payload; acquired camera resources are released on failure | Component, camera/inference mocked |
| Dashboard people | Missing permission/company prevents reads; query failure differs from an empty company; only active contracts count; former employee photos are not signed; birth year is not exposed | Unit, query/storage mocked |
| Optional dashboard panels | Permission checks, active roster/company predicates, personal employee predicates, date boundaries, draft exclusion and unavailable query results | Unit, query mocked |
| Dashboard preferences | Valid custom layout is restored for its owner; another browser user, malformed cookie or missing identity uses defaults | Unit, cookie mocked |
| Candidate download | Permission, missing company/record, foreign path rejection before signing, sanitized filename, download TTL and provider failure | Unit, storage mocked |
| Candidate deletion | Invalid ID, missing/invisible row, database failure, exact deletion predicate, database-before-storage ordering and best-effort cleanup | Unit, query/storage mocked |
| Candidate search | Permission even on empty searches; sanitized filter separators, ordering, result limit and provider errors | Unit, query mocked |
| Candidate applications | Validation, invisible candidate, insertion failure, authenticated company assignment, first-stage placement and refreshes | Unit, stage placement mocked |
| Candidate detail | Invalid/missing candidate, independent query failures, candidate predicates and no dependent reads without applications | Unit, query mocked |
| CV storage isolation | Actual repository storage policies execute under a non-owner PostgreSQL role against two companies; SELECT, INSERT, UPDATE and DELETE isolation, bucket restriction and unrelated permission denial | SQL integration, PGlite |

The SQL fixture replaces Auth helper outputs with transaction-local company and permission values. It executes the real storage policy migration, not a handwritten equivalent. It does not run Supabase Auth, PostgREST, signed URL expiry or Storage HTTP APIs. Every SQL test rolls back its changes; no hosted database is used.

## CI

Adds a required dependency of the aggregate `CI passed` job that runs `pnpm test:coverage`, enforces the existing 100% security thresholds and publishes an HTML/JSON coverage artifact for 14 days, including on failure when a report exists. It does not lower thresholds or claim module-wide 100% coverage. Sharded tests remain unchanged.

## Remaining work before final PR

- Extend loader success/failure cases for dashboard summaries and candidate stage/score grouping, using the coverage report to prioritize branches.
- Extend actual database policy integration for attendance, candidates and their relational records, including branch-limited access. Storage policy fixtures alone do not establish full application isolation.
- Add repeatable browser E2E for a kiosk mark with retry/no duplicate, role-specific dashboard and candidate document recovery against isolated services/fixtures.
- Publish comparable module coverage in CI and set progressive regression thresholds after measuring the final baseline, retaining the existing security gates.
- Keep real-device camera/accuracy checks explicitly separate from automated camera/inference doubles.

Do not open the final PR or close SGRH-105 based only on this first batch. Other modules may be added after these priorities if time permits. No production migrations, permissions, records or secrets are changed.

## Reproduction

From `srgh-app`:

```powershell
pnpm test:coverage --maxWorkers=4
pnpm typecheck
pnpm lint
pnpm build
```

For comparable diagnostic module coverage, keep reports outside `.next` because the production build clears that directory. CLI zero thresholds below apply only to this diagnostic command; they do not modify the security thresholds in the committed config or the CI gate:

```powershell
pnpm exec vitest run --maxWorkers=4 --coverage --coverage.include=src/modules/** --coverage.include=src/lib/** --coverage.include=src/components/** --coverage.include=src/hooks/** --coverage.reporter=json-summary --coverage.reportsDirectory=coverage/testing-105 --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```
