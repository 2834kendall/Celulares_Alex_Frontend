-- =====================================================================
-- Auditoría: ausencias, feriados y planilla  (SOLO LECTURA)
-- =====================================================================
-- Qué busca y por qué:
--
-- A) Filas armadas con la regla que olvidaba los días pagados sin trabajar.
--    Entre el cambio que prorratea el salario contra la jornada del contrato
--    y su corrección, un feriado o unas vacaciones REBAJABAN el salario base
--    (6 días de vacaciones → media quincena). La planilla guarda montos, no
--    fórmulas: arreglar el código no mueve una fila ya guardada.
--      · En borrador: se corrige sola con "Recalcular desde asistencia".
--      · Pagadas: no se tocan. Hay que revisarlas y pagar la diferencia aparte.
--
-- B) Días de "incapacidad" que en realidad eran vacaciones o permisos.
--    sincronizarAusenciaEnNomina se corría para CUALQUIER ausencia de día
--    completo: unas vacaciones quedaban anotadas como días de incapacidad
--    CCSS, y un permiso con goce se pagaba al 50 % de la incapacidad, encima
--    del salario. Solo son válidos si en el periodo hay una ausencia
--    certificada por la CCSS o el INS (tau_requiere_documento_ccss).
--
-- No escribe nada. Para reparar B en borradores, ver
-- reparar-dias-incapacidad-en-borrador.sql.
-- =====================================================================

-- A) Filas con feriados o ausencias pagadas dentro de su periodo.
SELECT
  p.npe_id                                  AS periodo,
  p.npe_estado                              AS estado_periodo,
  d.ndt_id                                  AS detalle,
  d.ndt_historial_laboral_id                AS contrato,
  d.ndt_pagado                              AS pagado,
  d.ndt_salario_bruto                       AS bruto_guardado,
  d.ndt_horas_leidas_en                     AS horas_leidas_en,
  CASE
    WHEN d.ndt_pagado THEN 'PAGADA: revisar a mano y pagar la diferencia aparte'
    ELSE 'BORRADOR: usar "Recalcular desde asistencia" en el periodo'
  END                                       AS que_hacer,
  string_agg(DISTINCT motivo.detalle, ', ') AS dias_pagados_sin_trabajar
FROM public.sgrh_nomina_detalle d
JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
JOIN LATERAL (
  SELECT t.tau_codigo || ' ' || a.aus_fecha_inicio || '→' || a.aus_fecha_fin AS detalle
  FROM public.sgrh_ausencias a
  JOIN public.sgrh_cat_tipos_ausencia t ON t.tau_id = a.aus_tipo_ausencia_id
  WHERE a.aus_historial_laboral_id = d.ndt_historial_laboral_id
    AND a.aus_estado = 'aprobada'
    AND NOT t.tau_requiere_documento_ccss
    AND coalesce(t.tau_porcentaje_pago_empleador, 0) > 0
    AND a.aus_fecha_inicio <= p.npe_fecha_fin_periodo
    AND a.aus_fecha_fin    >= p.npe_fecha_inicio_periodo
  UNION ALL
  SELECT 'FERIADO ' || g.prg_fecha
  FROM public.sgrh_programacion_semanal g
  WHERE g.prg_historial_laboral_id = d.ndt_historial_laboral_id
    AND g.prg_es_feriado
    AND NOT g.prg_es_dia_libre
    AND g.prg_fecha BETWEEN p.npe_fecha_inicio_periodo AND p.npe_fecha_fin_periodo
  UNION ALL
  -- Nadie llena prg_es_feriado al programar: el feriado sale del catálogo.
  SELECT 'FERIADO ' || f.fer_fecha
  FROM public.sgrh_cat_feriados f
  JOIN public.sgrh_historial_laboral l ON l.lab_id = d.ndt_historial_laboral_id
  WHERE f.fer_activo
    AND f.fer_es_pago_obligatorio
    AND (f.fer_empresa_id IS NULL OR f.fer_empresa_id = l.lab_empresa_id)
    AND f.fer_fecha BETWEEN p.npe_fecha_inicio_periodo AND p.npe_fecha_fin_periodo
    AND NOT EXISTS (
      SELECT 1 FROM public.sgrh_programacion_semanal g2
      WHERE g2.prg_historial_laboral_id = d.ndt_historial_laboral_id
        AND g2.prg_fecha = f.fer_fecha
        AND g2.prg_es_dia_libre
    )
) motivo ON true
WHERE p.npe_fecha_inicio_periodo IS NOT NULL
  AND p.npe_fecha_fin_periodo IS NOT NULL
GROUP BY p.npe_id, p.npe_estado, d.ndt_id, d.ndt_historial_laboral_id, d.ndt_pagado,
         d.ndt_salario_bruto, d.ndt_horas_leidas_en
ORDER BY d.ndt_pagado DESC, p.npe_id, d.ndt_id;

-- B) Días de incapacidad anotados en filas cuyo periodo no tiene ninguna
--    ausencia CCSS/INS: vinieron de vacaciones o permisos.
--      · sin_subsidio_en_periodo = true → son falsos por completo.
--      · sin_subsidio_en_periodo = false y hay_vacaciones_o_permisos = true →
--        hay una incapacidad real y además vacaciones o permisos en el mismo
--        periodo: la cifra puede estar inflada, revisarla a mano.
SELECT
  p.npe_id                              AS periodo,
  d.ndt_id                              AS detalle,
  d.ndt_historial_laboral_id            AS contrato,
  d.ndt_pagado                          AS pagado,
  d.ndt_dias_incapacidad_empleador      AS dias_empleador,
  d.ndt_dias_incapacidad_ccss           AS dias_ccss,
  NOT EXISTS (
    SELECT 1
    FROM public.sgrh_ausencias a
    JOIN public.sgrh_cat_tipos_ausencia t ON t.tau_id = a.aus_tipo_ausencia_id
    WHERE a.aus_historial_laboral_id = d.ndt_historial_laboral_id
      AND a.aus_estado = 'aprobada'
      AND t.tau_requiere_documento_ccss
      AND a.aus_fecha_inicio <= p.npe_fecha_fin_periodo
      AND a.aus_fecha_fin    >= p.npe_fecha_inicio_periodo
  )                                     AS sin_subsidio_en_periodo,
  EXISTS (
    SELECT 1
    FROM public.sgrh_ausencias a
    JOIN public.sgrh_cat_tipos_ausencia t ON t.tau_id = a.aus_tipo_ausencia_id
    WHERE a.aus_historial_laboral_id = d.ndt_historial_laboral_id
      AND a.aus_estado = 'aprobada'
      AND NOT t.tau_requiere_documento_ccss
      AND NOT t.tau_es_intradia
      AND a.aus_fecha_inicio <= p.npe_fecha_fin_periodo
      AND a.aus_fecha_fin    >= p.npe_fecha_inicio_periodo
  )                                     AS hay_vacaciones_o_permisos
FROM public.sgrh_nomina_detalle d
JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
WHERE (d.ndt_dias_incapacidad_empleador + d.ndt_dias_incapacidad_ccss) > 0
ORDER BY sin_subsidio_en_periodo DESC, d.ndt_pagado DESC, p.npe_id, d.ndt_id;
