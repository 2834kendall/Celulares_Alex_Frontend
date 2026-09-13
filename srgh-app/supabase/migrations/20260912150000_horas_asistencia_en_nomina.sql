-- =====================================================================
-- La asistencia como fuente de las horas de la planilla
-- =====================================================================
-- La planilla ya LEE las horas de las marcas del kiosco, pero no guardaba
-- qué dijeron esas marcas en el momento de armarla. Sin esa foto quedaban
-- tres agujeros, y los tres se cierran con estas columnas:
--
--  1. El Excel podía pisar las horas sin dejar rastro. Si las marcas decían
--     84 h y alguien subía un archivo con 90, ganaba el archivo y nadie se
--     enteraba de que hubo una diferencia.
--
--  2. Si alguien corregía una marca DESPUÉS de armada la planilla, la
--     planilla quedaba vieja y no avisaba: se pagaba un monto que ya no
--     correspondía a lo que decía la asistencia.
--
--  3. No había forma de responder "¿de dónde salió este número?".
--
-- Las tres columnas de horas son nullable a propósito. Un periodo sin
-- fechas no puede leer marcas, y ahí la respuesta honesta es "no se sabe",
-- no un cero que se confunde con "no trabajó".
-- =====================================================================

ALTER TABLE public.sgrh_nomina_detalle
  -- Lo que dijo la asistencia cuando se armó (o se volvió a guardar) esta
  -- fila. NO es lo que se paga: eso sigue en ndt_horas_ordinarias_diurnas y
  -- ndt_horas_extra_al_50. Es la referencia contra la que se comparan.
  ADD COLUMN IF NOT EXISTS ndt_horas_asistencia          numeric,
  ADD COLUMN IF NOT EXISTS ndt_horas_extra_asistencia    numeric,

  -- Cuándo se tomó esa foto. Sirve para explicarle al encargado desde
  -- cuándo está desactualizada una fila.
  ADD COLUMN IF NOT EXISTS ndt_horas_leidas_en           timestamp without time zone,

  -- Quién y cuándo dejó unas horas distintas a las de la asistencia.
  -- Ambas en NULL = las horas que se pagan son las que dijeron las marcas.
  ADD COLUMN IF NOT EXISTS ndt_horas_ajustadas_por_id    integer,
  ADD COLUMN IF NOT EXISTS ndt_horas_ajustadas_en        timestamp without time zone;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sgrh_nom_det_horas_ajustadas_por_id_fkey'
  ) THEN
    ALTER TABLE public.sgrh_nomina_detalle
      ADD CONSTRAINT sgrh_nom_det_horas_ajustadas_por_id_fkey
      FOREIGN KEY (ndt_horas_ajustadas_por_id) REFERENCES public.sgrh_usuarios(usr_id);
  END IF;
END $$;

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_asistencia IS
  'Horas ordinarias que dijeron las marcas de asistencia cuando se armó esta fila. Referencia, no lo que se paga (eso es ndt_horas_ordinarias_diurnas). NULL = no se pudieron leer, p.ej. un periodo sin fechas.';

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_extra_asistencia IS
  'Horas extra que dijeron las marcas cuando se armó esta fila. Misma idea que ndt_horas_asistencia.';

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_leidas_en IS
  'Cuándo se tomó la foto de la asistencia. Si las marcas cambiaron después, la planilla está desactualizada desde este momento.';

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_ajustadas_por_id IS
  'Usuario que dejó unas horas distintas a las de la asistencia (subiendo un Excel corregido o editando el detalle). NULL = las horas son las de las marcas.';

COMMENT ON COLUMN public.sgrh_nomina_detalle.ndt_horas_ajustadas_en IS
  'Cuándo se corrigieron las horas a mano. NULL junto con ndt_horas_ajustadas_por_id = no se corrigieron.';

-- Las filas que ya existen quedan con las cinco en NULL, que es lo correcto:
-- de esas no se guardó ninguna foto, así que el sistema no puede afirmar ni
-- que vienen de la asistencia ni que alguien las cambió. La pantalla las
-- muestra como "sin referencia" hasta que se vuelvan a guardar.
