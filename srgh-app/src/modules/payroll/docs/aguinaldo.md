# Aguinaldo

Ruta: `/payroll/aguinaldo-liquidacion`, tab Aguinaldo. Pide `NOMINA_WRITE`. Ley 2412: un
doceavo de los salarios devengados del **1 de diciembre al 30 de noviembre**.

## Reglas

- **Ciclo N = 1 dic N−1 → 30 nov N.** Una quincena de diciembre abre el ciclo del año
  siguiente (`anioCicloAguinaldo`, `lib/liquidacion.ts`).
- **A quién se le debe el ciclo N** (`lib/aguinaldoData.ts`):
  - a quien sigue trabajando;
  - a quien salió **después** del cierre (desde el 1 de diciembre de N): su liquidación solo
    cubre el ciclo siguiente, y el cerrado se le debe completo;
  - a quien salió **antes** del cierre, **no**: su liquidación ya le pagó la parte
    proporcional.
- **Una fila por relación laboral** (`contratosDeLaRelacion`): un traslado en medio del ciclo
  no parte el aguinaldo en dos.
- **El monto sale de las quincenas PAGADAS, no de la provisión acumulada**
  (`sgrh_provisiones_anuales`). La provisión no ve la licencia de maternidad y se desfasa si
  alguna vez falló una suma. Lo que muestra la pestaña y lo que paga `pagarAguinaldo` salen de
  la misma función.
- **Qué cuenta como salario** (`lib/derechos.ts`):
  - la incapacidad no cuenta: es subsidio, y ya va fuera del bruto;
  - la licencia de maternidad sí cuenta: se le devuelve a cada quincena la parte que cubrió;
  - los conceptos con `con_afecta_salario_bruto = false` (viáticos) no cuentan.
- **Mes mínimo:** hace falta un mes continuo con el mismo patrono. Quien entró el 1 de
  noviembre llega al 30 con un mes; quien entró el 2, no.

## Pagar

`pagarAguinaldo` registra el pago en `sgrh_pagos_extraordinarios`, con el monto congelado y
su comprobante. No depende de ninguna quincena. Antes de pagar exige:

- que el ciclo haya cerrado (desde el 1 de diciembre);
- que no queden quincenas del ciclo sin pagar;
- que la persona tenga el mes continuo;
- que no esté ya pagado (lo garantizan los índices únicos, aunque dos personas toquen
  "Pagar" a la vez).

## La provisión (`sgrh_provisiones_anuales`)

`marcarDetallePagado` suma bruto ÷ 12 a `pra_monto_acumulado_aguinaldo` al marcar una fila, y
lo resta al desmarcarla. Es de **mejor esfuerzo**: si falla, el pago queda marcado igual. Por
eso el monto a pagar no se lee de acá; la provisión sirve como referencia contable.

## Datos

| tabla                         | migración                                                                                             |
| ----------------------------- | ----------------------------------------------------------------------------------------------------- |
| `sgrh_provisiones_anuales`    | `20260101000300_tablas_operativas.sql`, índice único en `20260912130000_indice_unico_provisiones.sql` |
| `sgrh_pagos_extraordinarios`  | `20260925120000_pagos_extraordinarios.sql`                                                            |
| limpieza de aguinaldos viejos | `20261008120000_limpiar_aguinaldos_antiguos.sql`                                                      |
