-- =====================================================================
-- Aguinaldo y liquidación: pago con comprobante propio
-- =====================================================================
-- Hasta ahora "pagar" el aguinaldo solo prendía pra_aguinaldo_pagado, sin
-- monto congelado ni comprobante, y la liquidación nunca se marcaba pagada
-- (liq_pagado no lo escribía nadie). Los dos pagos no siempre coinciden con
-- una quincena, y la liquidación se le paga a alguien que ya no trabaja: no
-- se pueden colgar de un periodo de planilla como las horas extra.
--
-- sgrh_pagos_extraordinarios guarda cada pago como un hecho propio: cuánto
-- (bruto, deducciones, neto y las líneas que lo forman), cuándo, y un código
-- de verificación que va impreso en el comprobante, igual que los de la
-- planilla. Es la fuente de verdad de "ya se pagó": un pago no se puede
-- registrar dos veces (índices únicos) ni editarse después (no hay políticas
-- de UPDATE ni DELETE).
--
-- Además:
--  - sgrh_liquidaciones guarda los días de vacaciones que propuso el sistema
--    y el salario diario con que se pagaron (Art. 157 CT: promedio de la
--    última cincuentena, no de seis meses).
--  - Motivos de salida: la pensión no genera preaviso. "Si el trabajador se
--    acoge al beneficio de jubilación … no le corresponde al trabajador
--    conceder preaviso ni a este exigírselo" (MTSS DAJ-AE-69-10). El preaviso
--    indemniza un despido sin aviso, y acogerse a una pensión no lo es. La
--    cesantía se mantiene (Art. 85 CT).
--
-- Idempotente.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.sgrh_pagos_extraordinarios (
  pex_id                    integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pex_tipo                  text NOT NULL CHECK (pex_tipo IN ('aguinaldo', 'liquidacion')),
  pex_historial_laboral_id  integer NOT NULL REFERENCES public.sgrh_historial_laboral (lab_id),
  pex_liquidacion_id        integer REFERENCES public.sgrh_liquidaciones (liq_id),
  pex_anio_aguinaldo        integer,
  pex_monto_bruto           numeric NOT NULL CHECK (pex_monto_bruto >= 0),
  pex_deducciones           numeric NOT NULL DEFAULT 0 CHECK (pex_deducciones >= 0),
  pex_monto_neto            numeric NOT NULL CHECK (pex_monto_neto >= 0),
  pex_lineas                jsonb NOT NULL DEFAULT '[]'::jsonb,
  pex_fecha_pago            date NOT NULL,
  pex_metodo_pago           character varying,
  pex_referencia_bancaria   character varying,
  pex_codigo_verificacion   character varying NOT NULL UNIQUE,
  pex_observaciones         text,
  pex_created_at            timestamp without time zone NOT NULL DEFAULT now(),
  CONSTRAINT sgrh_pex_tipo_referencia_chk CHECK (
    (pex_tipo = 'liquidacion' AND pex_liquidacion_id IS NOT NULL AND pex_anio_aguinaldo IS NULL)
    OR (pex_tipo = 'aguinaldo' AND pex_anio_aguinaldo IS NOT NULL AND pex_liquidacion_id IS NULL)
  )
);

-- Una liquidación se paga una sola vez.
CREATE UNIQUE INDEX IF NOT EXISTS sgrh_pex_liquidacion_unq
  ON public.sgrh_pagos_extraordinarios (pex_liquidacion_id)
  WHERE pex_liquidacion_id IS NOT NULL;

-- Un aguinaldo por contrato y ciclo.
CREATE UNIQUE INDEX IF NOT EXISTS sgrh_pex_aguinaldo_unq
  ON public.sgrh_pagos_extraordinarios (pex_historial_laboral_id, pex_anio_aguinaldo)
  WHERE pex_tipo = 'aguinaldo';

CREATE INDEX IF NOT EXISTS sgrh_pex_historial_idx
  ON public.sgrh_pagos_extraordinarios (pex_historial_laboral_id);

ALTER TABLE public.sgrh_pagos_extraordinarios ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que sgrh_liquidaciones: el empleado ve sus propios pagos;
-- NOMINA_READ ve y NOMINA_WRITE registra los de su empresa.
DROP POLICY IF EXISTS "pagos_extraordinarios_select" ON public.sgrh_pagos_extraordinarios;
CREATE POLICY "pagos_extraordinarios_select" ON public.sgrh_pagos_extraordinarios FOR
SELECT TO authenticated USING (
  pex_historial_laboral_id IN (
    SELECT lab_id FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = (SELECT public.get_emp_id ())
  )
  OR (
    (SELECT public.tiene_permiso ('NOMINA_READ'))
    AND pex_historial_laboral_id IN (
      SELECT lab_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id ())
    )
  )
);

DROP POLICY IF EXISTS "pagos_extraordinarios_insert" ON public.sgrh_pagos_extraordinarios;
CREATE POLICY "pagos_extraordinarios_insert" ON public.sgrh_pagos_extraordinarios FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.tiene_permiso ('NOMINA_WRITE'))
  AND pex_historial_laboral_id IN (
    SELECT lab_id FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id ())
  )
);

COMMENT ON TABLE public.sgrh_pagos_extraordinarios IS
  'Pagos de aguinaldo y liquidación, con su propio comprobante. No dependen de un periodo de planilla. Inmutables: sin UPDATE ni DELETE por RLS.';
COMMENT ON COLUMN public.sgrh_pagos_extraordinarios.pex_lineas IS
  'Líneas del comprobante: [{concepto, dias, monto}]. Congeladas al pagar.';
COMMENT ON COLUMN public.sgrh_pagos_extraordinarios.pex_anio_aguinaldo IS
  'Año del ciclo de aguinaldo (1 dic del año anterior al 30 nov de este año). Solo en tipo aguinaldo.';

-- ─── Liquidación: vacaciones ────────────────────────────────────────────

ALTER TABLE public.sgrh_liquidaciones
  ADD COLUMN IF NOT EXISTS liq_dias_vacaciones_propuestos numeric,
  ADD COLUMN IF NOT EXISTS liq_salario_diario_vacaciones numeric;

COMMENT ON COLUMN public.sgrh_liquidaciones.liq_dias_vacaciones_propuestos IS
  'Días de vacaciones que propuso el sistema (1 por mes laborado menos los tomados). liq_dias_vacaciones_pendientes es lo que se liquidó al final.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_salario_diario_vacaciones IS
  'Salario diario con que se pagaron las vacaciones: promedio de la última cincuentena ÷ 30 (Art. 157 CT). Null en liquidaciones anteriores (se pagaron con liq_salario_diario).';

-- ─── Motivos de salida ──────────────────────────────────────────────────

UPDATE public.sgrh_cat_motivos_salida
SET mot_genera_preaviso = false,
    mot_nota_legal = 'Art. 85 Código de Trabajo. Genera cesantía; no genera preaviso (MTSS DAJ-AE-69-10: al acogerse a la pensión no se concede ni se exige preaviso).'
WHERE mot_codigo IN ('PEN001', 'PEN002')
  AND mot_genera_preaviso;

UPDATE public.sgrh_cat_motivos_salida
SET mot_nota_legal = 'Art. 85 inciso a) Código de Trabajo. Cesantía a derechohabientes.'
WHERE mot_codigo = 'FAL001'
  AND mot_nota_legal = 'Art. 85 inciso e) Código de Trabajo. Cesantía a derechohabientes.';
