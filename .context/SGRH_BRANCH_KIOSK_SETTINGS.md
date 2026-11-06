# SGRH-103 — branches and logical kiosks

Configuration → Sucursales y kioscos manages branch identity, contact, address,
informational coordinates and access accounts. Tardiness remains in the existing
types-of-tardiness catalog; the retired per-branch tolerance column is not restored.

## Access model

Each logical kiosk has a server-issued UUID, one branch, a unique technical email
and one dedicated account. Multiple kiosks may use one branch and any supported
phone, tablet or computer. A corporate alias that actually receives messages is
sufficient; a separate mailbox per terminal is unnecessary. A contact address on
the branch is not an authentication account. This model controls accounts, not
physical hardware: copied credentials can open another browser. Device pairing
and hardware attestation are outside this change.

Branch configuration requires EMPRESAS_WRITE. Managing accounts additionally
requires USUARIOS_WRITE. Service-only SECURITY INVOKER RPCs revalidate the acting
administrator's live identity, company and permissions. The new kiosk/audit tables
have RLS and no anon/authenticated access. No new global role grants are required.

Kiosk operations revalidate the current user, assignment, capability, active branch
and registration on each request. React caching shares repeated checks only within
one render, never across recognition/options/save requests. KIOSCO requires exactly
one active assignment. A manager preview is validated against live ASISTENCIA_WRITE
permissions and active assigned branches as well. Missing/invalid state fails closed;
a database/network failure is retryable rather than a permanent discarded event.

Blocking or changing assignment increments an access version. New HMAC facial
tickets bind employee, expiry and company/branch/kiosk/access-version context.
Registered marks use the server kiosk ID, not a browser-supplied ID, for attribution.
The browser UUID remains a reference for the legacy/operator path only.

## Registration, recovery and existing accounts

Saving a kiosk creates a pending record; it does not send mail. Send invitation
explicitly creates Auth identity, then links the user and fixed KIOSCO assignment.
If invitation succeeds but linking fails, Complete link validates and finishes the
same record. It cannot steal a personal, employee-linked, other-role or other-company
account. Existing KIOSCO accounts are listed for explicit linking; no accounts are
silently registered or reassigned during migration. Their original behavior remains
until linking, subject to live active-account/single-branch checks.

Resend invitation retains the existing check that the user never signed in; recovery
sends the established recovery email. These actions require both management permissions.
Generic Users actions cannot alter registered kiosk identity or bypass configuration;
private deferred integrity triggers also reject direct/concurrent assignment or
employee-link changes that violate the managed-account invariant at commit. The
private SECURITY DEFINER trigger is needed to inspect global integrity across RLS
boundaries; it returns no records, fixes search_path and is not executable by
anon/authenticated or exposed as an API. Supported moves finish atomically before
the constraint is checked.
legacy KIOSCO assignments can be corrected there only with branch-administration
permission, one branch and no employee link. A partially orphaned invitation can be
recovered using Users → resend, then Complete link in Configuration.

A kiosk can be renamed. Moving it requires blocking first; it remains blocked at
the new branch until deliberately enabled. Assignment history remains in inactive
assignment rows. Audit records preserve the responsible business user, action,
entity and timestamp without copying biometric data, credentials or personal records.

## Branch lifecycle and pending marks

Branch/address saving is transactional. Address edits use copy-on-write to avoid
changing a legacy address shared with another entity. Internal codes are checked
case-insensitively under a company advisory lock; old duplicate codes are not silently
rewritten or deleted. Deactivation refuses current contracts, current/future schedules,
unfinished recent journeys and unblocked registered kiosks. It never moves staff or
deletes attendance/payroll history. Existing period/detail reads retain their branches.

Blocked/reassigned kiosks and mismatched tickets cannot submit pending events. The
existing IndexedDB archive preserves definitive rejections and their reasons; transient
failures stay queued. Configuration → Review browser pending shows current-company
contextual drafts from this browser without replaying or deleting them. Old unscoped
tickets are counted but redacted until their original context is reviewed. The view
is a reconciliation aid, not proof of attendance; check server history before any
manual correction through the attendance panel. It does not display facial proofs.

## Deployment

Apply the two SGRH-103 migrations in order before deploying the frontend:
`20261106185915_branch_kiosk_settings.sql` and
`20261106193801_protect_managed_kiosk_assignments.sql`.
No full seeds, reset, Auth user creation or existing-account migration is performed.
Do not edit an already-applied migration; subsequent database fixes need a new file.

Before switching the frontend, drain existing browser queues and let in-flight
recognitions finish. Old tickets have no context and are not accepted by the new
kiosk guard; undrained leftovers require review, never automatic reassignment.
Clearing browser data can destroy local drafts, so resolve them first.

Development project: paupjapsxvufinozlhss. Migration applied there via MCP on
November 6, 2026 and its newly generated history version aligned to the repository
filenames only. RLS, server-only execution, empty new registries and invalid-account
refusal verified. Security advisor counts unchanged from the preflight. Production
has not received SGRH-103; deployment requires separate authorization.

Tests execute the actual SQL in disposable PostgreSQL and cover tenant boundaries,
stale permissions, revocation, reassignment, address sharing and protected branch
deactivation. Component tests cover registration without email side effects,
confirmation, pending mutations, network recovery, filtering and local queue redaction.
