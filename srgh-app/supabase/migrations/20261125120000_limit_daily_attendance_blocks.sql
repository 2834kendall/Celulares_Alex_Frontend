-- SGRH-120: la asistencia admite hasta dos bloques efectivos por contrato y día.
BEGIN;

DO $$
DECLARE
  v_dias bigint;
BEGIN
  SELECT count(*) INTO v_dias
  FROM (
    SELECT p.prg_historial_laboral_id, p.prg_fecha
    FROM public.sgrh_programacion_semanal p
    LEFT JOIN public.sgrh_cat_horarios h ON h.hor_id = p.prg_horario_id
    WHERE NOT p.prg_es_dia_libre
    GROUP BY p.prg_historial_laboral_id, p.prg_fecha
    HAVING sum(CASE
      WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL THEN 1
      WHEN h.hor_hora_entrada_2 IS NOT NULL AND h.hor_hora_salida_2 IS NOT NULL THEN 2
      WHEN h.hor_hora_entrada IS NOT NULL AND h.hor_hora_salida IS NOT NULL THEN 1
      ELSE 0
    END) > 2
  ) dias;
  RAISE NOTICE 'SGRH-120: % días existentes tienen más de 2 bloques.', v_dias;
END;
$$;

CREATE OR REPLACE FUNCTION sgrh_private.prg_validar_tramos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_a_i time; v_a_f time;   -- primer bloque del tramo nuevo
  v_b_i time; v_b_f time;   -- segundo bloque (solo plantillas con jornada partida)
  v_otro record;
  v_par  record;
  v_bloques integer;
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

  v_bloques := CASE WHEN NEW.prg_es_dia_libre THEN 0 ELSE
    (v_a_i IS NOT NULL AND v_a_f IS NOT NULL)::integer
      + (v_b_i IS NOT NULL AND v_b_f IS NOT NULL)::integer
  END;

  FOR v_otro IN
    SELECT p.prg_es_dia_libre,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN p.prg_hora_entrada_custom ELSE h.hor_hora_entrada END AS a_i,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN p.prg_hora_salida_custom ELSE h.hor_hora_salida END AS a_f,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN NULL ELSE h.hor_hora_entrada_2 END AS b_i,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN NULL ELSE h.hor_hora_salida_2 END AS b_f,
           sum(CASE
             WHEN p.prg_es_dia_libre THEN 0
             WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL THEN 1
             WHEN h.hor_hora_entrada_2 IS NOT NULL AND h.hor_hora_salida_2 IS NOT NULL THEN 2
             WHEN h.hor_hora_entrada IS NOT NULL AND h.hor_hora_salida IS NOT NULL THEN 1
             ELSE 0
           END) OVER () AS bloques_existentes
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

    IF v_bloques + v_otro.bloques_existentes > 2 THEN
      RAISE EXCEPTION 'Un día no puede tener más de 2 bloques.' USING ERRCODE = '23514';
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
  'SGRH-120: valida hasta dos bloques efectivos por contrato y día, sin traslapes y sin otros tramos en días libres. SECURITY DEFINER porque la RLS oculta tramos de otras sucursales. Los cambios de plantilla no revalidan días ya programados.';

COMMIT;
