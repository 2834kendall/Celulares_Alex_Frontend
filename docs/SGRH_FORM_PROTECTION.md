# SGRH-104 — Unsaved form protection

## Behavior

The shared confirmation uses the existing brand, typography, spacing and button variants.
“Seguir editando” is the primary action and receives initial focus; “Salir sin guardar” is
secondary. Escape or clicking the backdrop keeps editing. The form stays mounted, including
selected files, and the original attempted departure runs only after confirmation.

Clean forms and reverted edits do not ask. Saving failures keep the warning active; a confirmed
success accepts the current baseline before any success callback or navigation. Requests already
being saved cannot be cancelled through this dialog. A small deduplicated status message asks the
user to wait instead of implying that navigation cancels the server operation.

## Shared integration

- `UnsavedChangesProvider` lives unconditionally in the root layout. Its registry contains
  labels, state readers and DOM roots, not a persistent copy of form data.
- `useProtectedForm` is an opt-in React Hook Form adapter with `unsavedLabel`, optional external
  values/files/busy state, `guard.bindRoot`, `guard.confirmLeave` and `guard.acceptChanges`.
  Its `reset` also establishes a new clean baseline.
- `useUnsavedChanges` covers local-state editors and supports an explicit pending-file flag.
  `useConfirmLeave` protects state changes that unmount forms, including inline CRUD editors,
  tabs and the appearance branch picker.
- `Modal` scopes X, Escape and backdrop decisions to participants inside its panel, so closing
  an unrelated clean modal does not discard or warn about another form behind it.
- `nextjs-nav-guard` is pinned to 1.1.3 for App Router links, imperative navigation and browser
  Back/Forward. No custom monkey patch of Next.js/history is maintained in this repository.
  Refresh is excluded because existing mutations use it to update data without abandoning the
  form. Authentication revocation can still navigate to login.
- Native `beforeunload` protection is attached while forms are dirty. External anchors receive
  the same in-app confirmation before departure when possible. Modified clicks, downloads and
  new-tab targets retain their normal behavior.

## Coverage

| Area | Protected editors |
| --- | --- |
| Employees | Onboarding wizard, personal/banking/address details, contracts and termination, document metadata and pending files, photo uploads, positions |
| Evaluations | Evaluation scores and notes, note editor, evaluation rubrics |
| Settings | Company data/logo, branches, kiosk registration/name/branch drafts, appearance previews and branch selection |
| Payroll | Concepts, periods, manual detail, incapacity, liquidation inputs/preview, bank-hours amount and compensation note |
| Recruitment | Candidate, application, rejection reason, stage movement note, document upload, stage columns and selection rubrics |
| Attendance | Manual marks, absence/tardiness justifications, tardiness and absence type catalogs |
| Schedules | Templates, shift types, custom hours/branch/date selection |
| Users | Invitations and assignments |

## Special cases

- Wizard step navigation preserves its data and never asks. Photo and accumulated document
  selections are included in the parent draft. A queued file already selected before its
  metadata mounts is also protected; moving to the next queued document remounts its metadata
  rather than retaining the previous file's edits.
- Hiding kiosk registration or collapsing its name editor preserves local values, so it does not
  ask. Abandoning the branch protects those values. Successful name/move operations clear only
  the corresponding pending edit.
- Appearance previews retain their existing restore behavior when a departure is confirmed.
  Restoring the default colors establishes the actual successfully saved colors as clean.
- Liquidation uses its existing RHF instance with an explicit guard. Server-proposed vacation
  days establish the field default instead of pretending they were typed by the user. Completed
  liquidations no longer count as drafts. Existing final-operation confirmations remain.
- Recruitment score autosave retains its existing status/retry UI. Pending/in-flight saves ask
  the user to wait; confirmed saves do not interrupt navigation. Failed saves remain protected.
  Explicit discard clears the failed/deferred payload instead of sending it again on unmount.
  Thrown network errors return the editor to a retryable state.
- Onboarding success still distinguishes employee creation from attachment/invitation failures;
  the protection does not retry a completed employee creation or alter server mutations.
- The header branch preview is cosmetic and retains the current form; it is not given an
  unnecessary confirmation. The appearance editor branch picker does replace the form and is
  protected.

Search/filter forms, authentication, read-only lists, continuous camera recognition and kiosk
marking do not opt into this guard. No HR data, passwords, files or biometric data are placed in
local/session storage, and this work adds no schema migrations or permissions.

## Verification and browser limits

Automated tests cover clean/reverted edits, modal dismissal, safe primary action/focus, Escape,
preserved inputs/files, busy requests, failure versus successful persistence, asynchronous
navigation decisions, modal scoping and the native unload listener. Existing form/action tests
remain in the full suite. The previous input-only backdrop test was replaced by the new
form-aware integration tests.

Native reload/tab-close dialogs use browser-controlled text and styling. Mobile app-switcher
termination can omit `beforeunload`; these warnings do not provide persistent draft recovery.
Browser/device testing must distinguish desktop viewport simulation from physical devices.

The navigation dependency documents a Next.js 16.2 issue with asynchronous query-only
`replace`. The application's relevant collaborator replacement explicitly confirms first and
then calls `replace` after accepting the baseline, avoiding that asynchronous router path.
Internal direct History API writes are not an approved way to bypass the guard.

Sources:
- https://react-hook-form.com/docs/useform/formstate
- https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event
- https://github.com/br-schneider/nextjs-nav-guard
