# Comprobantes de pago

## Dos tipos de pago, dos tablas

| pago                    | se registra en               | se emite al                          | ruta del comprobante                   |
| ----------------------- | ---------------------------- | ------------------------------------ | -------------------------------------- |
| Fila de planilla        | `sgrh_comprobantes_pago`     | `marcarDetallePagado`                | `/comprobante/[periodoId]/[detalleId]` |
| Aguinaldo o liquidación | `sgrh_pagos_extraordinarios` | `pagarAguinaldo`, `pagarLiquidacion` | `/comprobante/extraordinario/[pagoId]` |

Cada pago lleva un **código de verificación** `XXXX-XXXX-XXXX`. Se genera con
`generarCodigoVerificacion` (`lib/comprobante.ts`), con un alfabeto sin I, L, O, 0 ni 1, y
es UNIQUE en las dos tablas.

## Reglas

- **El comprobante sale de la fila guardada y de sus líneas, nunca del contrato en vivo.**
  Por eso no necesita la foto del contrato.
- **Una sola definición de qué rubros se imprimen** (`lib/comprobanteContenido.ts` y
  `comprobanteExtraordinarioContenido.ts`). La usan tanto la página como el PDF del correo
  (`lib/comprobantePdf.ts`). Antes había dos copias, y el papel y el PDF podían mostrar
  rubros distintos.
- **Desmarcar un pago de planilla borra su comprobante**: ese código deja de encontrarse,
  porque ese papel ya no vale.
- **Los pagos extraordinarios no se editan ni se borran**: no hay policies de UPDATE ni
  DELETE. Son la fuente de verdad de "ya se pagó", y los índices únicos impiden registrarlos
  dos veces.

## Buscar por código

Nómina → "Buscar comprobante por código" (`buscarComprobante`, `NOMINA_READ`). Busca en las
dos tablas y devuelve la ruta del comprobante. Sirve para comprobar que un papel que alguien
presenta corresponde a un pago registrado. La RLS limita la búsqueda a la empresa del usuario.

## Envío por correo

`lib/envioComprobante.ts` manda el PDF al correo del empleado al pagar.

- **Nunca deshace el pago.** Si el correo no sale, el pago queda registrado y se avisa por
  qué. "Reintentar" llama a `reenviarComprobante`.
- Necesita las variables `SMTP_*` (ver `srgh-app/README.md`). Sin ellas, el pago se marca
  igual y no se envía nada.

## Datos

| tabla                                    | migración                                          |
| ---------------------------------------- | -------------------------------------------------- |
| `sgrh_comprobantes_pago`                 | `20260101000300_tablas_operativas.sql`             |
| código para pagos viejos sin comprobante | `20261010160000_comprobantes_pagos_sin_codigo.sql` |
| `sgrh_pagos_extraordinarios`             | `20260925120000_pagos_extraordinarios.sql`         |
