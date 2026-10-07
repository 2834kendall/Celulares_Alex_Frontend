-- Monto de la incapacidad congelado al marcar el pago.
--
-- Hasta ahora solo se guardaban los DÍAS de incapacidad que paga el patrono
-- (ndt_dias_incapacidad_empleador); el monto se calculaba cada vez que se
-- abría la planilla o el comprobante, con el salario base y el porcentaje del
-- catálogo de ESE momento. Si después cambiaba alguno de los dos, un
-- comprobante ya pagado mostraba otra cifra.
--
-- Al marcar el pago se guardan el monto y el porcentaje con que se calculó; al
-- desmarcarlo se borran y la fila vuelve a calcularse en vivo. Las filas
-- pagadas antes de esta migración quedan en NULL y se siguen calculando como
-- hasta ahora.

ALTER TABLE public.sgrh_nomina_detalle
  ADD COLUMN IF NOT EXISTS ndt_monto_incapacidad numeric
    CHECK (ndt_monto_incapacidad IS NULL OR ndt_monto_incapacidad >= 0),
  ADD COLUMN IF NOT EXISTS ndt_porcentaje_incapacidad numeric
    CHECK (ndt_porcentaje_incapacidad IS NULL OR ndt_porcentaje_incapacidad >= 0);

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_monto_incapacidad IS
  'Monto de incapacidad que paga el patrono, congelado al marcar el pago. NULL = se calcula en vivo (fila sin pagar, o pagada antes de 2026-10).';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_porcentaje_incapacidad IS
  'Porcentaje del salario con que se calculó ndt_monto_incapacidad. NULL junto con el monto.';
