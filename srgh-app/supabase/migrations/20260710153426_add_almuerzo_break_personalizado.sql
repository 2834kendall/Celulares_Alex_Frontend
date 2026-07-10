-- Los horarios personalizados (prg_hora_entrada_custom / prg_hora_salida_custom)
-- no tenian forma de registrar almuerzo ni break, asi que esas horas nunca se
-- restaban del calculo de horas trabajadas para dias con horario personalizado.
-- Se agregan columnas opcionales para ambos, igual que ya existen en
-- sgrh_cat_horarios para las plantillas.
ALTER TABLE public.sgrh_programacion_semanal
  ADD COLUMN IF NOT EXISTS prg_hora_inicio_almuerzo_custom time,
  ADD COLUMN IF NOT EXISTS prg_hora_fin_almuerzo_custom time,
  ADD COLUMN IF NOT EXISTS prg_hora_inicio_break_custom time,
  ADD COLUMN IF NOT EXISTS prg_hora_fin_break_custom time;
