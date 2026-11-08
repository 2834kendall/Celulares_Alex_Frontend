# Evaluaciones de desempeño (`evaluations`)

> Pendiente de revisión del dueño del módulo. Escrito a partir del código el 2026-11-07.

## Qué hace

Evaluaciones de desempeño por rubros: el evaluador califica cada criterio de 0 a 10 (o lo
marca "no aplica"), agrega notas cualitativas, y la pantalla muestra la evaluación vigente y el
historial de cada colaborador, más métricas por sucursal.

| ruta           | qué es                                                      | permiso                                                                                    |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `/evaluations` | vista individual, historial, métricas por sucursal y rubros | zona `ACCESO_EVALUACIONES`; registrar pide `EVALUACIONES_WRITE`; rubros, `CATALOGOS_WRITE` |

## Reglas de negocio

- **Rubro = un área** (`sgrh_cat_areas_evaluacion`) **con sus criterios**
  (`sgrh_cat_criterios_evaluacion`). Crear un rubro inserta el área y su criterio; si el
  criterio falla, se borra el área (un rubro sin criterio no se puede calificar).
- **Promedio simple** de los criterios que aplican (`averageScore`, `lib/scoring.ts`): todos los
  rubros valen igual. Reclutamiento usa un promedio **ponderado**, con la misma escala 0–10.
- **Clasificación** (`classifyScore`):

  | promedio | resultado         |
  | -------- | ----------------- |
  | ≥ 9      | Sobresaliente (A) |
  | ≥ 8      | Muy Bueno (B)     |
  | ≥ 7      | Bueno (C)         |
  | ≥ 6      | Regular (D)       |
  | < 6      | Deficiente (E)    |

- **Rendimiento bajo** = promedio menor a **7** (`LOW_PERFORMANCE_THRESHOLD`): así lo marcan
  las métricas por sucursal.
- **Registrar** (`createEvaluation`):
  - valida que el contrato sea de la empresa del JWT;
  - toma la **sucursal base del contrato** (`lab_sucursal_id`) como sucursal de la evaluación;
  - guarda el evaluador (`usr_id` del JWT), el período, el promedio y el resultado en texto,
    con estado `completada`;
  - inserta un resultado por criterio. Si eso falla, **borra la evaluación**: sin resultados
    quedaría inconsistente.
- **La vigente es la más reciente** por colaborador; las anteriores forman su historial.
- **Notas cualitativas** (fortalezas, aspectos a mejorar, comentarios): se guardan como JSON en
  `eve_observaciones` y se editan después con `updateEvaluationNotes`. Un texto viejo que no es
  JSON se lee como "comentarios".
- **Borrar un rubro:** si ya tiene evaluaciones, la FK lo impide y **se desactiva**: deja de
  aparecer, pero el historial se conserva.
- **Las notas son enteros.** Los registros históricos con decimales se redondean al mostrarlos.

## Datos

| tabla                                                        | contiene                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `sgrh_evaluaciones` (`eve_*`)                                | una evaluación: contrato, sucursal, evaluador, período, promedio, resultado, notas |
| `sgrh_evaluacion_resultados` (`evr_*`)                       | puntaje, observación y "no aplica" por criterio                                    |
| `sgrh_cat_areas_evaluacion`, `sgrh_cat_criterios_evaluacion` | los rubros                                                                         |

Lectura por zona `ACCESO_EVALUACIONES` (`EVALUACIONES_READ` / `EVALUACIONES_WRITE`), escritura
`EVALUACIONES_WRITE`, rubros `CATALOGOS_WRITE`. Las evaluaciones llevan su propia sucursal, así
que cambiar la sucursal base de un contrato no mueve el historial de evaluaciones.

## Trampas

- **`eve_fecha_evaluacion` se arma con `new Date().toISOString().slice(0, 10)`**: es UTC, así que
  una evaluación registrada después de las 18:00 de Costa Rica queda con la fecha del día
  siguiente. Es la misma trampa que la nómina evita con `payroll/lib/fechas.ts`.
- **La foto del colaborador nunca cruza al cliente como ruta**: la pantalla firma todas las
  fotos de una vez (`signEmployeePhotos`) y solo viaja la URL firmada.
- **Los rubros de evaluación todavía se editan en su propia pantalla**, no desde Configuración.
