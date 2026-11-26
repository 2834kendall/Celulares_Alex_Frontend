-- SGRH-121: medir el rendimiento del escaneo del kiosco sin guardar capturas.
ALTER TABLE public.sgrh_biometria_auditoria
  ADD COLUMN IF NOT EXISTS bia_escaneo_ms integer CHECK (bia_escaneo_ms >= 0),
  ADD COLUMN IF NOT EXISTS bia_fps numeric(5,1) CHECK (bia_fps >= 0);
