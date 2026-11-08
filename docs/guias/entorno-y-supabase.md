# Entorno local y proyecto de Supabase

## Requisitos

Node **≥ 22.13** (`engines` en `package.json`), pnpm, acceso al proyecto **dev** de Supabase y Docker (solo para la base local, los
respaldos y los tests e2e). Todos los comandos se corren desde `srgh-app/`.

```bash
pnpm install
pnpm supabase:link        # vincula el CLI a dev
pnpm dev                  # http://localhost:3000
```

## Variables de entorno (`srgh-app/.env.local`, nunca en el repo)

| variable | para qué |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | cliente de Supabase |
| `SUPABASE_SECRET_KEY` | cliente admin, solo servidor |
| `FIELD_ENCRYPTION_KEY`, `FIELD_INDEX_KEY` | cifrado de cuentas bancarias: 32 bytes en base64 cada una. **Si se pierde la primera, los números de cuenta son irrecuperables** ([cifrado](../../srgh-app/src/lib/crypto/README.md)) |
| `FACE_VECTOR_KEY`, `FACE_TICKET_SECRET`, `NEXT_PUBLIC_FACE_VECTOR_KEY` | reconocimiento facial del kiosco |
| `NEXT_PUBLIC_FACE_DEBUG`, `NEXT_PUBLIC_FACE_TEST_MODE` | depuración del reconocimiento facial |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | envío de comprobantes. Sin ellas, el pago se marca igual y no se envía nada. Con Gmail, `SMTP_PASS` es una contraseña de aplicación |
| `NEXT_PUBLIC_SITE_URL` | origen público para metadatos y vistas previas sociales |
| `SGRH_DEBUG_TIMING=1` | loguea cada consulta a Supabase con su duración |

Las de cifrado se validan en `lib/env.server.ts`.

## Proyectos de Supabase

Hay **dos**, en cuentas distintas: **dev** (`paupjapsxvufinozlhss`) y **producción**
(`opgdvnkbdledcyvpeifu`). Confundirlos es el peor error posible del repo: ver
[proyectos y pasos manuales](../../srgh-app/supabase/docs/proyectos-y-pasos-manuales.md).

## Levantar un proyecto nuevo desde cero

`supabase/` es la única fuente de verdad del esquema.

1. Crear el proyecto en Supabase.
2. Vincular el CLI (`supabase link --project-ref <nuevo>`).
3. `pnpm supabase:migrate:push`: migraciones + seeds de sistema y catálogos.
4. **Pasos manuales del Dashboard** (hook de JWT, plantillas de correo, política de Auth). Sin
   el hook, todo corre sin error y la app queda inutilizable.
5. `pnpm supabase:seed:demo`, opcional y **solo para desarrollo**.
6. Invitar al primer `ADMIN`.

**Verificar que el resultado es fiel:**

- `pnpm supabase:types` contra el proyecto nuevo, y comparar con `src/types/database.types.ts`.
  Sin diferencias en tablas, columnas y funciones, el esquema es correcto. No cubre triggers,
  constraints ni índices: para eso, `supabase db dump --linked`.
- Correr `pnpm supabase:migrate:push` **una segunda vez** tiene que ser un no-op limpio. Es la
  única prueba de que los seeds son convergentes.
- `pnpm supabase:diagnose` compara tablas, policies y grants con lo esperado.

## Pendiente

- **Realtime**: `sgrh_notificaciones` todavía no está publicada en `supabase_realtime`. Cuando
  se implemente el módulo, va en una migración nueva:
  `ALTER PUBLICATION supabase_realtime ADD TABLE public.sgrh_notificaciones;`
