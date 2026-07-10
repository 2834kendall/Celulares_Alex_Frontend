# SGRH — Sistema de Gestión de Recursos Humanos

Sistema interno de gestión de recursos humanos para Celulares Alex.

## Stack

- **Frontend:** Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **Backend / DB:** Supabase (PostgreSQL, Auth, RLS multi-tenant)
- **Package manager:** pnpm
- **Gestión de proyecto:** Jira (clave `SGRH`)

## Supabase Permissions

El sistema usa RLS en Supabase y depende de helpers de PostgreSQL que leen claims del JWT, como `get_empresa_id()` y `tiene_permiso()`. Esos helpers se revocan desde `PUBLIC` por seguridad, pero el script maestro vuelve a otorgar `EXECUTE` a `authenticated` para que las policies puedan ejecutarse correctamente.

Si cambian los permisos de un rol en la base de datos, el usuario debe cerrar sesión y volver a iniciar sesión para obtener un JWT nuevo con los claims actualizados.

## Requisitos previos

- Node.js 18.18+ o 20+
- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- Acceso al proyecto de Supabase (solicitar credenciales al equipo)
- Cuenta con acceso al Jira del proyecto

## Setup inicial

1. Clonar el repositorio:

```bash
   git clone <repo-url>
   cd sgrh-frontend
```

2. Instalar dependencias:

```bash
   pnpm install
```

3. Configurar variables de entorno:

```bash
   cp .env.example .env.local
```

Completar `.env.local` con las keys de Supabase Dashboard → Settings → API.

4. (Opcional) Regenerar tipos de la base de datos si hubo cambios de schema:

```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <project-ref>
   pnpm dlx supabase gen types typescript --linked > src/types/database.types.ts
```

5. Levantar el entorno de desarrollo:

```bash
   pnpm dev
```

Abrir [http://localhost:3000](http://localhost:3000)

## Estructura del proyecto
