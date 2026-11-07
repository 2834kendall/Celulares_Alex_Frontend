# Banco de horas extra

Ruta: `/payroll/banco-horas`. Pide `NOMINA_WRITE`.

## Reglas

- **Las horas extra no se pagan solas en la quincena.** Quedan **pendientes** en el banco
  hasta que el encargado decide qué hacer con ellas.
- **Qué es hora extra** lo decide `lib/horasPeriodo.ts`, día por día contra el horario
  programado de la persona. Quien tiene pactada una jornada de 12 h no genera extra por
  cumplirla; quien tiene 8, la genera a la novena hora.
- **Un movimiento por fila de planilla** (`bhm_nomina_detalle_id`, UNIQUE). Mientras está
  pendiente, se actualiza junto con la fila cada vez que se guardan sus horas
  (`lib/bancoHorasAccrual.ts`). Si las horas bajan a 0, el pendiente se elimina. **Uno ya
  resuelto es historial y no se toca**, aunque se editen las horas de esa quincena.

## Qué se puede hacer con un movimiento pendiente

| acción                                | efecto                                                                                                                                                                                                                  |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pagar** (`pagarBancoHoras`)         | agrega el monto como ingreso al **período en borrador más reciente** del empleado, con el mismo motor de la planilla (la CCSS se recalcula sobre el bruto nuevo). Monto sugerido: horas × valor hora × factor, editable |
| **Compensar** (`compensarBancoHoras`) | se dieron horas libres a cambio. Solo queda anotado: no mueve plata ni recalcula nada (el salario base es fijo, no por hora)                                                                                            |
| **Revertir** (`revertirBancoHoras`)   | vuelve a pendiente y, si se había pagado, saca el monto del período donde entró                                                                                                                                         |

**Factor:** sale de `con_porcentaje` del concepto `HORAS_EXTRA` (150 = 1,5×), editable en
Nómina → Conceptos. El 1,5 de `lib/bancoHoras.ts` es solo el valor de último recurso.

**Candados de revertir** (los dos son sobre el período destino, no sobre el movimiento):

- si a esa persona ya se le marcó el pago de esa quincena, primero hay que desmarcarlo;
- si el período ya no está en borrador, es historia y no se toca.

Un movimiento compensado vuelve a pendiente sin tocar ninguna planilla.

## Al salir de la empresa

- **La liquidación paga las horas pendientes** y deja el movimiento como pagado: son salario,
  así que cotizan y entran al aguinaldo proporcional.
- **Las liquidaciones hechas antes de ese arreglo** las dejaron pendientes, y ya no hay
  quincena donde pagarlas. `lib/bancoHorasLiquidado.ts` las reconoce. **Solo se cierran como
  compensadas y con nota obligatoria**, que diga qué se hizo con ellas (por ejemplo, que se
  pagaron por fuera). Un reingreso (contrato que empieza después de la salida) no queda
  marcado.

## Trampas

- **`HORAS_EXTRA` está desactivado en el catálogo a propósito**, para que no sea una columna
  editable del Excel. Aun así, es la línea con la que se paga: `pagarBancoHoras` la usa forzada
  a "monto manual". Por eso el recálculo la conserva (`lib/lineasAjenas.ts`) en vez de
  borrarla.
- **Una fila cuyas horas ya se pagaron o compensaron no se puede borrar**: el movimiento
  cuelga de ella, y un pago hecho en otra planilla quedaría sin registro.

## Datos

| tabla                          | migración                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `sgrh_banco_horas_movimientos` | `20260101000300_tablas_operativas.sql`                                                         |
| observaciones / nota           | `20261009120000_banco_horas_observaciones.sql`                                                 |
| liquidación absorbe el banco   | `20261008130000_liquidacion_banco_horas.sql`, `20261010120000_liquidacion_banco_absorbido.sql` |
