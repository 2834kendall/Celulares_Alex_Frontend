# Testing

Vitest + Testing Library. Desde `srgh-app/`:

| comando | qué corre |
|---|---|
| `pnpm test` | la suite completa (~3000 tests, ~65 s) |
| `pnpm test:coverage` | con cobertura de las zonas de seguridad (100 % obligatorio) |
| `pnpm test:coverage:modules` | lo de arriba + pisos por módulo |
| `pnpm test:e2e:prepare` + `pnpm test:e2e` | navegador e integración HTTP contra un Supabase local en Docker (ver [`tests/e2e/README.md`](../../srgh-app/tests/e2e/README.md)) |

## Convenciones

- **Mocks de Supabase centralizados** en `src/test/supabaseMock.ts`
  (`createSupabaseClientMock`, `createSupabaseAdminClientMock`, que incluye la API admin de
  Auth).
- Los módulos con `import 'server-only'` revientan fuera de Next: en su test va
  `vi.mock('server-only', () => ({}))`.
- **Cada Server Action se testea con:** input inválido (sin tocar permisos ni la base), falta de
  permiso, validación entre empresas, camino feliz y cada rama de error mapeado.

## Un test que pasaría igual sin el cambio no vale nada

Y es más peligroso que no tenerlo, porque da confianza falsa. Cuando un test afirma que algo
**se rechaza**, que algo **viene precargado** o que algo **no se escribe**, hay que sacarle el
soporte (deshabilitar el guard, borrar la línea) y ver que **falle**. Ya pasó tres veces:

- `expect.not.objectContaining({ x: expect.anything() })` pasaba sin el guard de cifrado,
  porque `anything()` no matchea `null`. Se arregló con `not.toHaveProperty`.
- Un test afirmaba que la sucursal viajaba al guardar, pero probaba el formulario aislado con un
  fixture completo mientras la pantalla real no le pasaba el valor. **Un test no puede ser más
  generoso que su llamador.**
- Un test en SQL dio por bueno un `CHECK` porque la RLS filtró el `UPDATE`: **una escritura que
  la RLS filtra no da error**, afecta 0 filas. Medir siempre con el rol correcto (skill
  `rpc-rls-test`).

## Cobertura

| zona | piso | config |
|---|---|---|
| `modules/auth`, `lib/auth`, `lib/permissions`, `lib/storage`, `lib/crypto`, `hooks/usePermisos`, `components/layout/Sidebar` | **100 %** en las cuatro métricas | `vitest.config.ts` |
| `modules/attendance` | 87 % líneas / 75 % ramas | `vitest.modules.config.ts` |
| `modules/dashboard` | 72 % / 64 % | `vitest.modules.config.ts` |
| `modules/recruitment` | 85 % / 77 % | `vitest.modules.config.ts` |
| `modules/evaluations` | 93 % / 86 % | `vitest.modules.config.ts` |

Si tocás algo en una zona al 100 %, corré `pnpm test:coverage` antes de darlo por cerrado.

## Tests contra SQL real (SGRH-105)

- **PGlite**: ejecuta las policies reales de las migraciones bajo un rol no dueño. Un fixture
  para Storage y otro relacional, que carga los helpers de JWT reales y pasa claims por
  `auth.jwt()`. Cada caso hace rollback. **No son el esquema completo.**
- **Docker (`tests/e2e/`)**: todas las migraciones y seeds, con Auth, PostgREST y Storage
  reales, en un proyecto local aislado (`sgrh105-e2e`). Nunca se usa un proyecto hospedado.

## CI (`.github/workflows/ci.yml`)

Lint y typecheck, tests en 2 shards, cobertura (seguridad + pisos por módulo, una sola corrida
instrumentada, reportes guardados 14 días) y navegador + integración con su propio Supabase en
Docker. El job agregado **`CI passed`** depende de todos.
