# SGRH-105 browser and HTTP integration tests

These tests use the real Next application, Supabase Auth, PostgREST and Storage.
They require Docker and run against the dedicated `sgrh105-e2e` local project on
API port 55421. Production and hosted development projects are never used.

## Run locally

From `srgh-app`, after `pnpm install --frozen-lockfile`:

```powershell
pnpm test:e2e:prepare
pnpm exec supabase start --workdir .e2e --exclude=studio --exclude=imgproxy --exclude=realtime --exclude=edge-runtime --exclude=vector --exclude=logflare
pnpm exec supabase status --workdir .e2e --output json > .e2e/connection.json
pnpm exec playwright install chromium
pnpm test:e2e
pnpm exec supabase stop --workdir .e2e --project-id sgrh105-e2e
```

The same commands work in the Linux CI runner; browser installation there adds
`--with-deps`. CI uses a fresh Docker stack. For a local rerun, fixtures and
candidate file cleanup are repeatable. If migrations change, provision a fresh
dedicated test stack so the restored Docker volume does not retain an old schema.

`connection.json`, copied migrations/seeds, local credentials, Next build output,
traces and HTML reports are ignored by Git. The runner refuses any API URL except
`http://127.0.0.1:55421` and any database container except
`supabase_db_sgrh105-e2e`. The E2E Next server uses a separate distDir and tsconfig;
it does not share the ordinary developer server build directory.

## Fixtures and local provisioning

`fixtures.sql` creates two fictitious companies, branches and candidates, a test
employee/contract, and ADMIN/KIOSCO accounts with a published local-only password.
It also creates evaluations in both companies for the note-update isolation tests.
The actual access-token hook generates role/company/permission claims. Tests do
not inject forged JWTs or bypass the application permission checks.

A fresh baseline had two provisioning gaps observed during this work: Auth
returned HTTP 500 because `supabase_auth_admin` lacked EXECUTE on the token hook;
PostgREST returned HTTP 403 because the new local instance did not expose public
tables to the Data API roles. The fixture explicitly grants local hook execution
and table/sequence privileges. RLS remains enabled and enforces row isolation.
These grants are test provisioning, not a new production migration or proof that
the existing hosted environments have the same problem.

## Covered flows

The suite runs six browser flows in Desktop Chrome and in Chromium with Pixel 5
viewport/touch emulation, plus four HTTP integration cases once: 16 scenarios in
total. Document names include the project name to keep both browser runs isolated.
Mobile emulation does not establish physical-device, Firefox or WebKit support.

- Real login and dashboard customization persisted through the preferences API,
  followed by reload and verification of the saved layout.
- Widget links cannot receive focus while dashboard customization is active and
  become focusable again when customization ends.
- Candidate document validation failure keeps the selected file; correcting the
  name uploads it to real Storage, persists metadata, and permits a signed
  download after reload.
- A deliberately aborted upload request never reaches the server; the browser
  preserves the selected file and metadata, and retry succeeds against real
  Storage. This does not simulate a response lost after the server committed.
- A candidate belonging to the other company displays the not-found screen and
  exposes no candidate name. App Router streaming can return HTTP 200 before
  `notFound()` resolves, so this checks the rendered result, not a fixed status.
- KIOSCO login opens the terminal and administrative recruitment remains blocked.
- Real PostgREST RPC retry creates one attendance row; retry returns duplicate,
  altered operation content returns conflict, and the stored row is unchanged.
- Anonymous and authenticated kiosk sessions cannot call that server-only RPC.
- Evaluation-note updates confirm the owned row through real PostgREST; foreign
  and missing evaluations return no row, and a kiosk session cannot update notes.

`brands.spec.ts` (Desktop Chrome only, 14 scenarios) covers commercial
brands with real roles:

- The general view shows the company logo, name and theme.
- Creating a brand rejects duplicates; a branch requires a brand, and "Agregar
  sucursal" preselects the one it came from. The branch list keeps the brand filter
  in the URL, through creating a branch and going back.
- A brand with no branches can be deleted and frees its name; one with branches
  explains why not.
- A lost connection or an expired session never traps a dialog and always says so;
  losing the permission mid-session redirects without claiming a failure.
- Editing a brand once recolors both of its stores, seen by two real managers,
  and the colors survive client navigation and reload. Saving does not move the
  top bar selector: it offers to.
- A brand inherits unset colors and the logo from the company, also after saving
  through the real form; the company theme is editable and reaches those brands.
- A manager of one store and an employee get no selector, ignore a forged cookie and
  cannot open the brand screens. An employee gets the brand of the current contract, and a
  borrowed shift in another brand does not change it.
- Another company's brand cannot be opened, nor chosen through a forged cookie.
- A brand with active branches cannot be deactivated; an inactive one is not offered.
- Brand logo upload and removal, against real Storage.
- "Marca · Sucursal" labels through real PostgREST embedding.

`brand-context.spec.ts` (Desktop Chrome only, 16 scenarios, 46 in total with the rest) covers the
top bar selector that filters data. Its accounts use INVENTED roles with chosen permissions, so
nothing depends on a known role:

- Choosing a brand narrows employees, evaluations, recruitment, attendance, periods and branches,
  and paints its theme; "Todas" brings everything back. The choice survives a reload.
- Who gets the selector, by permission and stores. A forged cookie is ignored, the next account in
  the browser does not inherit the filter, logout deletes it and losing the permission turns it off.
- A borrowed shift shows in the matrix and attendance of the store where it is worked, not in the
  employees of that brand. An absence on it still blocks the cell, and pasting does not overwrite it.
- A shift can still move to a store of another brand with a filter on. The kiosk is face-only and
  lists nobody, so this checks the stored shift and the attendance panel of the destination.
- A transferred person keeps the whole aguinaldo under a brand.
- With no connection it warns; with unsaved changes it asks first; on a phone it lives in the menu.

`today` shifts are seeded when the run starts: a run crossing midnight in Costa Rica fails those
scenarios. Run it again.

The kiosk and evaluation persistence specs are HTTP/database integration, not
browser interaction.
Facial camera/inference is not bypassed to manufacture a successful browser mark.
Component tests cover no automatic entry after recognition, double taps, camera
failures, encryption failures and resource cleanup; SQL/HTTP tests cover atomic
persistence. Full real-camera recognition and device accuracy remain a separate
validation layer.
