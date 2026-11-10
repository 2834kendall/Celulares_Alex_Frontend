# Base de datos (`supabase/`)

## Qué hay acá

| directorio    | contiene                                      | regla                                                                                                                       |
| ------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `migrations/` | **100 % DDL**: la _forma_ de la base          | cero `INSERT`/`UPDATE`/`DELETE` a nivel de sentencia (el DML dentro del cuerpo de una función sí vale: es código, no datos) |
| `seeds/`      | datos                                         | **siempre convergentes** (`ON CONFLICT DO NOTHING` o anti-join): no hay ledger de seeds                                     |
| `scripts/`    | correcciones puntuales sobre datos existentes | se corren a mano, una vez, contra el proyecto que las necesite. Nunca se aplican solas                                      |
| `templates/`  | plantillas de correo de Auth                  | se copian al Dashboard a mano                                                                                               |

- **Baseline:** las 9 migraciones `20260101…` reconstruyen el esquema completo desde cero. El
  timestamp es sintético porque son un baseline, no una fecha real. La última
  (`…_comentarios.sql`) es el `COMMENT ON` de todas las tablas y columnas.
- **Seeds:**
  - `01_sistema/`: roles, permisos, matriz rol → permiso, buckets y jobs. **No es data de
    demo, es configuración**: sin la matriz de permisos nadie puede usar la app.
  - `02_catalogos/`: catálogos globales y legales de CR (territorio IGN, bancos, jornadas,
    contratos, ausencias, conceptos de nómina, evaluación, reclutamiento, documentos).
  - `99_demo/`: empresa de ejemplo. **Queda fuera de `sql_paths` a propósito**, para que un
    push a producción no la cree. Se aplica con `pnpm supabase:seed:demo`.
- `supabase:migrate:push` lleva `--include-seed`: así un solo comando reproduce el entorno
  completo, aunque `migrations/` no tenga datos.

## Documentos

| tema                                                                                                | archivo                                                                  |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Los dos proyectos (dev y producción)** y los pasos del Dashboard que no viajan en las migraciones | [docs/proyectos-y-pasos-manuales.md](docs/proyectos-y-pasos-manuales.md) |
| Alcance por sucursal, roles y trampas de policies, grants y funciones                               | [docs/rls-y-alcance.md](docs/rls-y-alcance.md)                           |
| Trampas al aplicar migraciones y seeds                                                              | [docs/migraciones-y-seeds.md](docs/migraciones-y-seeds.md)               |
| Respaldo antes de cada push a producción (**el script todavía no está en el repo**)                 | [docs/respaldos.md](docs/respaldos.md)                                   |

## Comandos (desde `srgh-app/`)

| comando                      | qué hace                                                                                                                      |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm supabase:link`         | vincula el CLI a **dev** (es el único con el ref fijo: `--project-ref paupjapsxvufinozlhss`). Todos los demás usan `--linked` |
| `pnpm supabase:types`        | regenera `src/types/database.types.ts`                                                                                        |
| `pnpm supabase:migrate:new`  | crea una migración nueva con timestamp                                                                                        |
| `pnpm supabase:migrate:push` | aplica migraciones + seeds (`--include-seed`)                                                                                 |
| `pnpm supabase:seed:demo`    | empresa y sucursales de ejemplo (**nunca en producción**)                                                                     |
| `pnpm supabase:db:reset`     | recrea la base local desde cero (requiere Docker)                                                                             |
| `pnpm supabase:db:diff`      | detecta deriva entre el repo y el proyecto vinculado                                                                          |
| `pnpm supabase:diagnose`     | tablas, policies y grants contra lo esperado                                                                                  |
| `pnpm encrypt:payment-data`  | backfill de cuentas bancarias (dry-run; `-- --apply` para escribir)                                                           |

## Trampas

- **Los comentarios de la base son documentación, no contrato.** El `COMMENT ON TABLE` del
  baseline está desactualizado en al menos un punto: todavía dice que `lab_sucursal_id` nunca
  se edita en sitio, y eso es anterior a SGRH-84/98. No derivar reglas de ahí sin contrastar
  la RPC.
- **No editar una migración ya aplicada.** Toda corrección va en un archivo nuevo.
