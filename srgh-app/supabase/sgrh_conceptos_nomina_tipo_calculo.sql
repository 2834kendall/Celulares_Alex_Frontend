-- Migración: tipo de cálculo y porcentaje configurable por concepto de nómina.
--
-- Hasta ahora el código asumía en duro qué 5 conceptos existían y qué % de
-- CCSS aplicar (CCSS_RATE = 0.1083 en planilla.ts). Esto agrega las columnas
-- para que el catálogo describa CÓMO se calcula cada concepto, en vez de que
-- el código lo adivine:
--
--   monto_manual_ingreso       el usuario escribe el monto a mano; suma al bruto (ej. Comisión)
--   monto_manual_deduccion     el usuario escribe el monto a mano; resta del neto (ej. préstamo)
--   porcentaje_deduccion_bruto con_porcentaje % del salario bruto; se resta (ej. CCSS obrera)
--   horas_extra_automatico     el sistema calcula el monto solo: (horas trabajadas − tope
--                              normal de horas) × salario por hora × con_porcentaje
--                              (ej. 150% = tiempo y medio)
--
-- Seguro de re-ejecutar (idempotente).

ALTER TABLE public.sgrh_cat_conceptos_nomina
  ADD COLUMN IF NOT EXISTS con_tipo_calculo text NOT NULL DEFAULT 'monto_manual_ingreso',
  ADD COLUMN IF NOT EXISTS con_porcentaje numeric(6, 3);

ALTER TABLE public.sgrh_cat_conceptos_nomina
  DROP CONSTRAINT IF EXISTS sgrh_cat_conceptos_nomina_con_tipo_calculo_check;

ALTER TABLE public.sgrh_cat_conceptos_nomina
  ADD CONSTRAINT sgrh_cat_conceptos_nomina_con_tipo_calculo_check
  CHECK (con_tipo_calculo IN (
    'monto_manual_ingreso',
    'monto_manual_deduccion',
    'porcentaje_deduccion_bruto',
    'horas_extra_automatico'
  ));

-- con_porcentaje solo tiene sentido (y es obligatorio) para los dos tipos que
-- lo usan; para los montos manuales debe quedar en NULL.
ALTER TABLE public.sgrh_cat_conceptos_nomina
  DROP CONSTRAINT IF EXISTS sgrh_cat_conceptos_nomina_con_porcentaje_check;

ALTER TABLE public.sgrh_cat_conceptos_nomina
  ADD CONSTRAINT sgrh_cat_conceptos_nomina_con_porcentaje_check
  CHECK (
    (
      con_tipo_calculo IN ('porcentaje_deduccion_bruto', 'horas_extra_automatico')
      AND con_porcentaje IS NOT NULL
      AND con_porcentaje > 0
    )
    OR
    (
      con_tipo_calculo IN ('monto_manual_ingreso', 'monto_manual_deduccion')
      AND con_porcentaje IS NULL
    )
  );

-- Backfill de los 6 conceptos base del machote de planilla (si ya existían
-- del seed original, esto les asigna su tipo de cálculo correcto).
UPDATE public.sgrh_cat_conceptos_nomina
  SET con_tipo_calculo = 'monto_manual_ingreso', con_porcentaje = NULL
  WHERE con_codigo IN ('BASE', 'FERIADO', 'COMISION', 'AJUSTE');

UPDATE public.sgrh_cat_conceptos_nomina
  SET con_tipo_calculo = 'horas_extra_automatico', con_porcentaje = 150
  WHERE con_codigo = 'HORAS_EXTRA';

UPDATE public.sgrh_cat_conceptos_nomina
  SET con_tipo_calculo = 'porcentaje_deduccion_bruto', con_porcentaje = 10.83
  WHERE con_codigo = 'CCSS_OBRERA';

-- La edición manual del detalle de planilla necesita guardar "salario por
-- hora" (para calcular horas extra automáticas) por empleado por periodo.
-- Reutilizamos ndt_horas_ordinarias_diurnas (ya existía, sin uso) como
-- "horas trabajadas en la quincena" — si en el futuro se agrega marcación de
-- asistencia real, puede seguir llenando esa misma columna.
ALTER TABLE public.sgrh_nomina_detalle
  ADD COLUMN IF NOT EXISTS ndt_salario_por_hora numeric NOT NULL DEFAULT 0;
