-- =====================================================================
-- Liquidación: deducciones obreras y neto
-- =====================================================================
-- sgrh_liquidaciones guardaba solo el total bruto. Pero no todo el finiquito
-- cotiza igual: el salario pendiente y las vacaciones pagadas en dinero SON
-- salario y llevan cuota obrera de la CCSS; el preaviso y la cesantía son
-- indemnizaciones y no cotizan; el aguinaldo está exento por su propia ley.
-- Sin estas dos columnas la pantalla mostraba el bruto como si fuera lo que
-- la persona recibe.
--
-- Las filas anteriores quedan con deducciones en 0 y neto = total: no se
-- reinterpreta un finiquito ya entregado.
-- =====================================================================

ALTER TABLE public.sgrh_liquidaciones
  ADD COLUMN IF NOT EXISTS liq_deducciones_obreras numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liq_neto numeric;

UPDATE public.sgrh_liquidaciones
SET liq_neto = liq_total
WHERE liq_neto IS NULL;

ALTER TABLE public.sgrh_liquidaciones
  ALTER COLUMN liq_neto SET NOT NULL,
  ALTER COLUMN liq_neto SET DEFAULT 0;

COMMENT ON COLUMN public.sgrh_liquidaciones.liq_deducciones_obreras IS
  'Cuota obrera (CCSS y otras deducciones porcentuales del catálogo) sobre salario pendiente y vacaciones. Preaviso, cesantía y aguinaldo no cotizan.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_neto IS
  'liq_total menos liq_deducciones_obreras: lo que se le entrega a la persona.';
