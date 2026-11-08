# Asistencia (`attendance`)

> Pendiente de revisión del dueño del módulo. Escrito a partir del código y de las specs
> SGRH-101 a 103 el 2026-11-07.

## Qué hace

Marcas de asistencia desde el **kiosco** (reconocimiento facial, con cola offline) y desde el
panel del encargado (marcas manuales), reporte diario y mensual, clasificación de tardías con
catálogo por empresa, justificaciones y la advertencia mensual por tardías o ausencias.

| ruta                                   | qué es                                                       | permiso                                    |
| -------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ |
| `/attendance`                          | panel diario, mensual y "Por justificar"                     | `ASISTENCIA_READ` / `ASISTENCIA_WRITE`     |
| `/kiosco`                              | pantalla de marcaje                                          | `ASISTENCIA_KIOSCO` (o `ASISTENCIA_WRITE`) |
| `/profile`, `/dashboard`               | el colaborador ve sus propias marcas (`MyAttendanceHistory`) | ninguno: lo filtra la RLS                  |
| `/settings/attendance/tardiness-types` | catálogo de tipos de tardía                                  | `CATALOGOS_WRITE`                          |

## Documentos de este módulo

| tema                                                                                                    | archivo                                              |
| ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Tipos de marca y su secuencia, almuerzo y receso, tipos de tardía, justificaciones, advertencia del mes | [docs/marcas-y-tardias.md](docs/marcas-y-tardias.md) |
| Kiosco: acceso, quién aparece, reconocimiento facial, ticket, marca atómica, cola offline               | [docs/kiosco.md](docs/kiosco.md)                     |

## Reglas de negocio (resumen)

- **Solo marca quien está programado hoy en esa sucursal** y no tiene una ausencia aprobada.
- **Cada período (receso, almuerzo) se toma una vez por día**, y uno abierto bloquea todo menos
  su cierre. Salir no exige haber almorzado.
- **Almuerzo de 60 minutos fijos** para todos; receso pagado de 10.
- **Tardía** = llegar después del primer tipo del catálogo de la empresa (por defecto: leve
  desde el minuto 1, tardía desde el 6, grave desde el 11).
- **3 tardías o 1 ausencia en el mes** disparan una advertencia, una vez por mes. Las tardías
  justificadas y los días cubiertos por una ausencia aprobada no cuentan.
- **La geocerca es informativa**: no rechaza marcas.

## Datos

| tabla / RPC                                           | permiso                                                                 | definida en                                                                                                 |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `sgrh_marcas_asistencia`                              | `ASISTENCIA_READ` / `ASISTENCIA_WRITE`; el propio empleado ve las suyas | `20260101000300_tablas_operativas.sql`                                                                      |
| `sgrh_cat_tipos_tardia`                               | lectura: toda la empresa; escritura: `CATALOGOS_WRITE`                  | `20260917130000_catalogo_tipos_tardia.sql`                                                                  |
| justificación de tardías                              | `ASISTENCIA_WRITE`                                                      | `20260917120000_tardias_gradacion_justificacion.sql`                                                        |
| `sgrh_biometria_empleado`, `sgrh_biometria_auditoria` | `BIOMETRIA_WRITE`                                                       | tablas en `20260101000300_tablas_operativas.sql`, policies en `20261106060500_biometria_permiso_propio.sql` |
| `registrar_marca_kiosco_atomica`                      | solo `service_role`                                                     | `20261106032247_kiosk_atomic_mark.sql`                                                                      |
| `sgrh_notificaciones` (advertencias)                  | —                                                                       | `20260101000300_tablas_operativas.sql`                                                                      |

Las marcas se acotan por la **sucursal de la marca** (`mar_sucursal_id`), no por la sucursal
actual del empleado. Las horas trabajadas en otra sucursal se pagan en la planilla del contrato
(`20261002120000_asistencia_nomina_otras_sucursales.sql`).

## Trampas

- **Esconder un botón no es una regla.** Todas las acciones del kiosco son invocables directo:
  la validación de verdad está en `registerKioskMark`, no en la pantalla.
- **El kiosco lee y escribe con el cliente admin**, siempre después de `requireKioskAccess` y
  acotado a su sucursal. Darle a la cuenta `KIOSCO` un permiso de lectura o escritura sobre
  tablas le abriría datos que no debe ver (ver [kiosco](docs/kiosco.md)).
- **`isValidISODate` (`lib/time.ts`) solo mira el formato**: no sirve para validar que una fecha
  exista. Ver [components/ui](../../components/ui/README.md).
- **`PAID_BREAK_MINUTES` está duplicado a propósito** en `schedules/lib/hours.ts`. Si cambia uno,
  cambia el otro.
- **Si una consulta de ausencias falla, es error, no "sin ausencia"**: dejar marcar a alguien
  incapacitado por un fallo de red es justo lo que se quiere evitar.
