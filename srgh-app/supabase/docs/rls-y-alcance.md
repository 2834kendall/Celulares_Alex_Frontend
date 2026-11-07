# RLS, alcance por sucursal y roles

## Alcance por sucursal

- El JWT lleva `sucursal_id`, que `custom_access_token_hook` inyecta desde `uer_sucursal_id`.
  **`NULL` es semántico: significa sin restricción de sucursal.**
- Las policies operativas usan **`public.sucursal_visible(<columna>)`**, que junta las dos
  condiciones que **siempre** van juntas: la sucursal es de la empresa del JWT, y el usuario
  no está adscrito a ninguna o es la suya.
- Se aplica sobre la **sucursal del registro** (`mar_sucursal_id`, `prg_sucursal_id`,
  `npe_sucursal_id`), nunca sobre la sucursal actual del empleado. Por eso un traslado no mueve
  el historial entre sucursales, ni se lo quita al gerente que era responsable entonces.
- **El expediente (`sgrh_empleados`) es de la empresa**: una persona no le pertenece a una
  sucursal.
- **Traslado de empleado** = cerrar la fila vigente de `sgrh_historial_laboral` y abrir otra.
  Es distinto de corregir la sucursal base del contrato, que sí se edita en sitio (ver
  [contratos](../../src/modules/employees/docs/contratos.md)).

## Roles

Cuatro activos. **El alcance lo decide `uer_sucursal_id`, no el rol:**

| rol        | `uer_sucursal_id` | ve                                                            |
| ---------- | ----------------- | ------------------------------------------------------------- |
| `ADMIN`    | `NULL`            | toda su empresa                                               |
| `GERENTE`  | con valor         | solo su sucursal (tablas operativas)                          |
| `EMPLEADO` | —                 | solo lo suyo. **Cero permisos, a propósito**                  |
| `KIOSCO`   | con valor         | solo los empleados activos de su sucursal, y solo para marcar |

- Los otros 8 (RRHH, SUPERVISOR, CONTADOR…) tienen su matriz sembrada, pero
  `rol_activo = false`: no son asignables. **Activar uno es un `UPDATE`**, así que ninguna
  regla puede asumir que no existen.
- **`SUPERADMIN` se eliminó**: tenía los mismos 27 permisos que `ADMIN`, y la RLS lo acotaba al
  `empresa_id` de su JWT igual que a todos. Prometía acceso entre empresas y daba una sola.
  Multi-empresa = varias filas en `sgrh_usuarios_empresa_rol`.
- **`EMPLEADO` no tiene permisos, y no es un descuido**: su acceso pasa por las ramas
  `emp_id = get_emp_id()` de las policies. Darle un permiso le abriría los datos de toda la
  empresa.

## Trampas de policies, grants y funciones

- **Una policy de escritura con `OR tiene_permiso('X')` y sin chequeo de empresa es un hueco
  entre empresas.** Ya pasó en tres tablas. El patrón `(rama del empleado, con empresa) OR
tiene_permiso(...)` se lee como si el permiso fuera la parte segura, y es al revés: la rama
  del permiso es la que puede tocar filas de cualquiera. El caso grave fue
  `sgrh_usuarios_empresa_rol` (ver [users](../../src/modules/users/README.md)).
- **`get_sucursal_id()` NO reemplaza el chequeo de empresa.** Los ids de sucursal son globales.
  Usar siempre `sucursal_visible()`, que hace las dos cosas.
- **Las policies SÍ chequean el `EXECUTE` del usuario sobre las funciones que invocan.** El
  linter marca `sucursal_visible` como "Signed-In Users Can Execute SECURITY DEFINER Function",
  y el reflejo es revocarla. **No lo hagas**: revocarle el `EXECUTE` a `authenticated` hace que
  toda consulta a las 11 tablas que la usan muera con `42501`. El `GRANT` del final de
  `20260101000400` es un requisito, no privilegio de más. Para silenciar el warning, la salida
  es moverla a `sgrh_private`, conservando el `GRANT` y agregando el `USAGE` del esquema.
- **`GRANT EXECUTE` sobre una función de `sgrh_private` NO alcanza: falta el `USAGE` del
  ESQUEMA.** Sin él, la llamada muere con `42501 permission denied for schema sgrh_private`.
  Pasó con `tiene_quincena_sin_pagar()`, y dejó `editar_contrato` roto por completo. No lo
  detecta nada: `has_function_privilege(...)` devuelve `true` (mira el grant de la función, no
  el del esquema) y los tests mockean Supabase. Solo aparece llamando con un usuario real
  (skill `rpc-rls-test`). Arreglo: `20261011130000_usage_sgrh_private.sql`.
- **Una trigger function no necesita que el usuario tenga `EXECUTE` para dispararse**: el
  privilegio se chequea al `CREATE TRIGGER`. Revocar no rompe nada, pero el `REVOKE` sobre
  `sgrh_set_codigo_postal` y `sgrh_crear_tipos_tardia_por_defecto` **corrió y no quedó**: el
  advisor las sigue marcando como ejecutables por `anon`. **Y da igual**: PostgREST no expone
  funciones `RETURNS trigger`, y una llamada directa muere con `0A000` antes de ejecutar el
  cuerpo. Es ruido del advisor: **no escribir una migración para esto.** Si algún día marca una
  función que NO sea `RETURNS trigger`, ahí sí importa.
- **Una escritura que la RLS filtra no da error**: afecta 0 filas. Un test que concluye "no hubo
  validación" puede estar midiendo eso. Probar siempre con el rol correcto (skill
  `rpc-rls-test`).
