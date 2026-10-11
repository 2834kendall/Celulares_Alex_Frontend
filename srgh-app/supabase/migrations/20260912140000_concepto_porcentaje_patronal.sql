-- =====================================================================
-- Nuevo tipo de cálculo: porcentaje patronal sobre el bruto
-- =====================================================================
-- Las cargas patronales son lo que la EMPRESA le paga a la CCSS y demás
-- instituciones POR ENCIMA del salario. No se le rebajan a nadie, no
-- cambian el salario neto ni el aguinaldo: son el costo real de tener a
-- alguien en planilla, y sirven para cuadrar contra la factura de la CCSS.
--
-- Hasta ahora no había forma de calcularlas. Los cuatro conceptos
-- patronales del catálogo estaban guardados como 'monto_manual_ingreso'
-- sin porcentaje y el motor los excluía por con_tipo, así que
-- ndt_total_cargas_patronales siempre quedaba en 0.
--
-- 'porcentaje_patronal_bruto' se calcula sobre la MISMA base que la cuota
-- obrera: la CCSS cobra las dos partes sobre el salario cotizable, así que
-- un ingreso exento lo está para los dos lados.
--
-- El porcentaje sigue siendo obligatorio y mayor a 0, igual que para los
-- otros dos tipos que lo usan. Un concepto patronal que todavía no se
-- quiere calcular se deja en su tipo manual (que es como quedan PAT002,
-- PAT003 y PAT004) y se pasa a este tipo el día que se le ponga su
-- porcentaje desde Nómina → Conceptos.
-- =====================================================================

ALTER TABLE public.sgrh_cat_conceptos_nomina
  DROP CONSTRAINT IF EXISTS sgrh_cat_conceptos_nomina_con_tipo_calculo_check;

ALTER TABLE public.sgrh_cat_conceptos_nomina
  ADD CONSTRAINT sgrh_cat_conceptos_nomina_con_tipo_calculo_check CHECK (
    con_tipo_calculo IN (
      'monto_manual_ingreso',
      'monto_manual_deduccion',
      'porcentaje_deduccion_bruto',
      'porcentaje_patronal_bruto',
      'horas_extra_automatico'
    )
  );

ALTER TABLE public.sgrh_cat_conceptos_nomina
  DROP CONSTRAINT IF EXISTS sgrh_cat_conceptos_nomina_con_porcentaje_check;

ALTER TABLE public.sgrh_cat_conceptos_nomina
  ADD CONSTRAINT sgrh_cat_conceptos_nomina_con_porcentaje_check CHECK (
    (
      con_tipo_calculo IN (
        'porcentaje_deduccion_bruto',
        'porcentaje_patronal_bruto',
        'horas_extra_automatico'
      )
      AND con_porcentaje IS NOT NULL
      AND con_porcentaje > 0
    )
    OR (
      con_tipo_calculo IN ('monto_manual_ingreso', 'monto_manual_deduccion')
      AND con_porcentaje IS NULL
    )
  );

COMMENT ON COLUMN public.sgrh_cat_conceptos_nomina.con_tipo_calculo IS
  'Cómo se calcula el concepto: monto_manual_ingreso, monto_manual_deduccion, porcentaje_deduccion_bruto (% del bruto que se le rebaja al trabajador), porcentaje_patronal_bruto (% del bruto que paga la empresa encima del salario) u horas_extra_automatico.';
