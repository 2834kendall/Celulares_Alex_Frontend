# Auth y JWT con claims propios

Los flujos de login, activación y recuperación están en
[`modules/auth`](../../srgh-app/src/modules/auth/README.md). Acá está cómo se conecta Auth con
el modelo de negocio y qué lleva el token.

## Usuarios de Auth y de negocio

- **Email y contraseña, sin registro público.** Es un sistema interno: RRHH crea e invita a
  cada persona. Google SSO exigiría cuentas corporativas que no siempre existen.
- `auth.users` maneja login y sesiones; el negocio usa `sgrh_usuarios`, ligado por
  `usr_auth_id` (uuid). **`ON DELETE SET NULL`, no `CASCADE`**: borrar el usuario de Auth no
  puede llevarse el historial laboral ni la nómina, que se conservan por razones legales.
- Un trigger `SECURITY DEFINER` crea la fila de `sgrh_usuarios` al crearse el usuario en Auth
  (corre en el contexto de `auth`, sin acceso a `public` de otra forma).

## Por qué claims en el JWT

La RLS necesita saber empresa, empleado y permisos en **cada** consulta.

| opción | problema |
|---|---|
| consultar la base en cada request | latencia extra en toda operación |
| guardarlo en el frontend | manipulable por el usuario |
| **claims en el JWT** | firmados, sin consultas extra |

`public.custom_access_token_hook` los inyecta en `app_metadata` al emitir el token:

| claim | para qué |
|---|---|
| `empresa_id` | aislamiento por empresa en todas las policies |
| `sucursal_id` | alcance por sucursal. `NULL` = sin restricción |
| `emp_id` | "es mío" sin subconsultas anidadas por fila, crítico en tablas grandes como las marcas |
| `rol` | informativo; **las policies no comparan nombres de rol** |
| `permisos` | array que lee `tiene_permiso()` en memoria, y que usa la UI sin consultar |

- El hook es `VOLATILE` (Supabase lo exige) y corre como `supabase_auth_admin`, que necesita
  grants explícitos sobre `public`. Sin ellos falla **en silencio** y el token sale sin claims.
- **Activarlo es un paso manual en el Dashboard** que no viaja en las migraciones. Sin él,
  `tiene_permiso()` devuelve `false` para todo y la RLS bloquea todo. Ver
  [pasos manuales](../../srgh-app/supabase/docs/proyectos-y-pasos-manuales.md).

## Helpers que leen el token

`get_empresa_id()`, `get_sucursal_id()`, `get_emp_id()`, `tiene_permiso()` y
`sucursal_visible()` (`20260101000400_funciones_auth.sql`).

- Viven en `public` porque Supabase no permite crear funciones en `auth`.
- Son `STABLE`: Postgres los evalúa una vez por consulta, no por fila.
- `EXECUTE` revocado de `PUBLIC` y devuelto **solo** a `authenticated`: las policies los
  necesitan, y un usuario anónimo no.

## Consecuencia: los permisos se congelan al emitir el token

Si cambian los permisos de un rol o una asignación, **el usuario tiene que cerrar sesión y
volver a entrar** para recibir un token nuevo. Pasa lo mismo con un permiso nuevo después de
una migración (p. ej. `BIOMETRIA_WRITE`). Para un sistema interno es aceptable, pero es la
primera sospecha cuando "a alguien no le aparece algo".

## Dónde se consume en Next

| archivo | uso |
|---|---|
| `lib/supabase/server.ts` | cliente de sesión para Server Components y Actions (RLS activa) |
| `lib/supabase/client.ts` | cliente de navegador |
| `lib/supabase/admin.ts` | `createAdminClient`, con la secret key; se salta la RLS |
| `lib/supabase/proxy.ts` | refresco de sesión en el proxy |
| `lib/auth/require-permission.ts` | guard; lee los permisos con `getClaims()` (`getUser()` no los trae, porque viven en el token y no en el registro del usuario), memoizado por request con `React.cache` |
| `hooks/usePermisos.ts` | permisos del token para la UI |
