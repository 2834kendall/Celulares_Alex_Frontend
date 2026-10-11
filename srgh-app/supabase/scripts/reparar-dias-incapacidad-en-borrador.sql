-- =====================================================================
-- Reparación: días de "incapacidad" que eran vacaciones o permisos
-- =====================================================================
-- Correr DESPUÉS de revisar la consulta B de auditar-ausencias-en-nomina.sql.
--
-- Pone en 0 ndt_dias_incapacidad_empleador y ndt_dias_incapacidad_ccss SOLO
-- en filas que cumplen las tres cosas:
--   1. No están pagadas. Un comprobante entregado no cambia en silencio.
--   2. Tienen días de incapacidad anotados.
--   3. En su periodo NO hay ninguna ausencia aprobada certificada por la CCSS
--      o el INS: esos días no pueden ser de una incapacidad real.
--
-- Las filas "mezcladas" (una incapacidad real y además vacaciones en el mismo
-- periodo) NO se tocan: no hay forma de separar la cifra sin adivinar.
-- Revisalas a mano con la consulta B.
--
-- Idempotente: correrlo dos veces no cambia nada la segunda vez. Devuelve las
-- filas que corrigió, con los valores que tenían antes.
-- =====================================================================

BEGIN;

WITH a_corregir AS (
  SELECT d.ndt_id, d.ndt_dias_incapacidad_empleador, d.ndt_dias_incapacidad_ccss
  FROM public.sgrh_nomina_detalle d
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
  WHERE NOT d.ndt_pagado
    AND (d.ndt_dias_incapacidad_empleador + d.ndt_dias_incapacidad_ccss) > 0
    AND p.npe_fecha_inicio_periodo IS NOT NULL
    AND p.npe_fecha_fin_periodo IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.sgrh_ausencias a
      JOIN public.sgrh_cat_tipos_ausencia t ON t.tau_id = a.aus_tipo_ausencia_id
      WHERE a.aus_historial_laboral_id = d.ndt_historial_laboral_id
        AND a.aus_estado = 'aprobada'
        AND t.tau_requiere_documento_ccss
        AND a.aus_fecha_inicio <= p.npe_fecha_fin_periodo
        AND a.aus_fecha_fin    >= p.npe_fecha_inicio_periodo
    )
  FOR UPDATE OF d
)
UPDATE public.sgrh_nomina_detalle d
SET ndt_dias_incapacidad_empleador = 0,
    ndt_dias_incapacidad_ccss      = 0
FROM a_corregir c
WHERE d.ndt_id = c.ndt_id
RETURNING d.ndt_id                          AS detalle_corregido,
          c.ndt_dias_incapacidad_empleador  AS dias_empleador_antes,
          c.ndt_dias_incapacidad_ccss       AS dias_ccss_antes;

COMMIT;
