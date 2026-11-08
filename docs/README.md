# Documentación del SGRH

Índice de toda la documentación. Las reglas de cada módulo viven **junto a su código**
(`srgh-app/src/modules/<módulo>/README.md`); acá solo está lo transversal.

> **En migración.** Falta la documentación de los módulos de asistencia, horarios, ausencias,
> reclutamiento, evaluaciones y dashboard (fase 4). Hasta entonces, sus specs de ticket
> siguen en esta carpeta.

## Por módulo

| módulo | documento | estado |
|---|---|---|
| Expedientes | [`modules/employees/README.md`](../srgh-app/src/modules/employees/README.md) | ✅ |
| Nómina | [`modules/payroll/README.md`](../srgh-app/src/modules/payroll/README.md) | ✅ |
| Autenticación | [`modules/auth/README.md`](../srgh-app/src/modules/auth/README.md) | ✅ |
| Usuarios | [`modules/users/README.md`](../srgh-app/src/modules/users/README.md) | ✅ |
| Archivos | [`modules/storage/README.md`](../srgh-app/src/modules/storage/README.md) | ✅ |
| Configuración, sucursales y kioscos | [`modules/settings/README.md`](../srgh-app/src/modules/settings/README.md) | ✅ |
| Cifrado de campos | [`lib/crypto/README.md`](../srgh-app/src/lib/crypto/README.md) | ✅ |
| UI compartida y marca | [`components/ui/README.md`](../srgh-app/src/components/ui/README.md) | ✅ |
| Base de datos: proyectos, RLS, migraciones, respaldos | [`supabase/README.md`](../srgh-app/supabase/README.md) | ✅ |
| Asistencia, horarios, ausencias, reclutamiento, evaluaciones, dashboard | — | pendiente (fase 4) |

## Arquitectura

| documento | qué tiene |
|---|---|
| [visión general](arquitectura/vision-general.md) | stack, organización por módulo, estructura de carpetas, routing |
| [capas de seguridad](arquitectura/capas-de-seguridad.md) | proxy → guard → RLS → `usePermisos`, patrón de Server Action, principios de las policies |
| [auth y JWT](arquitectura/auth-y-jwt.md) | usuarios de Auth y de negocio, claims del token, helpers, por qué hay que volver a entrar |
| [permisos y roles](arquitectura/permisos-y-roles.md) | el modelo, los roles, cómo agregar un permiso |
| [rendimiento](arquitectura/rendimiento.md) | viajes en serie, `Promise.all`, `router.refresh`, catálogos cacheados |
| [errores de Postgres](arquitectura/errores-postgres.md) | códigos SQLSTATE y qué muestra la UI |

## Propuestas

| documento | estado |
|---|---|
| [portal público de reclutamiento](propuestas/portal-reclutamiento.md) | para decisión, sin código |

## Guías

| documento | para |
|---|---|
| [crear un módulo](guias/nuevo-modulo.md) | un módulo nuevo o una funcionalidad nueva |
| [datos y formularios](guias/datos-y-formularios.md) | leer, escribir, Zod + RHF, protección de cambios sin guardar |
| [git y calidad](guias/git-y-calidad.md) | ramas, commits, PRs, hooks, Prettier y la trampa de CRLF |
| [testing](guias/testing.md) | convenciones, cobertura, SQL real, CI |
| [entorno y Supabase](guias/entorno-y-supabase.md) | variables de entorno, levantar un proyecto desde cero |

## Specs de ticket pendientes de extraer (fase 4)

[`SGRH_BRANCH_KIOSK_SETTINGS.md`](SGRH_BRANCH_KIOSK_SETTINGS.md) (la parte de configuración ya
está en `settings`), [`SGRH_KIOSK_FACE_PIPELINE.md`](SGRH_KIOSK_FACE_PIPELINE.md) y
[`SGRH_EMPLOYEE_FACE_ENROLLMENT.md`](SGRH_EMPLOYEE_FACE_ENROLLMENT.md). Su lado de asistencia y
kiosco va al README de `attendance`.

## Reglas para mantener esto ordenado

1. **Un dato vive en un solo lugar.** Los demás documentos enlazan a él, no lo repiten.
   Dos copias terminan contando dos versiones distintas.
2. **No copiar SQL ni código.** Se nombra la función o la policy y la migración que la
   define. El código copiado es lo que más pesa y lo primero que se desactualiza.
3. **Contar cómo funciona hoy, no la historia.** "Antes de SGRH-98 estaba bloqueado" va en
   una línea solo si explica algo que no es obvio; el resto está en git, en el PR y en Jira.
4. **Las specs de ticket son temporales.** Al mergear, las reglas que duran pasan al README
   del módulo y la spec se borra.
5. **El repo es público: nunca documentar una vulnerabilidad sin corregir.** Un hallazgo de
   seguridad abierto va a Jira; al repo llega cuando ya está corregido, como trampa ya
   pisada.
6. **Máximo ~6 KB por archivo.** Si un módulo se pasa, se parte en `modules/<m>/docs/*.md`
   y el README queda como índice.

## Plantilla de un README de módulo

```markdown
# <Módulo>

## Qué hace
3-5 líneas y las rutas de la app que lo usan.

## Reglas de negocio
Viñetas cortas, en presente. Lo que un usuario o un dev preguntaría.

## Flujos
Solo si hay pasos (terminar → liquidar → pagar).

## Datos
| tabla / RPC | permiso | migración |

## Trampas
Lo que ya rompió algo, una viñeta cada una.

## Pendiente
Preguntas de dominio sin resolver.
```

El `CLAUDE.md` de cada carpeta es **local** (no se versiona, ver `.git/info/exclude`) e
importa el README con `@README.md`, más las notas que solo le sirven al agente.
