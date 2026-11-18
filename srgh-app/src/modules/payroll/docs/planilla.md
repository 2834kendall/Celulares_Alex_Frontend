# Planilla quincenal

Rutas: `/payroll` (períodos), `/payroll/new`, `/payroll/[id]` (detalle), `/payroll/concepts`.
Todas las escrituras piden `NOMINA_WRITE`.

## Estados de un período

- Solo hay dos estados guardados: **`borrador`** y **`pagado`**. La app los recalcula sola
  (`sincronizarEstadoPeriodo`, `lib/estadoPeriodoData.ts`): un período pasa a `pagado`
  cuando todas sus filas están pagadas.
- **"Atrasado" no se guarda, se deriva** (`lib/estadoPeriodo.ts`): es un período sin pagar
  cuyo fin (`npe_fecha_fin_periodo`) ya pasó. Es solo visual, no bloquea nada.
- **Un período por quincena para toda la empresa** (desde la migración
  `20261118120000_nomina_periodo_por_empresa.sql`; antes había uno por sucursal). El
  período no tiene sucursal (`npe_sucursal_id` siempre NULL): **la sucursal va en cada fila**
  (`ndt_sucursal_id`). La pone la base al crear la fila —la del contrato en ese momento— y
  no se cambia nunca: un traslado posterior no mueve las quincenas viejas.
- Mientras una empresa siga con períodos por sucursal (`org_nomina_por_empresa = false`), el
  código sigue funcionando igual que antes: todo lo que distingue los dos modelos está en
  `lib/alcancePlanilla.ts`.

## Quién ve qué

- **El encabezado** (fechas y estado) lo ve cualquiera con `NOMINA_READ` de la empresa.
- **Las filas, sus líneas y sus comprobantes** se acotan por `ndt_sucursal_id`: una cuenta
  con sucursales asignadas ve solo las de sus sucursales. La pantalla avisa cuántas filas no
  muestra (`filasOcultas`) y rotula los totales como de lo que se ve.
- **Con una marca elegida en el selector**, la pantalla del período, la plantilla de Excel,
  "Pagar a todos" y el conteo del listado se limitan a las sucursales de esa marca.
- **El estado del período se calcula con TODAS las filas** (`nomina_filas_estado`, sin
  montos): si no, una cuenta de una sucursal marcaría «pagado» el período entero al terminar
  las suyas.
- **Borrar un período de toda la empresa** solo lo puede una cuenta sin sucursal asignada.

## Flujo

1. **Crear el período** (`createPeriodo`) lo llena solo con los empleados activos de las
   sucursales que ve la cuenta (y de la marca elegida) y sus horas de asistencia. Si la
   quincena ya tiene período, no es un error: se va al que existe. Si la carga falla, el
   período queda creado y se carga después con "Cargar empleados"
   (`cargarEmpleadosDesdeAsistencia`, que **solo agrega**: a quien ya está —en cualquier
   sucursal, aunque la cuenta no la vea— no lo vuelve a cargar ni le toca una cifra).
2. **Revisar y corregir**, siempre en `borrador`:
   - **Excel** (`uploadPlanilla`): bajar la plantilla, corregir en bloque y subirla. La
     plantilla lleva sellado en su hoja oculta **su alcance** (las sucursales con que se
     bajó) y el id del contrato de cada fila (columna oculta). Si una fila del alcance no está
     en el archivo, se borra (`eliminar_filas_planilla`); **las de otras sucursales no se
     tocan**. Una plantilla bajada antes de este cambio se rechaza: hay que bajarla de nuevo.
   - **Edición manual de una fila** (`updateDetalleManual`).
   - **"Traer … h"** (`refrescarHorasAsistencia`): trae las horas que dice la asistencia
     ahora para una fila.
   - **Recalcular todo** (`recalcularPeriodoDesdeAsistencia`): lo mismo, para todas las
     filas.
3. **Marcar pagado** cada fila (`marcarDetallePagado`): emite el comprobante, suma bruto ÷ 12
   a la provisión de aguinaldo y manda el correo. Desmarcar revierte las tres cosas.
   **"Pagar a todos"** (`pagarTodosDelPeriodo`) hace lo mismo con todas las filas sin pagar
   de la vista, una por una y con las mismas revisiones; las que no pasan quedan sin pagar y
   se listan con su motivo.

**Mantenimiento**: "Recalcular estado de los períodos" (`recalcularEstadoPeriodos`, solo
cuentas sin sucursal asignada) rehace el estado de todos los períodos con sus filas. Se corre
una vez después de fusionar los períodos por sucursal.

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
| `ndt_sucursal_id`, `sucursales_visibles()`, `org_nomina_por_empresa`                           | `20261117120000_nomina_fila_con_sucursal.sql`       |
| permisos por fila, `nomina_filas_estado`, `nomina_contratos_con_filas_ocultas`                 | `20261117130000_nomina_permisos_por_fila.sql`       |
| un período por empresa (fusión, bitácora `sgrh_private.nomina_periodo_fusion`)                 | `20261118120000_nomina_periodo_por_empresa.sql`     |
