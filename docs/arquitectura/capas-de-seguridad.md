# Capas de seguridad

El frontend nunca es la única línea de defensa: es defensa en profundidad.

| capa | responsabilidad | dónde vive | qué NO hace |
|---|---|---|---|
| **Proxy** | autenticación: sin sesión, redirige a `/login` | `src/proxy.ts` + `lib/supabase/proxy.ts` | no valida permisos ni roles |
| **Layout** | lee y valida los claims del token con `supabase.auth.getClaims()` | `app/(dashboard)/layout.tsx` | no consulta a Auth en cada request si la sesión fue revocada |
| **Guard** | autorización por permiso, antes de renderizar o escribir | `lib/auth/require-permission.ts`, en cada `page.tsx` y cada Server Action | no oculta botones: eso es UI |
| **RLS** | la última línea: protege filas aunque alguien rodee la UI | Postgres | no da feedback de UX, solo bloquea |
| `usePermisos()` | muestra u oculta elementos dentro de una página ya autorizada | `hooks/usePermisos.ts` | **no es seguridad**, es UX |

**Regla mental:** el proxy decide si entrás al edificio, el guard si entrás a esa oficina, la
RLS qué archivos podés tocar adentro, y `usePermisos()` qué botones ves en el escritorio.

Los strings de permiso salen **solo** de `lib/permissions/catalog.ts`: ningún módulo escribe
uno a mano. Ver [permisos y roles](permisos-y-roles.md).

## Patrón de una Server Action

1. `schema.safeParse(input)`: si falla, error genérico **antes** de tocar permisos o la base.
2. `requirePermission(PERMISOS.X)`: lee el JWT y corta si no cumple.
3. `empresaId` sale **siempre** del JWT (`app_metadata`), nunca de un parámetro del cliente.
4. Toda validación entre empresas (sucursal, empleado, vínculo) se verifica **antes** de
   escribir: nunca confiar en que el cliente mandó el id correcto.
5. Operación con el cliente de sesión (RLS activa). El cliente admin (`createAdminClient`) se
   salta la RLS: solo para lo que el JWT ya autorizó, como la API de Auth.
6. `return { ok: true, … } | { ok: false, error: string }`.

## RLS: principios de todas las policies

- **Aislamiento por empresa obligatorio**: toda policy operativa filtra por
  `get_empresa_id()`. Por sucursal, con `sucursal_visible()` (ver
  [RLS y alcance](../../srgh-app/supabase/docs/rls-y-alcance.md)).
- **INSERT / UPDATE / DELETE separados** en tablas de autoservicio o transaccionales: un
  `FOR ALL` daría UPDATE y DELETE a quien solo debe insertar sus propios registros.
- **`WITH CHECK` en toda policy de UPDATE**: sin él, un usuario podría mover una fila a otra
  empresa o a otro empleado al actualizarla.
- **Los helpers van envueltos en `(SELECT …)`** para que Postgres los evalúe una vez por
  consulta y no una vez por fila.
- **Una escritura que la RLS filtra no da error**: afecta 0 filas. Un test que no lo considere
  concluye que "no hubo validación".

Las policies están en `20260101000600_rls_policies.sql` y en las migraciones posteriores de
cada tabla. Habilitar RLS y recrear policies es idempotente (`DROP POLICY IF EXISTS` +
`CREATE POLICY`).

## Decisiones de seguridad de la base

| decisión | por qué |
|---|---|
| `SET search_path = public` en todas las funciones | previene ataques de search_path injection |
| `REVOKE EXECUTE … FROM PUBLIC` (no solo de `anon`/`authenticated`) | los dos heredan de `PUBLIC`; revocar solo de ellos no alcanza |
| `GRANT EXECUTE … TO authenticated` en los helpers de policy | las policies corren como `authenticated` y necesitan ejecutarlos |
| `SECURITY DEFINER` solo en triggers, hooks y RPC que lo requieren | y entonces la función re-verifica permisos y empresa por dentro: es la única capa |
| Helpers de JWT como `SECURITY INVOKER` | no leen tablas, solo el token |
| Funciones administrativas en `sgrh_private` | PostgREST no las publica como `/rest/v1/rpc/…` |
| `ON DELETE SET NULL` en `usr_auth_id` | dar de baja un usuario de Auth conserva su historial laboral y su nómina |
| Permisos por tabla, no nombres de rol en las policies | agregar un rol no exige tocar policies |

Las trampas concretas de grants, `EXECUTE` y esquemas ya pisadas están en
[RLS y alcance](../../srgh-app/supabase/docs/rls-y-alcance.md).
