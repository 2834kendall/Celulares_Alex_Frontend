-- Corrige dos datos de la migracion 20260727180000 tras verificar la ley
-- vigente:
--
-- 1) Incapacidad por riesgo del trabajo (INS): el subsidio del INS inicia
--    desde el PRIMER dia de incapacidad (no el segundo) y el patrono no
--    tiene obligacion de cubrir dias iniciales; el subsidio es 60% del
--    salario durante los primeros 45 dias.
--
-- 2) Licencia de paternidad: el pago se reparte 50% CCSS / 50% patrono
--    (no 100% CCSS como se sembro originalmente), y la ley que la crea es
--    la Ley N.º 10211 (2022, reforma al Codigo de Trabajo), no la Ley 9822.
UPDATE public.sgrh_cat_tipos_ausencia
SET
  tau_paga_empleador_dias = 0,
  tau_porcentaje_pago_empleador = 0,
  tau_paga_ccss_desde_dia = 1,
  tau_porcentaje_subsidio_ccss = 60,
  tau_referencia_legal = 'Codigo de Trabajo Titulo IV; Ley de Riesgos del Trabajo (subsidio INS: 60% del salario desde el dia 1 hasta el dia 45; el patrono no cubre dias iniciales)'
WHERE tau_codigo = 'INC_RIESGO_INS';

UPDATE public.sgrh_cat_tipos_ausencia
SET
  tau_paga_empleador_dias = 8,
  tau_porcentaje_pago_empleador = 50,
  tau_paga_ccss_desde_dia = 1,
  tau_porcentaje_subsidio_ccss = 50,
  tau_referencia_legal = 'Ley N.º 10211 (2022), reforma al Codigo de Trabajo — sector privado: 8 dias (2 dias/semana durante las 4 semanas posteriores al nacimiento), pago 50% CCSS / 50% patrono'
WHERE tau_codigo = 'LIC_PATERNIDAD';
