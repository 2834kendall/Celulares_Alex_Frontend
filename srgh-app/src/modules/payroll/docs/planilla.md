# Planilla quincenal

Rutas: `/payroll` (períodos), `/payroll/new`, `/payroll/[id]` (detalle), `/payroll/concepts`.
Todas las escrituras piden `NOMINA_WRITE`.

## Estados de un período

- Solo hay dos estados guardados: **`borrador`** y **`pagado`**. La app los recalcula sola
  (`sincronizarEstadoPeriodo`, `lib/estadoPeriodoData.ts`): un período pasa a `pagado`
  cuando todas sus filas están pagadas.
- **"Atrasado" no se guarda, se deriva** (`lib/estadoPeriodo.ts`): es un período sin pagar
  cuyo fin (`npe_fecha_fin_periodo`) ya pasó. Es solo visual, no bloquea nada.
- Un período es **por sucursal** y elige a su gente por la sucursal base del contrato
  (`lab_sucursal_id`).

## Flujo

1. **Crear el período** (`createPeriodo`) lo llena solo con los empleados activos de la
   sucursal y sus horas de asistencia. Si la carga falla, el período queda creado y se carga
   después con "Cargar empleados" (`cargarEmpleadosDesdeAsistencia`, que **solo agrega**: a
   quien ya está no le toca una cifra).
2. **Revisar y corregir**, siempre en `borrador`:
   - **Excel** (`uploadPlanilla`): bajar la plantilla, corregir en bloque y subirla. Si una
     fila no está en el archivo, se borra (`eliminar_filas_planilla`).
   - **Edición manual de una fila** (`updateDetalleManual`).
   - **"Traer … h"** (`refrescarHorasAsistencia`): trae las horas que dice la asistencia
     ahora para una fila.
   - **Recalcular todo** (`recalcularPeriodoDesdeAsistencia`): lo mismo, para todas las
     filas.
3. **Marcar pagado** cada fila (`marcarDetallePagado`): emite el comprobante, suma bruto ÷ 12
   a la provisión de aguinaldo y manda el correo. Desmarcar revierte las tres cosas.

## Reglas

- **La planilla es una foto, no un espejo.** Las horas y los montos se congelan al armarse y
  no se mueven solos. Si se movieran, una quincena pagada cambiaría de monto y dejaría de
  coincidir con su comprobante. Para traer cambios hay que recalcular.
- **Recalcular nunca toca** filas pagadas, períodos fuera de borrador ni horas corregidas a
  mano (esas piden confirmación, o se reportan como omitidas en "recalcular todo"). **Sí
  adopta el contrato de hoy**: ver [foto del contrato](foto-del-contrato.md).
- **Mandan las marcas, pero el Excel puede corregirlas**, y queda registrado. Cada fila guarda
  lo que dijo la asistencia al armarse (`ndt_horas_asistencia`,
  `ndt_horas_extra_asistencia`, `ndt_horas_leidas_en`). Con eso `lib/horasOrigen.ts` responde
  si las horas son las de las marcas o si alguien corrigió una marca después.
- **Valor de la hora = salario ÷ jornada pactada** del contrato (`lib/jornada.ts`), no ÷ horas
  programadas de la quincena. Una quincena son 2 semanas: DIURNA 48 h/sem → 96 h. Salario
  diario = mensual ÷ 30.
- **Horas extra**: se calculan día por día contra el horario programado
  (`lib/horasPeriodo.ts`), no contra un tope quincenal. No se pagan solas: van al
  [banco de horas](banco-de-horas.md).
- **Conceptos**: el motor (`calcularPlanillaPorConceptos`, `lib/planilla.ts`) no conoce
  ningún concepto de antemano; usa los activos de `sgrh_cat_conceptos_nomina`. Excel y
  edición manual usan el mismo motor.
  - `con_afecta_salario_bruto = false`: se paga, pero **no es salario** (viáticos, aguinaldo
    por planilla). Va después de las deducciones y no infla aguinaldo ni cesantía.
  - Las deducciones porcentuales (CCSS obrera) se recalculan siempre sobre el bruto nuevo.
- **Líneas que el recálculo no puede reproducir se conservan** (`lib/lineasAjenas.ts`): las de
  un concepto desactivado (HORAS_EXTRA, una cuota, un embargo) quedan como "monto manual". Si
  no, desaparecían y el bruto bajaba.
- **Incapacidad por enfermedad** (`registrarIncapacidad`, pide también `AUSENCIAS_APPROVE`): el
  patrono paga los primeros 3 días al 50 %, con **tope de 3 días por mes calendario** (no por
  incapacidad). Desde el día 4 paga la CCSS (es informativo). El monto va en una línea aparte,
  después del neto: **nunca suma al bruto**. La licencia de maternidad, en cambio, sí cuenta
  como salario para los derechos.

## Borrar

- **Una fila sin nada que pagar** (₡0, sin horas ni incapacidad, `lib/filaSinNadaQuePagar.ts`)
  se quita con `quitarFilaPlanilla`. Si no se pudiera, el período vencido quedaría en borrador
  para siempre.
- **Un período** (`deletePeriodo` → `eliminar_periodo_nomina`, transaccional) solo se borra
  si **ninguna fila está pagada**. Hay que desmarcar los pagos primero.
- **Una fila cuyas horas extra ya se pagaron o compensaron** no se borra: el movimiento del
  banco cuelga de ella (`lib/dependenciasDetalle.ts`).

## Datos

| tabla / RPC                                                                                    | migración                                           |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `sgrh_nomina_periodo`, `sgrh_nomina_detalle`, `sgrh_nomina_linea_{ingreso,deduccion,patronal}` | `20260101000300_tablas_operativas.sql`              |
| horas de asistencia en la fila                                                                 | `20260912150000_horas_asistencia_en_nomina.sql`     |
| `eliminar_periodo_nomina`, `eliminar_filas_planilla`                                           | `20261008140000_borrado_planilla_transaccional.sql` |
| `ndt_monto_incapacidad`                                                                        | `20261007130000_monto_incapacidad.sql`              |
