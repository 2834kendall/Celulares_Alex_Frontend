# Reclutamiento (`recruitment`)

> Pendiente de revisión del dueño del módulo. Escrito a partir del código el 2026-11-07.

## Qué hace

Gestión **interna** de selección (SGRH-61): candidatos, postulaciones en un tablero por
etapas, puntajes por criterio, documentos del candidato, descarte y contratación, que termina
creando al empleado. Un portal público para que cualquiera se postule **no existe**: es una
propuesta abierta ([portal de reclutamiento](../../../../docs/propuestas/portal-reclutamiento.md)).

| ruta                                      | qué es                                                  | permiso                                                                                                                                      |
| ----------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/recruitment`                            | tablero de postulaciones                                | zona `ACCESO_RECLUTAMIENTO`; escribir pide `RECLUTAMIENTO_WRITE`                                                                             |
| `/recruitment/candidates/[id]`            | ficha del candidato, historial, puntajes, documentos    | `RECLUTAMIENTO_READ`                                                                                                                         |
| `/recruitment/candidates/[id]/hire`       | contratar: el wizard de alta de `employees`, precargado | `RECLUTAMIENTO_WRITE` **y** `EMPLEADOS_WRITE` (invitar usuario y adjuntar documentos, si además tiene `USUARIOS_WRITE` / `DOCUMENTOS_WRITE`) |
| `/settings/recruitment/{stages,criteria}` | etapas (columnas) y criterios de selección              | `CATALOGOS_WRITE`                                                                                                                            |

## Flujo

1. **Nuevo candidato** (`createCandidateWithPostulacion`): candidato y primera postulación en un
   solo submit. No es una RPC atómica: si la postulación falla, se borra el candidato.
   - **Antes, buscar** (`searchCandidates`): si la persona ya existe, se le crea **otra
     postulación** (`createPostulacion`) en vez de duplicarla. La identificación es única por
     empresa, y por eso es obligatoria en el formulario.
2. **Mover de etapa** (`moveApplicationToStage`): el movimiento es **libre, hacia adelante o
   hacia atrás**. Cada movimiento queda en el historial (`sgrh_postulacion_etapas`) con fecha y
   responsable, así que devolver a alguien no borra nada.
3. **Calificar** (`savePostulacionScores`): un puntaje 0–10 por criterio. Re-calificar actualiza
   en vez de duplicar.
4. **Cerrar**: descartar con motivo (`rejectPostulacion`) o **contratar**. El wizard de
   `employees` crea al empleado y **después** `linkPostulacionToEmployee` cierra la postulación
   como `contratado` y la enlaza. Si ese paso falla, el empleado ya existe y queda un aviso.

Estados de una postulación (`pos_estado_final`, con `CHECK`): `en_proceso`, `contratado`,
`descartado`.

## Reglas de negocio

- **El promedio es ponderado** por el peso del área del criterio (`are_peso`, `lib/scoring.ts`),
  y se guarda en `pos_puntaje_promedio` para ordenar el tablero sin recalcular. **Los pesos se
  leen de la base, nunca del cliente**: si viajaran en el formulario, alguien podría inflar el
  criterio donde su candidato salió mejor. Evaluaciones de desempeño usa promedio simple; la
  escala (0–10, entero) es la misma.
- **Cada etapa activa es una columna** del tablero (SGRH-96); ya no hay fases intermedias. El
  orden lo da `eta_orden`. `eta_fase` solo desempata el orden histórico hasta que alguien
  reordena por primera vez.
- **Borrar una columna:** se niega si tiene postulaciones en proceso. Si la etapa ya aparece en
  algún historial, la FK impide borrarla y **se desactiva**: deja de ser columna, pero el
  historial conserva su nombre. Una etapa desactivada se puede restaurar (vuelve como última
  columna) o purgar, si nadie pasó por ella.
- El período de prueba **no** es una etapa: es un tipo de contrato (`PRUEBA`) y se sigue en el
  historial laboral, una vez que la persona ya es empleada.

## Documentos del candidato

- Bucket privado **`cv-candidatos`**, tabla `sgrh_candidato_documentos`, con **permiso propio
  de Reclutamiento** (no `DOCUMENTOS_*`).
- Mismo patrón que los documentos del empleado: validación por magic bytes en el servidor, ruta
  armada con la empresa del JWT y descarga forzada. Se sube el objeto primero y después se
  inserta la fila; si el insert falla, se borra el objeto.

## Datos

| tabla                                                                                     | contiene                                                            |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `sgrh_candidatos`                                                                         | la persona; `cdt_empresa_id` la aísla por empresa                   |
| `sgrh_postulaciones`                                                                      | una postulación: estado, etapa actual, puntaje, empleado resultante |
| `sgrh_postulacion_etapas` · `sgrh_postulacion_puntajes`                                   | historial de movimientos · puntaje por criterio                     |
| `sgrh_cat_etapas_seleccion` · `sgrh_cat_areas_seleccion` + `sgrh_cat_criterios_seleccion` | columnas del tablero · áreas con peso y sus criterios               |

Lectura `RECLUTAMIENTO_READ`, escritura `RECLUTAMIENTO_WRITE`, catálogos `CATALOGOS_WRITE`.
Migraciones: el baseline (`20260101000300`), `20260921000000_reclutamiento_contratacion.sql`
(aislamiento por empresa, unicidad, documentos, estados) y
`20260922000000_criterios_seleccion_color_peso.sql`.

## Trampas

- **Las etapas de selección son un catálogo global** (sin `empresa_id`) y se editan desde
  Configuración: una empresa las cambia para todas. Es deuda conocida (ver
  [settings](../settings/README.md)).
- **`pos_*` del embudo** (estado, etapa actual, empleado, motivo, fecha de cierre, puntaje) **no
  van en el formulario de alta**: los administra el servidor.
- **Los view models nunca exponen la ruta interna del documento** (`cdo_path`).
