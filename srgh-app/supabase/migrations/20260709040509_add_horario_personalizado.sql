ALTER TABLE public.sgrh_programacion_semanal
  ADD COLUMN IF NOT EXISTS prg_hora_entrada_custom time,
  ADD COLUMN IF NOT EXISTS prg_hora_salida_custom time;