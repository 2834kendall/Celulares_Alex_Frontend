# Ausencias (`absences`)

> Pendiente de revisión del dueño del módulo. Escrito a partir del código el 2026-11-07.

## Qué hace

Registro de incapacidades, licencias, vacaciones y permisos, y el catálogo de tipos de
ausencia. Las ausencias se superponen sobre la matriz de horarios, y las que afectan el pago se
reparten solas en la planilla.

| ruta                               | qué es                                            | permiso                                |
| ---------------------------------- | ------------------------------------------------- | -------------------------------------- |
| `/schedule` (panel de ausencias)   | registrar, editar y borrar ausencias de la semana | `AUSENCIAS_READ` / `AUSENCIAS_APPROVE` |
| `/settings/schedule/absence-types` | catálogo de tipos de ausencia                     | `CATALOGOS_WRITE`                      |

## Reglas de negocio

- **Registrar una ausencia exige `AUSENCIAS_APPROVE`**, también para crearla, editarla o
  borrarla: la RLS de `sgrh_ausencias` lo pide para escribir a nombre de otra persona. **Se
  guarda directamente como `aprobada`**: no hay flujo de solicitud. Si va a existir "solicitar
  sin aprobar" es una decisión de negocio pendiente (ver
  [permisos y roles](../../../../docs/arquitectura/permisos-y-roles.md)).
- **Dos ausencias de la misma persona no pueden traslaparse.**
- **Una incapacidad puede cubrir períodos no continuos** (p. ej. lunes a miércoles de una
  semana y miércoles a jueves de la siguiente). Cada rango es su propio registro en
  `sgrh_ausencias`; `createAusenciasBulk` los inserta en un único statement, así que entran
  todos o ninguno.
- **Días:** se cuentan naturales y hábiles; hábiles excluye **solo los domingos**
  (`lib/dateRange.ts`). La liquidación usa la misma regla para descontar vacaciones.
- **Efecto en la planilla:** si el tipo afecta el pago (todo menos los intradía), los días se
  reparten solos en los períodos de nómina que se traslapan, respetando el tope mensual de días
  que paga el patrono (`payroll/lib/ausenciaNominaSync.ts`). Es de **mejor esfuerzo**: si
  falla, la ausencia queda guardada y la planilla se corrige a mano. Los rangos se procesan
  **en serie**, a propósito: cada uno lee el tope que dejó usado el anterior. Las filas de
  planilla ya pagadas no se tocan.
- **Efecto en asistencia y horarios:** un día cubierto por una ausencia (de día completo) no
  cuenta como ausencia ni como tardía en el resumen del mes, queda bloqueado en la matriz de
  horarios, y en el kiosco esa persona no puede marcar.

## Catálogo de tipos (`sgrh_cat_tipos_ausencia`)

| campo                                                      | qué decide                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tau_codigo`                                               | identificador estable: **se fija al crear y no se edita**. La nómina busca tipos por código. Sembrados: `INC_ENF`, `INC_MAT`, `INC_RT`, `LACT`, `LIC_PAT`, `VAC` |
| `tau_paga_empleador_dias`, `tau_porcentaje_pago_empleador` | cuántos días por mes calendario paga el patrono y a qué porcentaje (incapacidad por enfermedad: 3 días al 50 %)                                                  |
| `tau_paga_ccss_desde_dia`, `tau_porcentaje_subsidio_ccss`  | desde qué día y cuánto subsidia la CCSS (informativo: no pasa por la planilla)                                                                                   |
| `tau_descuenta_vacaciones`                                 | si los días se restan de las vacaciones                                                                                                                          |
| `tau_es_intradia`                                          | se mide en horas dentro de un día (lactancia): no reemplaza el día, no bloquea la matriz y no va a planilla                                                      |
| `tau_es_protegida`                                         | ausencia con fuero legal (maternidad, paternidad, riesgo de trabajo, sindical, huelga): **no puede motivar un despido**                                          |
| `tau_requiere_documento_ccss`, `tau_referencia_legal`      | si exige boleta de la CCSS, y la norma que la respalda                                                                                                           |

- **Es un catálogo global**, sin `empresa_id`: lo que una empresa cambia, cambia para todas.
- **No se puede borrar un tipo que tenga ausencias registradas**: la FK lo impide, y
  `lib/tipoAusenciaErrors.ts` lo explica en pantalla.

## Datos

| tabla                     | permiso                                                 | definida en                                                              |
| ------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| `sgrh_ausencias`          | lectura `AUSENCIAS_READ`; escritura `AUSENCIAS_APPROVE` | `20260101000300_tablas_operativas.sql`                                   |
| `sgrh_cat_tipos_ausencia` | lectura autenticada; escritura `CATALOGOS_WRITE`        | `20260101000100_tablas_catalogos.sql`, sembrado en `seeds/02_catalogos/` |

## Trampas

- **La matriz de horarios no lee `sgrh_ausencias` directo**: `lib/overlay.ts` expande cada
  ausencia en una entrada por día de la semana visible, para no acoplar `schedules` a las
  tablas de este módulo.
- **Las fechas ISO se comparan como texto** (`YYYY-MM-DD` ordena bien), y los días se calculan
  con `new Date('…T00:00:00')` en hora local. Nunca `toISOString()`.
- **`getAusenciaTypes` no llama a `requirePermission`**: la lectura la cubre la RLS del
  catálogo. Rompe la convención "un guard en cada Server Action".
- **`types.ts` agrega `tau_es_intradia` a mano** sobre el tipo generado. Es un remanente:
  `database.types.ts` ya lo trae, así que esa intersección se puede quitar.
