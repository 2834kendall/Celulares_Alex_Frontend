# Migraciones y seeds: trampas ya pisadas

Procedimiento completo para escribir y aplicar una migración: skill `supabase-migracion`.
Antes de cada push a producción: [respaldo](respaldos.md).

## Migraciones

- **Dos migraciones con el MISMO timestamp: `db push` dice "up to date" y no aplica nada.**
  El repo nombra las migraciones en horas redondas (`…120000`, `…130000`), así que dos ramas
  del mismo día chocan con facilidad. Ya pasó: el ledger se ve sincronizado,
  `migration list` muestra la versión en los dos lados, y el esquema **no tiene el cambio**.
  - **Cómo detectarlo:** nunca confiar en el "up to date"; verificar el ESQUEMA
    (`information_schema.columns`, `pg_get_functiondef`). Qué hay realmente en una versión:
    `select version, name from supabase_migrations.schema_migrations where version = '…'`.
  - **Cómo salir:** renombrar la migración local a un timestamp libre. Después el push se
    niega con _"Remote migration versions not found in local migrations directory"_, y la CLI
    **sugiere `repair --status reverted`: NO hacerlo**, porque borraría del ledger un cambio
    que sí está en la base. Lo correcto es traer el archivo del compañero
    (`git checkout <commit> -- <archivo>`).
- **La CLI NO envuelve cada migración en una transacción** (supabase/cli#6354). Un archivo
  puede quedar aplicado a medias si falla en el medio. Si tiene que ser todo-o-nada, el
  `BEGIN`/`COMMIT` va escrito adentro.
- **`migration repair` reescribe el LEDGER, no el esquema, y por eso puede tapar una
  deriva.** `repair --status applied` es una afirmación tuya de que el esquema ya tiene eso, y
  el CLI no la verifica. Ya fue falsa: `20260101000400` y `20260101000600` nunca se habían
  aplicado a dev, y faltaban `sucursal_visible`, `get_sucursal_id`, el `sucursal_id` del hook y
  las 39 policies de alcance.
  - **El canario es `pnpm supabase:types`**: si el diff BORRA funciones, es que no están en la
    base. Contrastar contra `pg_proc`/`pg_policies` antes de aceptar un `applied` masivo.
    `pnpm supabase:diagnose` cubre tablas, policies y grants, pero **no** compara cuerpos de
    función ni de policy.
  - **Para re-aplicar una migración más vieja que la última del remoto** hay que usar
    `--include-all`. Las del baseline lo toleran (`CREATE OR REPLACE`, y `DROP POLICY IF EXISTS`
    seguido de `CREATE POLICY`): el conteo de policies quedó igual, 206 antes y después.
- **`CREATE OR REPLACE` con parámetros nuevos crea una sobrecarga** y deja viva la firma
  vieja. Hay que hacer `DROP FUNCTION` de la vieja y repetir los grants.
- **Toda migración con columnas nuevas exige `pnpm supabase:types`.**

## Seeds

- **Los seeds no tienen ledger:** todo seed nuevo tiene que ser convergente. Ojo con las tablas
  sin índice único útil: `sgrh_rol_permisos` solo tiene PK sobre una columna generada, así que
  `ON CONFLICT DO NOTHING` no detecta nada y duplicaría filas. Ahí va anti-join.
- **`db push --include-seed` solo corre los seeds si hay migraciones pendientes.** Si tocás un
  seed sin tocar una migración, el push dice "up to date" y no aplica nada. Hay que correrlo a
  mano: `supabase db query --linked -f supabase/seeds/<...>.sql`.
- **Los seeds solo AGREGAN, así que un grant de más sobrevive a todos los push.** En dev
  siguen vivos los 27 permisos de `SUPERADMIN`, el rol que se eliminó, y hay que revocarlos a
  mano. Lo reporta `pnpm supabase:diagnose`.

## Exports viejos

- **`sgrh_completo.sql` decía "not meant to be run", y era literal.** Mostraba
  `pra_dias_vacaciones_disponibles` con un `DEFAULT` que referencia otras columnas, y Postgres
  lo rechaza (`0A000`). Era un artefacto del exportador: en la base real es un `numeric` común
  y escribible. Si se reusa algo de ese archivo, contrastarlo contra `database.types.ts`.
