-- =====================================================================
-- ¿Hay duplicados que impidan crear los índices únicos de nómina?
-- =====================================================================
-- Correr ANTES de aplicar 20260912120000_indices_unicos_nomina.sql.
-- Si las dos consultas devuelven 0 filas, la migración pasa limpia.
-- =====================================================================

-- 1. Empleados con más de un detalle en el mismo periodo.
--    Si aparece alguno: revisar cuál de las filas tiene el monto correcto,
--    borrar la otra con sus líneas, y recién entonces aplicar la migración.
SELECT
  d.ndt_nomina_periodo_id            AS periodo,
  d.ndt_historial_laboral_id         AS contrato,
  count(*)                           AS filas,
  array_agg(d.ndt_id ORDER BY d.ndt_id) AS ids_detalle,
  array_agg(d.ndt_salario_neto ORDER BY d.ndt_id) AS netos,
  bool_or(d.ndt_pagado)              AS alguno_pagado
FROM public.sgrh_nomina_detalle d
GROUP BY d.ndt_nomina_periodo_id, d.ndt_historial_laboral_id
HAVING count(*) > 1
ORDER BY periodo, contrato;

-- 2. Pagos con más de un comprobante emitido.
SELECT
  c.com_nomina_detalle_id            AS detalle,
  count(*)                           AS comprobantes,
  array_agg(c.com_codigo_verificacion ORDER BY c.com_id) AS codigos
FROM public.sgrh_comprobantes_pago c
GROUP BY c.com_nomina_detalle_id
HAVING count(*) > 1
ORDER BY detalle;
