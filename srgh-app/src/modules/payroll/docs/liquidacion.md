# Liquidación (finiquito)

Ruta: `/payroll/aguinaldo-liquidacion`, tab Liquidación. Pide `NOMINA_WRITE`. Las reglas de
cálculo, con su artículo del Código de Trabajo al lado, están en `lib/liquidacion.ts` y
`lib/derechos.ts`. **Un error acá es plata mal pagada a una persona real.**

## Flujo: tres pasos, cada uno de alguien distinto

1. **RRHH termina el contrato** desde el perfil del empleado (fecha y motivo). Se puede
   revertir hasta el paso 2. Ver [contratos](../../employees/docs/contratos.md).
2. **Contabilidad procesa la liquidación** (`procesarLiquidacion` → `registrar_liquidacion`):
   - "Calcular" muestra la vista previa sin guardar nada.
   - "Guardar" es **definitivo**: no se puede deshacer ni procesar dos veces el mismo
     contrato. En la misma transacción se borran los turnos posteriores a la salida.
   - La fecha y el motivo salen de la fila del contrato, nunca del formulario.
   - **No cierra el contrato ni pide `HISTORIAL_WRITE`.**
3. **Pagar** (`pagarLiquidacion`): registra el pago en `sgrh_pagos_extraordinarios` con su
   comprobante y lo marca pagado. **No recalcula**: paga exactamente lo guardado en el paso 2.
   No se cuelga de ninguna quincena.

## De dónde sale cada número

Todo se lee de la **relación laboral** completa (contratos de un traslado incluidos), no solo
del último contrato. Cada quincena usa **su propio salario** (la
[foto del contrato](foto-del-contrato.md)), no el salario de hoy.

- **Salario diario** (preaviso y cesantía): promedio de las últimas **12 quincenas pagadas**
  sin incapacidad, ÷ 30 (Art. 30). Una quincena con incapacidad se salta y entra la anterior;
  una de maternidad cuenta completa. Las quincenas parciales (ingreso o salida) pesan por la
  parte trabajada. Con menos de 2 quincenas, usa el salario del contrato y avisa.
- **Salario pendiente:** solo los días del mes de salida **no pagados por planilla**, en mes
  comercial de 30 días (salir el 28 de febrero es salir a fin de mes).
- **Vacaciones:** días que digita quien liquida. El sistema propone 1 por mes laborado menos
  los tomados y guarda la propuesta al lado. Salario: promedio de las últimas **23 quincenas**
  ("última cincuentena", Art. 157).
- **Aguinaldo proporcional:** salario del ciclo (1 dic → salida), con maternidad al 100 %
  **más el pendiente**, ÷ 12. Cero si no tiene el mes continuo mínimo.
- **Preaviso (Art. 28):** 3-6 meses: 1 semana · más de 6 meses a 1 año: 15 días · desde
  1 año: 1 mes (al año exacto se da el mes).
- **Cesantía (Art. 29):** menos de 3 meses: 0 · 3-6 meses: 7 días · más de 6 meses: 14 días ·
  desde 1 año: días de la tabla × años reconocidos, **tope 8 años**. La tabla sube hasta 22
  días y después baja: es así en la ley.
- **Plazo fijo u obra determinada roto sin justa causa (Art. 31):** **en vez de** preaviso y
  cesantía, 1 día por cada 7 trabajados, mínimo 3. Si se pactó por 6 meses o más, mínimo 22.
- **Horas extra pendientes del banco:** se pagan acá y el movimiento queda pagado.

**Lo que deciden el motivo de salida y quien liquida:**

- `mot_genera_preaviso` y `mot_genera_cesantia` del catálogo de motivos deciden si se paga
  cada rubro. Pensión: sin preaviso, con cesantía.
- **Mutuo acuerdo (Art. 86):** la ley no obliga a pagar cesantía. Quien liquida indica si se
  pactó (`cesantiaPactada`).
- Plazo fijo: quien liquida indica si se pactó por 6 meses o más.
- Un rubro en 0 días lleva una nota con el porqué (`notaRubroSinDias`).

**Qué cotiza:** salario pendiente, vacaciones y horas extra **son salario**: llevan CCSS obrera
y entran al aguinaldo proporcional. Preaviso, cesantía y Art. 31 **son indemnizaciones**: no
cotizan ni pagan renta. El aguinaldo está exento por su propia ley.

## Datos

| tabla / RPC                    | migración                                                                                      |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| `sgrh_liquidaciones`           | `20260101000300_tablas_operativas.sql`                                                         |
| `registrar_liquidacion`        | `20260927120000_contratos_crud.sql`                                                            |
| deducciones y neto             | `20260916120000_liquidacion_deducciones_neto.sql`                                              |
| banco de horas en el finiquito | `20261008130000_liquidacion_banco_horas.sql`, `20261010120000_liquidacion_banco_absorbido.sql` |
| plazo fijo (Art. 31)           | `20261010140000_liquidacion_plazo_fijo.sql`                                                    |
| pago con comprobante           | `20260925120000_pagos_extraordinarios.sql`                                                     |

## Trampas

- **Cesantía: fila de la tabla × años, no suma año por año.** Hay dos lecturas circulando; se
  sigue la del MTSS. Si el contador aplica la otra, el único lugar a cambiar es
  `calcularDiasCesantia`.
- **"Superior a seis meses" es estricto:** seis meses justos no suman un año de cesantía;
  seis meses y un día, sí.
- **Las liquidaciones viejas dejaron horas del banco pendientes.** Esas horas solo se cierran
  como "compensadas", con una nota obligatoria. Ver [banco de horas](banco-de-horas.md).
