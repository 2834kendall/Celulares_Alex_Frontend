# SGRH-102 — employee face enrollment

The employee profile's **Rostro** tab replaces `/kiosco/enrolar`. It uses the
existing kiosk models, three consistent captures, liveness checks and encrypted
templates. Status reads return enrollment metadata, never a template.

## Deployment

Apply these migrations, in filename order, before deploying the feature:

1. `20261106060500_biometria_permiso_propio.sql` — scoped biometric RLS policies.
2. `20261106181220_biometria_permission_rollout.sql` — create `BIOMETRIA_WRITE`
   when missing and grant it to existing ADMIN, GERENTE, RRHH, SUPERVISOR,
   JEFE_SUCURSAL and legacy SUPERADMIN roles.

The second migration resolves catalog IDs by code and can be repeated without
duplicating role grants. It preserves existing permission metadata and unrelated
assignments. It does not recreate retired roles or require running the full seed
set. Keep the previously applied policy migration unchanged.

Existing sessions must refresh their token (sign out and back in) to receive the
new permission. Company, branch scope and active-contract checks still apply;
the capability alone does not bypass them. KIOSCO and EMPLEADO receive no grant.

## Failure handling and verification

While saving, show progress and disable cancellation; a synchronous guard rejects
duplicate capture callbacks. Transport errors during saving or deletion show an
error and release the controls for retry. Nothing reports success on rejection.

Primary buttons derive an action color with at least 4.5:1 contrast against white,
including custom branch colors. Other accent tokens retain the selected color.

Component tests cover pending saves, duplicate callbacks, cancellation, transport
errors and server rejection. PGlite executes the actual rollout SQL against fresh
and existing catalogs, repeated application and installations without SUPERADMIN.
These tests do not capture or modify hosted biometric records.
