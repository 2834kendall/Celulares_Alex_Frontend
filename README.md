# SGRH — Sistema de Gestión de Recursos Humanos

Sistema interno de recursos humanos para **Celulares Alex CR** e **Infinity CR**: expedientes
de empleados y contratos, asistencia con kiosco y reconocimiento facial, horarios, ausencias,
planillas quincenales con liquidación y aguinaldo según el Código de Trabajo de Costa Rica,
evaluaciones de desempeño y reclutamiento. Multi-empresa, con control de acceso por roles,
permisos y sucursal.

## Dónde está cada cosa

| carpeta | contiene |
|---|---|
| [`srgh-app/`](srgh-app/README.md) | la aplicación (Next.js 16 + Supabase). **Todos los comandos se corren desde ahí** |
| [`srgh-app/supabase/`](srgh-app/supabase/README.md) | migraciones, seeds y la documentación de la base |
| [`docs/`](docs/README.md) | arquitectura, guías y propuestas |

## Para empezar

1. Arranque rápido: [`srgh-app/README.md`](srgh-app/README.md).
2. Variables de entorno y proyectos de Supabase:
   [entorno y Supabase](docs/guias/entorno-y-supabase.md).
3. Antes de tu primera rama: [git y calidad](docs/guias/git-y-calidad.md) y
   [testing](docs/guias/testing.md).
4. Antes de tocar un módulo: su `README.md`, en `srgh-app/src/modules/<módulo>/`.

## Flujo de trabajo

- Jira, clave `SGRH`. Rama `<type>/SGRH-XX-<desc>` desde **`dev`**; PR a `dev`. `main` solo
  recibe PRs desde `dev`.
- Commits `SGRH-XX: <type>(<scope>): <resumen>`, validados por commitlint.
- Todo el contenido técnico de git (ramas, commits, PRs) en inglés; la documentación y la UI,
  en español.

Detalle en [git y calidad](docs/guias/git-y-calidad.md).
