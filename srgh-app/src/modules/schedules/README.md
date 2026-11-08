# Horarios (`schedules`)

> Pendiente de revisión del dueño del módulo. Escrito a partir del código el 2026-11-07.

## Qué hace

Plantillas de horario, tipos de jornada y la **programación semanal**: una matriz
colaborador × día donde el gerente asigna, para cada día, un horario, horas personalizadas o
descanso, y **en qué sucursal trabaja ese día**.

| ruta                               | qué es                                        | permiso                                                                                   |
| ---------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/schedule`                        | matriz semanal y plantillas de horario        | `ASISTENCIA_READ` / `ASISTENCIA_WRITE`; plantillas `HORARIOS_READ` / `HORARIOS_WRITE`     |
| `/my-schedule`                     | el colaborador ve **su** semana               | `MI_HORARIO_READ` (solo habilita la pantalla; el filtro por `emp_id` lo hace la consulta) |
| `/settings/schedule/absence-types` | tipos de incapacidad (catálogo de `absences`) | `CATALOGOS_WRITE`                                                                         |

## Conceptos

| concepto                | tabla                                 | qué es                                                                                                                                                                       |
| ----------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Horario** (plantilla) | `sgrh_cat_horarios` (`hor_*`)         | entrada, salida, almuerzo, break (default 10 min), tipo de jornada y color                                                                                                   |
| **Tipo de jornada**     | `sgrh_cat_tipos_jornada` (`tjo_*`)    | nombre, recargo y **horas máximas semanales**: la nómina las usa para el valor de la hora (DIURNA 48, PARCIAL_DIURNA 30, ACUMULATIVA 70). Catálogo global: `CATALOGOS_WRITE` |
| **Celda de la semana**  | `sgrh_programacion_semanal` (`prg_*`) | un día de un contrato: horario, horas personalizadas o día libre, sucursal (`prg_sucursal_id`), feriado, apertura/cierre                                                     |

## Reglas de negocio

- **Cada día lleva un horario, horas personalizadas o "descanso".** Un día sin fila es "Sin
  asignar", y **sin horario no se puede marcar** en el kiosco.
- **`prg_sucursal_id` es dónde trabaja ese día**, y el gerente la rota celda por celda. Es
  distinta de la sucursal base del contrato (`lab_sucursal_id`), que dice en qué planilla se
  paga (ver [contratos](../employees/docs/contratos.md)). El kiosco lista a la gente por la
  programación del día, no por la sucursal base.
- **Toda sucursal que llega del cliente se valida contra la empresa del JWT**
  (`lib/validateBranches.ts`) antes de escribir.
- **Horas personalizadas:** la salida tiene que ser posterior a la entrada, y lo mismo el fin
  del almuerzo y el del break respecto de su inicio.
- **Un día con ausencia aprobada (de día completo) queda bloqueado** en la matriz y no cuenta
  como hueco. Las ausencias intradía (lactancia) no bloquean. La matriz las muestra con
  `absences/lib/overlay`.
- **Horas trabajadas:** los primeros **10 minutos de break están pagados**; solo el exceso se
  resta (`lib/hours.ts`). **Es la misma regla que `attendance/lib/infractions.ts`**
  (`PAID_BREAK_MINUTES`): si cambia una, cambia la otra.
- **Pegar horario y Generar sugerido** escriben varios días de varios colaboradores en una sola
  confirmación (`pasteWeeklySchedule`), con la misma escritura día por día que la asignación
  individual.
  - La **sugerencia** toma, por colaborador y día de la semana, el turno que más se repite en
    su historial (o descanso, si eso es lo más frecuente). Los días con horas personalizadas no
    participan: ese día queda sin sugerencia en vez de inventar una.
  - Un colaborador sin días disponibles (todos bloqueados por ausencia, o sin sugerencia) no se
    toca.
- **Al liquidar un contrato se borran sus turnos posteriores a la salida** (lo hace
  `registrar_liquidacion`; ver [liquidación](../payroll/docs/liquidacion.md)).

## Datos

- **`sgrh_programacion_semanal`**: lectura con `ASISTENCIA_READ` (el propio empleado ve lo
  suyo), escritura con `ASISTENCIA_WRITE`, acotada por `sucursal_visible(prg_sucursal_id)`.
  Tabla en `20260101000300_tablas_operativas.sql`; lectura propia en
  `20260817140000_horarios_select_propio.sql`; otras sucursales en
  `20261002120000_asistencia_nomina_otras_sucursales.sql`.
- **`sgrh_cat_horarios`**: `HORARIOS_READ` / `HORARIOS_WRITE`. Tabla en
  `20260101000200_tablas_core.sql`; color en `20260912000000_horarios_color.sql`.
- **`sgrh_cat_tipos_jornada`**: lectura autenticada, escritura `CATALOGOS_WRITE`. Tabla en
  `20260101000100_tablas_catalogos.sql`.

## Trampas

- **Fechas de la semana: nunca `toISOString()`.** `lib/week.ts` formatea con el calendario
  local: pasar a UTC corre la fecha un día.
- **`isValidISODate` solo mira el formato**: Zod tampoco valida que una fecha exista (ver
  [components/ui](../../components/ui/README.md)).
- **Las horas de Postgres vienen como `HH:mm:ss`**; la UI trabaja en `HH:mm` (`lib/time.ts`).
- **`getShiftTypes` no llama a `requirePermission`**: la lectura la cubre la RLS del catálogo.
  Rompe la convención "un guard en cada Server Action".
