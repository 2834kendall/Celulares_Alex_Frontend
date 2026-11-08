-- =====================================================================
-- Nómina: cuota obrera de la CCSS sobre lo que paga el patrono en una
-- licencia o incapacidad, editable por tipo de ausencia
-- =====================================================================
-- Hasta ahora el monto que el patrono paga en una licencia de maternidad (o
-- en cualquier incapacidad) iba entero, sin rebajarle la cuota obrera. Las
-- fuentes no coinciden: el Art. 95 del Código de Trabajo (reformado por la
-- Ley 10211) dice que patrono y trabajadora siguen cotizando sobre el salario
-- de la licencia; el folleto del MTSS dice que la CCSS cubre la cuota de la
-- trabajadora. Por eso no se quema: cada tipo de ausencia dice qué % se le
-- rebaja, y arranca en 0 (lo mismo que hacía el sistema).
--
-- El % que paga la CCSS (tau_porcentaje_subsidio_ccss) y desde qué día
-- (tau_paga_ccss_desde_dia) ya existían y ya se editaban: ahora además se
-- usan para mostrar, como dato informativo, cuánto le paga la CCSS.
--
-- Al marcar el pago se congelan la cuota, su % y el estimado de la CCSS,
-- igual que ndt_monto_incapacidad (20261007130000): el comprobante entregado
-- no cambia si después se edita el tipo. NULL = fila sin pagar, o pagada
-- antes de este cambio (sin cuota, como se pagó).
--
-- Idempotente.
-- =====================================================================

ALTER TABLE public.sgrh_cat_tipos_ausencia
  ADD COLUMN IF NOT EXISTS tau_porcentaje_cuota_obrera numeric NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sgrh_tau_porcentaje_cuota_obrera_chk'
  ) THEN
    ALTER TABLE public.sgrh_cat_tipos_ausencia
      ADD CONSTRAINT sgrh_tau_porcentaje_cuota_obrera_chk
      CHECK (tau_porcentaje_cuota_obrera >= 0 AND tau_porcentaje_cuota_obrera <= 100);
  END IF;
END
$$;

COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_porcentaje_cuota_obrera IS
  '% de cuota obrera CCSS que se le rebaja al monto que paga el patrono en esta ausencia (ej. 10.83). 0 = no se rebaja nada.';

ALTER TABLE public.sgrh_nomina_detalle
  ADD COLUMN IF NOT EXISTS ndt_cuota_obrera_incapacidad numeric
    CHECK (ndt_cuota_obrera_incapacidad IS NULL OR ndt_cuota_obrera_incapacidad >= 0),
  ADD COLUMN IF NOT EXISTS ndt_porcentaje_cuota_obrera_incapacidad numeric
    CHECK (
      ndt_porcentaje_cuota_obrera_incapacidad IS NULL
      OR (ndt_porcentaje_cuota_obrera_incapacidad >= 0
          AND ndt_porcentaje_cuota_obrera_incapacidad <= 100)
    ),
  ADD COLUMN IF NOT EXISTS ndt_subsidio_ccss_estimado numeric
    CHECK (ndt_subsidio_ccss_estimado IS NULL OR ndt_subsidio_ccss_estimado >= 0);

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_cuota_obrera_incapacidad IS
  'Cuota obrera rebajada de ndt_monto_incapacidad, congelada al marcar el pago. NULL = sin pagar o pagada antes de 2026-11 (sin cuota).';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_porcentaje_cuota_obrera_incapacidad IS
  '% con que se calculó ndt_cuota_obrera_incapacidad. NULL junto con la cuota.';
COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_subsidio_ccss_estimado IS
  'Estimado de lo que paga la CCSS/INS en los días de la ausencia dentro del periodo, congelado al pagar. Informativo: la empresa no lo paga. NULL = no aplica o sin pagar.';
