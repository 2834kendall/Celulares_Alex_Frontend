# Documentación del SGRH

Índice de toda la documentación. Las reglas de cada módulo viven **junto a su código**
(`srgh-app/src/modules/<módulo>/README.md`); acá solo está lo transversal.

> **En migración.** Se está pasando de dos documentos gigantes a archivos cortos por tema
> (plan: una fase por PR). Mientras dure, los que siguen marcados como _(pendiente de
> partir)_ todavía son la fuente; los demás ya tienen su lugar definitivo.

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

## Transversal

| documento | qué tiene |
|---|---|
| [`SGRH_Supabase_Architecture.md`](SGRH_Supabase_Architecture.md) _(pendiente de partir)_ | auth y JWT, permisos, RLS, policies de los módulos que todavía no se movieron |
| [`SGRH_Frontend_Architecture.md`](SGRH_Frontend_Architecture.md) _(pendiente de partir)_ | estructura de carpetas, capas de seguridad, cómo crear un módulo |
| [`GIT_WORKFLOW_STANDARD.md`](GIT_WORKFLOW_STANDARD.md) _(pendiente de partir)_ | ramas, commits, PRs |

Las specs de ticket (`SGRH-101` a `SGRH-105`) siguen acá hasta que su contenido pase al
módulo que corresponde (fases 4 y 5). Branding ya se pasó a `components/ui`, y la parte de
configuración de SGRH-103 a `settings`; los archivos se borran al terminar de extraerlos.

## Reglas para mantener esto ordenado

1. **Un dato vive en un solo lugar.** Los demás documentos enlazan a él, no lo repiten.
   Dos copias terminan contando dos versiones distintas.
2. **No copiar SQL ni código.** Se nombra la función o la policy y la migración que la
   define. El código copiado es lo que más pesa y lo primero que se desactualiza.
3. **Contar cómo funciona hoy, no la historia.** "Antes de SGRH-98 estaba bloqueado" va en
   una línea solo si explica algo que no es obvio; el resto está en git, en el PR y en Jira.
4. **Las specs de ticket son temporales.** Al mergear, las reglas que duran pasan al README
   del módulo y la spec se borra.
5. **Máximo ~6 KB por archivo.** Si un módulo se pasa, se parte en `modules/<m>/docs/*.md`
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
