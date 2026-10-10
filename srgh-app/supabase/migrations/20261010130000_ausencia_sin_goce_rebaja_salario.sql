-- Ausencia sin goce cargada por Excel o a mano: que rebaje el salario.
--
-- Auditoría de nómina 2, hallazgo 6. El concepto "Ausencia sin Goce de
-- Salario" (DED006) era una deducción más: se restaba del neto, pero el
-- salario bruto, la CCSS y el aguinaldo seguían contando esos días como
-- pagados. Por la ruta de asistencia la ausencia sin goce sí baja el salario
-- base. Decisión del cliente: que por las dos rutas rebaje el salario.
--
-- Se marca con una columna propia y no con con_afecta_salario_bruto, porque
-- esa bandera viene tildada por defecto en el formulario de conceptos y en
-- una deducción no significaba nada: reutilizarla habría convertido en
-- rebajo de salario cualquier préstamo o embargo creado desde la pantalla.

ALTER TABLE public.sgrh_cat_conceptos_nomina
  ADD COLUMN IF NOT EXISTS con_rebaja_salario boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_rebaja_salario IS
  'Solo para deducciones de monto manual. true = el monto es salario que no se ganó (ausencia sin goce): se resta del salario bruto, y con eso de la base de la CCSS y del aguinaldo, en vez de restarse del neto.';

UPDATE public.sgrh_cat_conceptos_nomina
SET con_rebaja_salario = true
WHERE con_tipo_calculo = 'monto_manual_deduccion'
  AND (con_codigo = 'DED006' OR con_formula_base = 'ausencia_sin_goce');
