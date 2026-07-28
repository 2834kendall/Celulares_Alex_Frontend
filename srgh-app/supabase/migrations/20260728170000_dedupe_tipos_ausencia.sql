-- Esta empresa ya tenia su propio catalogo de tipos de ausencia (Incapacidad
-- por Enfermedad, Incapacidad por Riesgo de Trabajo, Incapacidad por
-- Maternidad, Licencia de paternidad, Permiso de Lactancia, Permiso
-- Sindical, Vacaciones, etc.) antes de que existiera esta funcionalidad.
-- La migracion 20260727180000 sembro 5 tipos nuevos que resultaron ser
-- duplicados de esos, con nombres/codigos distintos.
--
-- Esta migracion es idempotente y funciona en cualquier escenario:
--   - Si existe un tipo previo equivalente (por nombre): le aplica los datos
--     legales correctos (dias, porcentajes, tau_es_intradia, referencia) y
--     borra el duplicado sembrado por esta app.
--   - Si no existe un tipo previo equivalente (empresa nueva sin catalogo
--     propio): no hace nada, el tipo sembrado por esta app queda como esta.
--
-- tau_referencia_legal es varchar(100): los textos deben mantenerse breves.
DO $$
DECLARE
  dup_id integer;
BEGIN
  -- Incapacidad por enfermedad (CCSS)
  SELECT tau_id INTO dup_id FROM public.sgrh_cat_tipos_ausencia
  WHERE tau_nombre ILIKE '%enfermedad%' AND tau_nombre NOT ILIKE '%riesgo%'
    AND tau_codigo <> 'INC_ENF_CCSS'
  LIMIT 1;

  IF dup_id IS NOT NULL THEN
    UPDATE public.sgrh_cat_tipos_ausencia SET
      tau_requiere_documento_ccss = true,
      tau_paga_empleador_dias = 3,
      tau_porcentaje_pago_empleador = 50,
      tau_paga_ccss_desde_dia = 4,
      tau_porcentaje_subsidio_ccss = 60,
      tau_descuenta_vacaciones = false,
      tau_es_protegida = false,
      tau_es_intradia = false,
      tau_referencia_legal = 'Reglamento del Seguro de Salud CCSS, arts. 36-40'
    WHERE tau_id = dup_id;

    DELETE FROM public.sgrh_cat_tipos_ausencia WHERE tau_codigo = 'INC_ENF_CCSS';
  END IF;

  -- Incapacidad por riesgo del trabajo (INS)
  SELECT tau_id INTO dup_id FROM public.sgrh_cat_tipos_ausencia
  WHERE tau_nombre ILIKE '%riesgo%trabajo%'
    AND tau_codigo <> 'INC_RIESGO_INS'
  LIMIT 1;

  IF dup_id IS NOT NULL THEN
    UPDATE public.sgrh_cat_tipos_ausencia SET
      tau_requiere_documento_ccss = true,
      tau_paga_empleador_dias = 0,
      tau_porcentaje_pago_empleador = 0,
      tau_paga_ccss_desde_dia = 1,
      tau_porcentaje_subsidio_ccss = 60,
      tau_descuenta_vacaciones = false,
      tau_es_protegida = true,
      tau_es_intradia = false,
      tau_referencia_legal = 'Codigo de Trabajo Titulo IV; Ley de Riesgos del Trabajo (INS, subsidio 60% desde dia 1)'
    WHERE tau_id = dup_id;

    DELETE FROM public.sgrh_cat_tipos_ausencia WHERE tau_codigo = 'INC_RIESGO_INS';
  END IF;

  -- Licencia por maternidad
  SELECT tau_id INTO dup_id FROM public.sgrh_cat_tipos_ausencia
  WHERE tau_nombre ILIKE '%matern%'
    AND tau_codigo <> 'LIC_MATERNIDAD'
  LIMIT 1;

  IF dup_id IS NOT NULL THEN
    UPDATE public.sgrh_cat_tipos_ausencia SET
      tau_requiere_documento_ccss = true,
      tau_paga_empleador_dias = 120,
      tau_porcentaje_pago_empleador = 50,
      tau_paga_ccss_desde_dia = 1,
      tau_porcentaje_subsidio_ccss = 50,
      tau_descuenta_vacaciones = false,
      tau_es_protegida = true,
      tau_es_intradia = false,
      tau_referencia_legal = 'Codigo de Trabajo, art. 95 (4 meses; 50% patrono + 50% CCSS)'
    WHERE tau_id = dup_id;

    DELETE FROM public.sgrh_cat_tipos_ausencia WHERE tau_codigo = 'LIC_MATERNIDAD';
  END IF;

  -- Licencia de paternidad
  SELECT tau_id INTO dup_id FROM public.sgrh_cat_tipos_ausencia
  WHERE tau_nombre ILIKE '%patern%'
    AND tau_codigo <> 'LIC_PATERNIDAD'
  LIMIT 1;

  IF dup_id IS NOT NULL THEN
    UPDATE public.sgrh_cat_tipos_ausencia SET
      tau_requiere_documento_ccss = true,
      tau_paga_empleador_dias = 8,
      tau_porcentaje_pago_empleador = 50,
      tau_paga_ccss_desde_dia = 1,
      tau_porcentaje_subsidio_ccss = 50,
      tau_descuenta_vacaciones = false,
      tau_es_protegida = true,
      tau_es_intradia = false,
      tau_referencia_legal = 'Ley N. 10211 (2022); Codigo de Trabajo (8 dias, 50% CCSS + 50% patrono)'
    WHERE tau_id = dup_id;

    DELETE FROM public.sgrh_cat_tipos_ausencia WHERE tau_codigo = 'LIC_PATERNIDAD';
  END IF;

  -- Periodo / permiso de lactancia
  SELECT tau_id INTO dup_id FROM public.sgrh_cat_tipos_ausencia
  WHERE tau_nombre ILIKE '%lactancia%'
    AND tau_codigo <> 'PERM_LACTANCIA'
  LIMIT 1;

  IF dup_id IS NOT NULL THEN
    UPDATE public.sgrh_cat_tipos_ausencia SET
      tau_requiere_documento_ccss = false,
      tau_paga_empleador_dias = 0,
      tau_porcentaje_pago_empleador = 100,
      tau_paga_ccss_desde_dia = NULL,
      tau_porcentaje_subsidio_ccss = NULL,
      tau_descuenta_vacaciones = false,
      tau_es_protegida = true,
      tau_es_intradia = true,
      tau_referencia_legal = 'Codigo de Trabajo, art. 97 (1 hora diaria, 100% pagada por patrono)'
    WHERE tau_id = dup_id;

    DELETE FROM public.sgrh_cat_tipos_ausencia WHERE tau_codigo = 'PERM_LACTANCIA';
  END IF;
END $$;
