-- SGRH-110: una plantilla de horario puede tener un SEGUNDO bloque de trabajo.
--
-- Una plantilla (sgrh_cat_horarios) tenía un solo rango de entrada a salida,
-- con el almuerzo en medio. Una jornada partida de verdad (por ejemplo de 7 a 11
-- y de 16 a 20) no cabe ahí: el hueco no es un almuerzo. Ahora la plantilla
-- puede traer un segundo bloque, hor_hora_entrada_2 a hor_hora_salida_2:
--
--   · sin segundo bloque (NULL en las dos columnas) todo sigue igual;
--   · con segundo bloque, las horas del día son la suma de los dos bloques, y
--     el hueco entre ambos no cuenta (no se descuenta además el almuerzo).
--     Las columnas del almuerzo son NOT NULL, así que la aplicación las llena
--     con ese hueco: salida del primer bloque a entrada del segundo.
--
-- Las horas propias de un día (*_custom) siguen siendo un solo rango.
--
-- El trigger de traslapes (SGRH-110) comparaba un solo rango por tramo; ahora
-- compara todos los bloques de cada tramo entre sí.
BEGIN;

-- ─── 1. Columnas del segundo bloque ──────────────────────────────────────────
ALTER TABLE public.sgrh_cat_horarios
  ADD COLUMN IF NOT EXISTS hor_hora_entrada_2 time without time zone,
  ADD COLUMN IF NOT EXISTS hor_hora_salida_2  time without time zone;

-- Las dos juntas o ninguna.
ALTER TABLE public.sgrh_cat_horarios
  DROP CONSTRAINT IF EXISTS sgrh_cat_hor_bloque2_completo;
ALTER TABLE public.sgrh_cat_horarios
  ADD CONSTRAINT sgrh_cat_hor_bloque2_completo
  CHECK ((hor_hora_entrada_2 IS NULL) = (hor_hora_salida_2 IS NULL));

-- Con segundo bloque, ninguno de los dos cruza la medianoche y el segundo va
-- después del primero (puede empezar justo cuando termina el primero).
ALTER TABLE public.sgrh_cat_horarios
  DROP CONSTRAINT IF EXISTS sgrh_cat_hor_bloque2_orden;
ALTER TABLE public.sgrh_cat_horarios
  ADD CONSTRAINT sgrh_cat_hor_bloque2_orden
  CHECK (
    hor_hora_entrada_2 IS NULL
    OR (
      hor_hora_salida > hor_hora_entrada
      AND hor_hora_salida_2 > hor_hora_entrada_2
      AND hor_hora_entrada_2 >= hor_hora_salida
    )
  );

COMMENT ON COLUMN public.sgrh_cat_horarios.hor_hora_entrada_2 IS
  'Entrada del segundo bloque de la jornada (jornada partida). NULL si la plantilla tiene un solo bloque. Con segundo bloque, las horas del día son la suma de los dos y el hueco entre ellos no se descuenta como almuerzo.';
COMMENT ON COLUMN public.sgrh_cat_horarios.hor_hora_salida_2 IS
  'Salida del segundo bloque de la jornada. Va junto a hor_hora_entrada_2: las dos o ninguna.';

-- ─── 2. Traslape entre los bloques de dos tramos ─────────────────────────────
-- Dos rangos se traslapan si los dos están completos, son válidos (no cruzan la
-- medianoche) y se pisan. Estricto: uno que termina a las 12:00 y otro que
-- empieza a las 12:00 no se traslapan.
CREATE OR REPLACE FUNCTION sgrh_private.prg_rangos_se_traslapan(
  i1 time, f1 time, i2 time, f2 time)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT i1 IS NOT NULL AND f1 IS NOT NULL AND i2 IS NOT NULL AND f2 IS NOT NULL
         AND f1 > i1 AND f2 > i2
         AND i1 < f2 AND i2 < f1
$$;

