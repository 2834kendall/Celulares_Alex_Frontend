-- =====================================================================
-- SGRH — Baseline: esquemas
-- =====================================================================
-- Primera migración del baseline. El timestamp 20260101 es sintético a
-- propósito: marca el punto de partida reconstruible del esquema, no una
-- fecha real de cambio.
--
-- Convención del proyecto (ver .context/SGRH_Supabase_Architecture.md):
--   migrations/  → 100% DDL. Cero INSERT, UPDATE o DELETE.
--   seeds/       → datos, siempre convergentes (ON CONFLICT DO NOTHING).
--   scripts/     → correcciones one-off sobre datos existentes, manuales.
-- =====================================================================

-- Funciones privadas/administrativas que NO deben quedar expuestas por
-- PostgREST. Todo lo que viva en public es API pública del proyecto.
CREATE SCHEMA IF NOT EXISTS sgrh_private;
