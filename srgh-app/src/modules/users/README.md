# Usuarios (`users`)

## Qué hace

Cuentas de acceso al sistema (SGRH-59): invitar o vincular un empleado, editar rol, sucursal
y vínculo, desactivar y reenviar la invitación. Muestra un aviso con los empleados activos que
no tienen cuenta, con la invitación ya precargada.

Ruta: tab "Usuarios" dentro de `/employees` (`?tab=usuarios`), con `USUARIOS_WRITE`.

## Reglas de negocio

- **Desactivar no borra filas.** Banea al usuario en Supabase Auth y apaga `usr_activo` y
  `uer_activo`. El despido, como evento de negocio, vive en el historial laboral.
- **Estado de cada usuario** (`activo` / `pendiente` / `desactivado`): se cruzan los flags
  propios con `listUsers()` de Auth, de donde sale `last_sign_in_at`. **La columna
  `usr_ultimo_acceso` no la actualiza nadie: no confiar en ella.**
- **El alcance lo decide la sucursal de la asignación** (`uer_sucursal_id`), no el rol.
  `NULL` = sin restricción de sucursal. Roles y alcance: tabla en
  [RLS y alcance](../../../supabase/docs/rls-y-alcance.md).
- **Multi-empresa** = varias filas en `sgrh_usuarios_empresa_rol`, una por empresa.
- **Las cuentas de kiosco no se administran desde acá.** Se registran y vinculan en
  Configuración → Sucursales ([sucursales y kioscos](../settings/docs/sucursales-y-kioscos.md)).
  Las acciones genéricas de Usuarios no pueden cambiar la identidad de un kiosco registrado.

## Datos

| tabla                       | permiso                                                   |
| --------------------------- | --------------------------------------------------------- |
| `sgrh_usuarios`             | `USUARIOS_WRITE`                                          |
| `sgrh_usuarios_empresa_rol` | `USUARIOS_WRITE`, **con chequeo de empresa en la policy** |

La invitación usa la API admin de Auth (`inviteUserByEmail`) con `createAdminClient`.

## Trampas

- **`setValueAs` de React Hook Form sobre selects numéricos opcionales.** RHF también aplica
  `setValueAs` al `defaultValue`, y `Number(null) === 0` rompe las validaciones `.positive()`.
  Usar un helper que preserve `null`/`undefined` (`toOptionalNumber`, en
  `components/fields.tsx`) en vez de castear directo.
- **`sgrh_usuarios_empresa_rol` fue el hueco cross-tenant más grave del repo.** Con
  `USUARIOS_WRITE` se podía insertar una fila dándose cualquier rol en cualquier empresa,
  llamando a PostgREST directo: la policy tenía `OR tiene_permiso('USUARIOS_WRITE')` sin
  chequeo de empresa. Las Server Actions filtraban, pero la RLS es la capa que no se puede
  saltar desde el cliente. Antes de tocar las policies de esta tabla, leé
  [RLS y alcance](../../../supabase/docs/rls-y-alcance.md).
- **El cliente admin se salta la RLS.** Acá se usa solo para la API de Auth, que es lo que el
  JWT ya autorizó. No ampliar su uso a lecturas de negocio.
