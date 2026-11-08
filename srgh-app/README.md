# SGRH — aplicación

La aplicación Next.js del Sistema de Gestión de Recursos Humanos de **Celulares Alex CR** e
**Infinity CR**. Todos los comandos se corren desde esta carpeta.

## Stack

Next.js 16 (App Router) + React 19 + TypeScript + Tailwind v4 · Supabase (Postgres, Auth,
RLS, Storage) · React Hook Form + Zod · Vitest + Testing Library + Playwright · pnpm · Husky,
lint-staged y commitlint.

## Arranque rápido

Requisitos: Node **≥ 22.13**, pnpm y acceso al proyecto **dev** de Supabase (pedir las llaves
al equipo).

```bash
pnpm install
# crear .env.local con las variables de docs/guias/entorno-y-supabase.md
pnpm supabase:link        # vincula el CLI a dev
pnpm dev                  # http://localhost:3000
```

No hay `.env.example`: la lista de variables, para qué sirve cada una y cuáles son
obligatorias está en la [guía de entorno](../docs/guias/entorno-y-supabase.md). **Si se pierde
`FIELD_ENCRYPTION_KEY`, los números de cuenta son irrecuperables.**

## Comandos

| comando              | qué hace                                                                                                              |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`           | servidor de desarrollo                                                                                                |
| `pnpm build`         | build de producción                                                                                                   |
| `pnpm test`          | suite completa                                                                                                        |
| `pnpm test:coverage` | cobertura de las zonas de seguridad (100 % obligatorio)                                                               |
| `pnpm lint`          | ESLint                                                                                                                |
| `pnpm tsc --noEmit`  | type-check                                                                                                            |
| `pnpm format`        | Prettier (en Windows, `format:check` siempre sale rojo por CRLF: ver [git y calidad](../docs/guias/git-y-calidad.md)) |
| `pnpm supabase:*`    | base de datos: ver [`supabase/README.md`](supabase/README.md)                                                         |

Si cambian los permisos de un rol, el usuario tiene que cerrar sesión y volver a entrar: los
permisos viajan en el JWT.

## Documentación

- Índice general y reglas para mantenerla: [`docs/README.md`](../docs/README.md).
- Cada módulo tiene su `README.md` junto al código (`src/modules/<módulo>/README.md`).
- Base de datos: [`supabase/README.md`](supabase/README.md).
