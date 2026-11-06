# SGRH-105 — Automated testing improvements

Base: `dev` at `113975d6c9a5d3427a4c2610a28293e5ecacb375`.
Branch: `test/SGRH-105-system-test-coverage`.

## Implemented scope

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
| Attendance isolation | Real JWT helpers and SELECT/INSERT/UPDATE/DELETE policies enforce employee ownership, company isolation and single/multiple assigned branches; direct kiosk table access is blocked | SQL integration, PGlite |
| Recruitment records | Actual candidate/document/application policies restrict reads and writes by company and permission; joins do not expose foreign candidates | SQL integration, PGlite |
| Dashboard summaries | Approved absences, full-day vs intraday counts, missing joined people, staffing, evaluation scores, expiring contracts and provider failures | Unit, query mocked |
| Candidate history | Stages/scores stay associated with their application; optional joins have safe fallbacks; dependent read failures remain errors | Unit, query mocked |
| Kiosk interaction | Recognition alone never registers entry; a double tap while saving submits one mark | Component, verification mocked |
| Browser flows | Real login, preferences persisted after reload, candidate document validation recovery/upload/signed download, foreign candidate denial and kiosk role restrictions | Playwright with isolated Supabase |
| Atomic mark HTTP | Actual PostgREST RPC retries persist exactly one row, reject altered content and deny anonymous/kiosk callers | HTTP integration with isolated Supabase |

The Storage PGlite fixture supplies company/permission helper outputs. The relational PGlite fixture instead loads the real JWT helper functions and supplies transaction-local claims through auth.jwt(). Both execute actual policy definitions from repository migrations under a non-owner role; every SQL case rolls back writes. These fixtures are not the full schema. The additional Supabase Docker suite runs all migrations and system/catalog seeds, real Auth/PostgREST/Storage, and explicit local provisioning described in [the E2E guide](../srgh-app/tests/e2e/README.md). No hosted database is used.

## CI

The aggregate `CI passed` job now depends on coverage and browser/integration jobs in addition to the existing checks. Coverage runs the unchanged 100% security gate plus a separate module config with measured progressive floors: attendance 87% lines/74% branches, dashboard 42%/33%, recruitment 68%/66%. Untested production files remain included. Reports are retained for 14 days. Browser/integration CI starts its own local Docker stack and stops only that stack afterward. Sharded tests remain unchanged. These new jobs are configured and their commands validated locally; GitHub execution is pending publication.

## Validation and limits

- Local suite: 330 files and 3416 tests passed; security coverage remained 100% in all four metrics. The new browser/API suite passed six scenarios.
- Typecheck, production build and lint passed; lint retains four pre-existing warnings outside this change.
- Final module gate passed with 330 files/3416 tests: attendance 87.35% lines/74.43% branches, dashboard 42.93%/33.45%, recruitment 68.19%/66.75%.
- No successful full camera-to-browser-mark journey is claimed. Component tests verify recognition/interaction boundaries and SQL/HTTP tests verify persistence; real device camera/accuracy checks remain separate.
- The fresh local stack required an Auth hook EXECUTE grant and explicit Data API table/sequence grants. Those are visible test provisioning, not a production migration. Existing hosted environments were not queried or changed for this work.
- Browser tests currently run in Chromium. They do not establish Firefox/WebKit compatibility.
- Only local verification has run; no GitHub CI run is claimed for unpublished changes.

The user explicitly requested keeping the same ticket and opening no PR. Keep SGRH-105 in progress and all commits on the same branch. Other modules may be added after these priorities if time permits. No production migrations, permissions, records or secrets are changed.

## Reproduction

From `srgh-app`:

```powershell
pnpm test:coverage --maxWorkers=4
pnpm test:coverage:modules --maxWorkers=4
pnpm typecheck
pnpm lint
pnpm build
```

For the real browser/API suite, follow [tests/e2e/README.md](../srgh-app/tests/e2e/README.md). For a broader diagnostic beyond the gated modules, keep reports outside `.next` because the production build clears that directory. CLI zero thresholds below apply only to this diagnostic command; they do not modify the security thresholds in the committed config or the CI gate:

```powershell
pnpm exec vitest run --maxWorkers=4 --coverage --coverage.include=src/modules/** --coverage.include=src/lib/** --coverage.include=src/components/** --coverage.include=src/hooks/** --coverage.reporter=json-summary --coverage.reportsDirectory=coverage/testing-105 --coverage.thresholds.lines=0 --coverage.thresholds.functions=0 --coverage.thresholds.branches=0 --coverage.thresholds.statements=0
```
