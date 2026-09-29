-- =====================================================================
-- Jobs programados (pg_cron)
-- =====================================================================
-- Configuración, no datos: sin estos jobs hay reglas del sistema que dejan
-- de cumplirse solas.
--
-- Convergente: cron.schedule con un nombre que ya existe reemplaza el job
-- en vez de duplicarlo, así que re-ejecutar este archivo no cambia nada.
--
-- pg_cron corre en UTC. Costa Rica es UTC−6 todo el año (sin horario de
-- verano), así que 06:05 UTC = 00:05 hora de Costa Rica.
-- =====================================================================

-- Cierra las terminaciones programadas (preaviso) cuyo último día ya pasó.
-- Ver sgrh_private.cerrar_contratos_programados().
SELECT cron.schedule(
  'cerrar-contratos-programados',
  '5 6 * * *',
  $$SELECT sgrh_private.cerrar_contratos_programados()$$
);
