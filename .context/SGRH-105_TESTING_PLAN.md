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
| Recruitment request recovery | Thrown upload/download/delete failures release pending controls, preserve unsaved file/metadata and permit retry; server rejections remain errors | Component/hook regression tests plus browser upload fault injection |
| Dashboard save queue | Saves remain ordered, a failed request does not poison the queue, redirects to login are not treated as success, and gateway errors remain recoverable | Unit, HTTP mocked |
| Evaluation rollback assertion | Failed score insertion must call delete on the exact newly created evaluation ID; an error result alone no longer satisfies the test | Unit, query mocked |
| Evaluation notes | Saving confirms an actual updated row; missing or RLS-invisible evaluations return an error. The editor preserves notes and recovers from thrown requests, and changes to one field preserve the other fields | Action/component tests, real SQL policies and real PostgREST |
| Evaluation overview and rubrics | Company/active-contract predicates, history grouping, scores marked nonapplicable, signed photos, catalog read/write errors, legacy criteria and archival of referenced rubrics | Unit, query mocked |
| Evaluation deletion recovery | A thrown rubric deletion releases the pending state and permits a new confirmed retry | Hook regression tests |
| Monthly attendance | Entry/lunch tardiness remain separately ordered on the same day; a justified lunch remains visible but does not count toward warnings | Unit with query fixtures |

The Storage PGlite fixture supplies company/permission helper outputs. The relational PGlite fixture instead loads the real JWT helper functions and supplies transaction-local claims through auth.jwt(). Both execute actual policy definitions from repository migrations under a non-owner role; every SQL case rolls back writes. These fixtures are not the full schema. The additional Supabase Docker suite runs all migrations and system/catalog seeds, real Auth/PostgREST/Storage, and explicit local provisioning described in [the E2E guide](../srgh-app/tests/e2e/README.md). No hosted database is used.

## CI

The aggregate `CI passed` job now depends on coverage and browser/integration jobs in addition to the existing checks. One instrumented run enforces every include pattern from the original security config at 100% in all four metrics, plus measured module floors: attendance 87% lines/75% branches, dashboard 60%/50%, recruitment 76%/71%, evaluations 61%/46%. The original default security-only config is unchanged and remains available through test:coverage; CI does not need to run the suite twice for coverage. Untested production files remain included. Reports are retained for 14 days. Browser/integration CI starts its own local Docker stack and stops only that stack afterward. Sharded tests remain unchanged. These new jobs are configured and their commands validated locally; GitHub execution is pending publication.

## Validation and limits

- Latest local suite: 344 files and 3514 tests passed; every original security scope remained at 100% in all four metrics (38 files checked). The browser/API suite passed 16 scenarios: six browser flows on both desktop and mobile emulation, plus four HTTP integration cases.
- Typecheck, production build and lint passed; lint retains four pre-existing warnings outside this change.
- Final combined coverage run passed with 344 files/3514 tests: attendance 87.45% lines/75.11% branches, dashboard 60.10%/50.58%, recruitment 76.13%/71.08%, evaluations 61.41%/46.61%. Module floors were ratcheted to whole-number floors of this measurement.
- No successful full camera-to-browser-mark journey is claimed. Component tests verify recognition/interaction boundaries and SQL/HTTP tests verify persistence; real device camera/accuracy checks remain separate.
- The fresh local stack required an Auth hook EXECUTE grant and explicit Data API table/sequence grants. Those are visible test provisioning, not a production migration. Existing hosted environments were not queried or changed for this work.
- Browser tests currently run in Chromium. They do not establish Firefox/WebKit compatibility.
- Only local verification has run; no GitHub CI run is claimed for unpublished changes.

The continuation reproduced a thrown-delete failure before fixing it: recruitment's shared CRUD hook propagated the exception and left its pending deletion state set. It now returns a user-facing error and clears pending state in finally. Candidate document upload/download handlers use the same recovery boundary; failed uploads keep the file and metadata. A real browser test aborts an upload request before it reaches the server, then verifies preserved inputs and successful retry. This does not establish upload idempotence if a response is lost after persistence. No automatic retry or database schema change was added.

The evaluation continuation reproduced a false successful note save when UPDATE affected zero rows. updateEvaluationNotes now requests the updated ID with maybeSingle and returns an error for a missing/invisible row instead of closing the editor as saved. Real policy tests and local Auth/PostgREST tests confirm the query's zero-row behavior, including the write-only evaluator's own-row case and denial for kiosk/self-service users. The note editor and evaluation rubric deletion hook now recover from thrown requests without leaving controls stuck. Overview/catalog tests cover history grouping, nonapplicable scores, legacy rubrics, archival fallback and provider failures. Attendance tests distinguish entry/lunch tardiness and preserve justified lunch details without counting them as warnings. No hosted permissions or migrations changed.

The user explicitly requested keeping the same ticket and opening no PR. Keep SGRH-105 in progress and all commits on the same branch. Other modules may be added after these priorities if time permits. No production migrations, permissions, records or secrets are changed.

## Reproduction

### Dashboard and registration continuation

Ten DashboardBoard component cases cover personalization, visible/hidden panel
ordering, size limits, restored defaults, drag completion, save failures and
refresh only after a confirmed save. A real-browser regression reproduced widget
links retaining keyboard focus during personalization; the content wrapper now
uses `inert` while editing, and links become focusable again afterward.

Six registration-form cases use the real validation and select components for
new candidates and applications. Thrown requests previously escaped both submit
handlers. They now preserve entered data, clear the submitting state and explain
that registration could not be confirmed. Users are told to check existing
records before an explicit retry; success callbacks/navigation require a confirmed
response. This does not establish idempotence after a lost server response.

The browser/API suite now passes 16 scenarios: six browser flows in desktop
Chromium and the same six with Pixel 5 viewport/touch emulation, plus four HTTP
integration cases. Document fixtures use distinct names per browser project.
Mobile emulation is not a physical-device or cross-engine compatibility claim.

The existing EmployeeWizard suite passed all 23 tests in isolation after one
test timed out during overlapping build/browser/coverage workloads. The subsequent full combined coverage run passed all 341 files and 3479 tests
without overlapping build/browser workloads.

### Evaluation forms and personal widgets continuation

Another 35 regression cases cover evaluation creation (9), rubric creation/editing
(7), personal dashboard widgets (17) and kiosk verification (2). Evaluation form
tests use the real schema/select/notes controls and an ISO date-input boundary;
the date picker's own mechanics are outside these cases. Unsaved-state acceptance
is a spy boundary, not a replacement for the existing unsaved-changes tests.

The first run reproduced rejected-request failures in evaluation creation and in
both rubric modes. Evaluation submission now releases its pending state in
finally, while rubric forms return a visible error to React Hook Form. Both keep
the draft and only accept changes/call success after a confirmed result. Error
copy asks users to inspect existing records before manually retrying; no automatic
retry or idempotence guarantee is introduced. Evaluation navigation keeps other
query filters, and the redundant second acceptChanges call was removed.

Personal widgets cover empty states, today's schedule, keyboard/pointer day
selection, holidays/day-off precedence, missing hours, fractional totals,
evaluation history previews/trend suppression, branch percentages and overflow
headcounts. The CountUp browser boundary requests reduced motion in these tests.

A thrown facial verification request also reproduced an uncaught rejection.
KioskScreen now reports verification failure instead of allowing FaceScan to
misclassify the network failure as camera unavailability. Explicit retry returns
to recognition; neither retry nor successful recognition registers attendance.
Pending verification exposes no mark buttons. Camera/inference remain mocked.

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
