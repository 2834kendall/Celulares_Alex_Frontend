-- Evita periodos de planilla duplicados (misma sucursal, mes, año y quincena).
-- Sin este índice, createPeriodo() puede crear dos "Julio 2026 · 1ra quincena"
-- para la misma sucursal sin que la app lo detecte.
-- Idempotente: no falla si ya existe.

CREATE UNIQUE INDEX IF NOT EXISTS sgrh_nomina_periodo_unico
  ON public.sgrh_nomina_periodo (npe_sucursal_id, npe_periodo_anio, npe_periodo_mes, npe_quincena);
