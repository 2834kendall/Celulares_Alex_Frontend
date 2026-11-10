# Foto del contrato en cada fila de planilla

## La regla

**Toda escritura que cree o recalcule una fila de `sgrh_nomina_detalle` guarda la foto del
contrato con que se calculó.** Son tres columnas (SGRH-98,
`20261011120000_foto_salario_nomina.sql`):

| columna                        | copia de                                |
| ------------------------------ | --------------------------------------- |
| `ndt_salario_base_contrato`    | `lab_salario_base`                      |
| `ndt_salario_real_contrato`    | `lab_salario_real`                      |
| `ndt_horas_semanales_contrato` | `tjo_horas_max_semanales` de la jornada |

**`NULL` significa "usar el contrato en vivo"**: son las filas anteriores a 2026-10. Siguen
funcionando como antes, igual que `ndt_monto_incapacidad`.

## Por qué existe

La planilla congelaba los **resultados** (bruto, neto, líneas) pero no los **insumos**. Cuatro
caminos volvían a leer el contrato en vivo, así que editarlo alteraba cuentas ya hechas:

1. la detección de «base desactualizado» en `getPeriodoDetail`;
2. el **rechazo del pago** en `marcarDetallePagado` cuando esa detección no cuadraba;
3. la incapacidad de una fila sin pagar;
4. el salario que la liquidación y el aguinaldo le asignan a cada quincena pasada.

Por eso existía el bloqueo "este contrato ya pasó por planilla y no se puede editar". Con la
foto, el contrato se edita siempre (reglas en
[contratos](../../employees/docs/contratos.md)).

## Quién la escribe y quién la lee

Escribir: `fotoDelContrato()` de `lib/prellenadoAsistencia.ts`.

| escritura                     | archivo                                     |
| ----------------------------- | ------------------------------------------- |
| crea las filas del período    | `actions/cargarEmpleadosDesdeAsistencia.ts` |
| recalcula desde el Excel      | `actions/uploadPlanilla.ts`                 |
| recalcula una fila            | `actions/refrescarHorasAsistencia.ts`       |
| recalcula tras edición manual | `actions/updateDetalleManual.ts`            |

Leer: `contratoDeLaFila(fila, enVivo)`. La usan `actions/getPeriodoDetail.ts`,
`actions/marcarDetallePagado.ts` y `lib/derechosData.ts` (`salarioDeLaFoto`, para que cada
quincena de la liquidación y del aguinaldo use su propio salario).

**Si agregás una ruta que crea o recalcula filas y no escribe la foto**, la fila se comporta
como una vieja y vuelve a seguir al contrato en vivo, en silencio. Checklist completo: skill
`nomina-detalle-escritura`.

**Recalcular adopta el contrato de hoy y reescribe la foto.** Es a propósito: es la forma de
corregir un salario mal digitado que todavía no se pagó. Las filas pagadas no se recalculan.

**No la necesita** (no "arreglarlo"): el comprobante (`lib/envioComprobante.ts`,
`lib/comprobanteContenido.ts`) sale todo de la fila guardada y de sus líneas, nunca del
contrato.

## «Base desactualizado»

`evaluarBaseGuardado` compara la fila con la foto del contrato y con la asistencia **de hoy**.
Lo que tiene que detectar es que cambiaron las horas.

- **Solo salta por el AJUSTE.** Un BASE que no coincide se toma como corrección a mano y se
  respeta (`esBaseDelSistema`). Lo que delata un cálculo viejo es el AJUSTE, que siempre lo
  pone el sistema. Por eso, con un contrato donde `lab_salario_real` es igual al base, no hay
  ajuste y la detección no opina. Para testear esa rama hace falta un contrato con real
  distinto del base.
- **Punto ciego conocido:** devuelve `desactualizado: false` cuando no hay asistencia
  utilizable, así que en un período sin asistencia la detección no opina. Es un
  comportamiento anterior a la foto.