REVOKE ALL ON FUNCTION sgrh_private.prg_rangos_se_traslapan(time, time, time, time)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION sgrh_private.prg_validar_tramos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_a_i time; v_a_f time;   -- primer bloque del tramo nuevo
  v_b_i time; v_b_f time;   -- segundo bloque (solo plantillas con jornada partida)
  v_otro record;
  v_par  record;
BEGIN
  -- Serializa las escrituras del mismo contrato y día: sin esto, dos tramos
  -- que se traslapan y se guardan a la vez pasarían los dos la validación.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'prg_tramos|' || NEW.prg_historial_laboral_id || '|' || NEW.prg_fecha, 0));

  -- Bloques efectivos del tramo, con el mismo criterio de la aplicación: es
  -- «personalizado» solo si trae entrada Y salida propias (un solo bloque); si
  -- no, los de la plantilla (uno o dos).
  IF NEW.prg_hora_entrada_custom IS NOT NULL AND NEW.prg_hora_salida_custom IS NOT NULL THEN
    v_a_i := NEW.prg_hora_entrada_custom;
    v_a_f := NEW.prg_hora_salida_custom;
  ELSE
    SELECT h.hor_hora_entrada, h.hor_hora_salida, h.hor_hora_entrada_2, h.hor_hora_salida_2
      INTO v_a_i, v_a_f, v_b_i, v_b_f
    FROM public.sgrh_cat_horarios h WHERE h.hor_id = NEW.prg_horario_id;
  END IF;

  FOR v_otro IN
    SELECT p.prg_es_dia_libre,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN p.prg_hora_entrada_custom ELSE h.hor_hora_entrada END AS a_i,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN p.prg_hora_salida_custom ELSE h.hor_hora_salida END AS a_f,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN NULL ELSE h.hor_hora_entrada_2 END AS b_i,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN NULL ELSE h.hor_hora_salida_2 END AS b_f
    FROM public.sgrh_programacion_semanal p
    LEFT JOIN public.sgrh_cat_horarios h ON h.hor_id = p.prg_horario_id
    WHERE p.prg_historial_laboral_id = NEW.prg_historial_laboral_id
      AND p.prg_fecha = NEW.prg_fecha
      AND p.prg_id IS DISTINCT FROM NEW.prg_id
  LOOP
    IF NEW.prg_es_dia_libre OR v_otro.prg_es_dia_libre THEN
      RAISE EXCEPTION 'Un día libre no puede tener otros tramos el mismo día.'
        USING ERRCODE = '23514';
    END IF;

    -- Cada bloque del tramo nuevo contra cada bloque del otro tramo. Un tramo
    -- sin horas definidas, o que cruza la medianoche, no se puede comparar con
    -- una simple resta de horas: no se valida.
    FOR v_par IN
      SELECT n.i AS ni, n.f AS nf, o.i AS oi, o.f AS ofin
      FROM (VALUES (v_a_i, v_a_f), (v_b_i, v_b_f)) AS n(i, f)
      CROSS JOIN (VALUES (v_otro.a_i, v_otro.a_f), (v_otro.b_i, v_otro.b_f)) AS o(i, f)
    LOOP
      IF sgrh_private.prg_rangos_se_traslapan(v_par.ni, v_par.nf, v_par.oi, v_par.ofin) THEN
        RAISE EXCEPTION 'Los tramos del mismo día no pueden traslaparse (% a % contra % a %).',
          to_char(v_par.ni, 'HH24:MI'), to_char(v_par.nf, 'HH24:MI'),
          to_char(v_par.oi, 'HH24:MI'), to_char(v_par.ofin, 'HH24:MI')
          USING ERRCODE = '23P01';
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.prg_validar_tramos() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION sgrh_private.prg_validar_tramos() IS
  'SGRH-110: valida los tramos de un día (sin traslapes entre ningún bloque de ningún tramo, y el día libre no convive con otros tramos). SECURITY DEFINER porque la RLS oculta los tramos de otras sucursales. Solo valida al escribir: cambiar después una plantilla no revalida los días ya programados.';

COMMIT;
