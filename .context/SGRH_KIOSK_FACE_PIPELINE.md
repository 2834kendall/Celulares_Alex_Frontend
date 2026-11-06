# SGRH-101 — kiosk capture and reliable marks

## Capture

- MediaPipe runs once per decoded video time, with unused blendshape output disabled.
- Losing the face, invalid framing or a hidden tab clears liveness samples, the approved proof and capture candidates. In-flight scores carry a capture generation and cannot approve a later capture.
- A failed detection and an eight-second acquisition timeout release the camera. Completion/unmount also stop its tracks. Late embedding results are ignored after unmount.
- Enrollment takes three distinct crops at least 150 ms apart. All three descriptors must agree under the existing 0.5 identity threshold; the stored descriptor is the medoid (an actual sample), preserving the existing model, 128 dimensions and raw Euclidean metric. Existing enrolled rows remain readable.
- Pixel measurements expose luminance and sharpness. Defaults reject only degenerate images; device-specific blur/exposure cutoffs remain uncalibrated. No fabricated hardware thresholds have been enabled.
- Server and client require liveness score >= 0.6 and at least five samples. This checks policy consistency, not device attestation: the browser still owns the public encryption key.
- Identification requests a recapture when two distinct employees both pass the existing MATCH threshold. A finer second-candidate margin requires validation data.

## Latency and diagnostics

GPS is requested after recognition, concurrently with mark options. The click uses coordinates already available, otherwise null; GPS remains informational and never delays saving. Absence and journey reads for mark options run concurrently. Recognition reuses authorized branch claims when present.

Set `NEXT_PUBLIC_FACE_DEBUG=true` in a development build to measure models, capture/detection, embedding, encryption, verification, options and save. Timings contain no name, employee ID, image, descriptor or encrypted payload. Leave debug off for normal use.

Worker evaluation: moving MediaPipe off-thread adds ImageBitmap transfer, runtime lifetime and GPU compatibility concerns. The current change removes duplicate-frame inference first. A Worker is not enabled without measurements on the actual kiosk. Test cold/warm starts and sustained usage before deciding whether its complexity is warranted.

## Offline and atomic persistence

One operation UUID and event timestamp are allocated before the first request and retained on retries. The queue sorts by event time, then local enqueue milliseconds, then ID. It drains on an online startup as well as reconnection. A transient failure holds later events for that employee, allowing unrelated employees to proceed. New events do not overtake that employee's pending events.

`registrar_marca_kiosco_atomica` uses a per-employment/day transaction advisory lock. The action validates ticket, company, branch, contract, absence and sequence. The function compares the current journey to that validated snapshot before insertion and rejects stale snapshots. A unique nullable operation UUID distinguishes a response-lost retry from a new mark. Only `service_role` can execute this SECURITY INVOKER function; the browser and KIOSCO account gain no direct writes or access to facial templates.

The lock coordinates kiosk RPC writes, not intentional manual corrections made by managers through other actions. Administrative schedule/absence edits are not serialized by this lock; the existing action checks remain in place. Do not remove final server validation or cache it indefinitely.

## Deployment

Apply `20261106032247_kiosk_atomic_mark.sql` before deploying this frontend. The change is additive; old clients still run and existing marks have null operation IDs. Updated clients provide retry protection; older in-flight clients cannot obtain that guarantee retroactively. No fallback to non-atomic writes is enabled if the function is missing.

The user identified `paupjapsxvufinozlhss` as **development**. The migration was applied there through Supabase MCP on November 5, 2026 (Costa Rica), and the local filename matches its remote migration version. Remote checks confirmed UUID type, SECURITY INVOKER, fixed search_path, no anon/authenticated EXECUTE, and server-only access. A nonexistent-contract probe returned invalid_contract without inserting a mark. No production project was changed.

## Verification and remaining device validation

Automated tests cover frame deduplication, interrupted/late liveness, enrollment medoid, ambiguous identities, GPS pending, chronological startup sync, per-employee ordering, response-lost retry IDs and server validation. PGlite executes the actual migration on a disposable PostgreSQL fixture to check grants, duplicate/conflicting operations and stale snapshots; it never uses hosted attendance records.

Before release, collect cold/warm p50/p95 on the actual tablet and test light/dark/backlit scenes, glasses, movement, two people, camera denial, loss/reconnection of network and a full shift of use. No camera benchmark or accuracy improvement is claimed from mocked tests. Calibrated lighting/sharpness limits and a finer ambiguity margin require that evidence.

Existing development advisories, unchanged by this migration: publicly executable SECURITY DEFINER functions and missing foreign-key indexes. Track separately; see [function privileges](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) and [foreign-key indexes](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
