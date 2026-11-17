-- SGRH-110: un día puede tener varios tramos, uno por sucursal.
--
-- Hasta ahora la programación asumía una fila por contrato y día: la tienda
-- del día era prg_sucursal_id y no había forma de decir «de 8 a 12 en Infinity
-- y de 13 a 17 en Alex». A partir de acá cada fila es un TRAMO: la parte del día
-- que se trabaja en una sucursal. El modelo de datos ya servía (la fila guarda
-- su sucursal y su horario); lo que faltaba eran las reglas que impiden que un
-- día quede incoherente:
--
--   1. un solo tramo por contrato, fecha y sucursal (índice único);
--   2. los tramos de un mismo día no se traslapan en el tiempo;
--   3. un día libre no convive con otros tramos.
--
-- Las reglas 2 y 3 viven en un trigger y no en un CHECK porque comparan contra
-- OTRAS filas, y porque las horas de un tramo pueden venir de la plantilla
-- (sgrh_cat_horarios) y no de sus columnas *_custom.
--
-- El trigger es SECURITY DEFINER a propósito: la RLS de programación solo deja
-- ver las sucursales del usuario, así que un gerente que escribe el tramo de
-- su tienda no vería el tramo de la otra y el traslape pasaría sin detectarse.
--
-- No toca columnas ni datos. Si ya hubiera dos filas para el mismo contrato,
-- fecha y sucursal, la migración se detiene y las lista en vez de borrar
-- alguna: decidir cuál sobra es de quien conoce el caso.
BEGIN;

-- ─── 1. Un tramo por contrato, fecha y sucursal ──────────────────────────────
DO $$
DECLARE
  v_repetidas int;
  v_dias_con_varias int;
BEGIN
  SELECT count(*) INTO v_repetidas FROM (
    SELECT 1 FROM public.sgrh_programacion_semanal
    GROUP BY prg_historial_laboral_id, prg_fecha, prg_sucursal_id
    HAVING count(*) > 1
  ) d;

  IF v_repetidas > 0 THEN
    RAISE EXCEPTION
      'SGRH-110: hay % combinaciones (contrato, fecha, sucursal) con más de una fila en sgrh_programacion_semanal. Deja una sola por combinación y vuelve a aplicar. Para verlas: SELECT prg_historial_laboral_id, prg_fecha, prg_sucursal_id, count(*) FROM public.sgrh_programacion_semanal GROUP BY 1,2,3 HAVING count(*) > 1',
      v_repetidas;
  END IF;

  -- Días que YA tienen varias filas (en sucursales distintas): quedan como
  -- están, pero conviene saberlo porque desde ahora se leen como tramos.
  SELECT count(*) INTO v_dias_con_varias FROM (
    SELECT 1 FROM public.sgrh_programacion_semanal
    GROUP BY prg_historial_laboral_id, prg_fecha
    HAVING count(*) > 1
  ) d;

  IF v_dias_con_varias > 0 THEN
    RAISE NOTICE 'SGRH-110: % días ya tienen más de una fila de programación; desde ahora se leen como tramos.', v_dias_con_varias;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS sgrh_prg_tramo_unq
  ON public.sgrh_programacion_semanal (prg_historial_laboral_id, prg_fecha, prg_sucursal_id);

COMMENT ON INDEX public.sgrh_prg_tramo_unq IS
  'Un tramo por contrato, fecha y sucursal. También sirve para buscar la programación de un contrato un día.';

-- ─── 2. Tramos que no se traslapan, y día libre sin otros tramos ─────────────
CREATE OR REPLACE FUNCTION sgrh_private.prg_validar_tramos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_inicio time;
  v_fin    time;
  v_otro   record;
BEGIN
  -- Serializa las escrituras del mismo contrato y día: sin esto, dos tramos
  -- que se traslapan y se guardan a la vez pasarían los dos la validación.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'prg_tramos|' || NEW.prg_historial_laboral_id || '|' || NEW.prg_fecha, 0));

  -- Horas efectivas del tramo, con el mismo criterio de la aplicación: es
  -- «personalizado» solo si trae entrada Y salida propias; si no, las de la
  -- plantilla.
  IF NEW.prg_hora_entrada_custom IS NOT NULL AND NEW.prg_hora_salida_custom IS NOT NULL THEN
    v_inicio := NEW.prg_hora_entrada_custom;
    v_fin    := NEW.prg_hora_salida_custom;
  ELSE
    SELECT h.hor_hora_entrada, h.hor_hora_salida INTO v_inicio, v_fin
    FROM public.sgrh_cat_horarios h WHERE h.hor_id = NEW.prg_horario_id;
  END IF;

  FOR v_otro IN
    SELECT p.prg_es_dia_libre,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN p.prg_hora_entrada_custom ELSE h.hor_hora_entrada END AS inicio,
           CASE WHEN p.prg_hora_entrada_custom IS NOT NULL AND p.prg_hora_salida_custom IS NOT NULL
                THEN p.prg_hora_salida_custom ELSE h.hor_hora_salida END AS fin
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

    -- Un tramo sin horas definidas, o que cruza la medianoche, no se puede
    -- comparar con una simple resta de horas: no se valida.
    IF v_inicio IS NOT NULL AND v_fin IS NOT NULL AND v_fin > v_inicio
       AND v_otro.inicio IS NOT NULL AND v_otro.fin IS NOT NULL AND v_otro.fin > v_otro.inicio
       -- Estricto: un tramo que termina a las 12:00 y otro que empieza a las
       -- 12:00 no se traslapan.
       AND v_inicio < v_otro.fin AND v_otro.inicio < v_fin
    THEN
      RAISE EXCEPTION 'Los tramos del mismo día no pueden traslaparse (% a % contra % a %).',
        to_char(v_inicio, 'HH24:MI'), to_char(v_fin, 'HH24:MI'),
        to_char(v_otro.inicio, 'HH24:MI'), to_char(v_otro.fin, 'HH24:MI')
        USING ERRCODE = '23P01';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.prg_validar_tramos() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION sgrh_private.prg_validar_tramos() IS
  'SGRH-110: valida los tramos de un día (sin traslapes, y el día libre no convive con otros tramos). SECURITY DEFINER porque la RLS oculta los tramos de otras sucursales. Solo valida al escribir: cambiar después una plantilla no revalida los días ya programados.';

DROP TRIGGER IF EXISTS sgrh_prg_validar_tramos ON public.sgrh_programacion_semanal;
CREATE TRIGGER sgrh_prg_validar_tramos
  BEFORE INSERT OR UPDATE OF
    prg_historial_laboral_id, prg_fecha, prg_sucursal_id, prg_horario_id,
    prg_es_dia_libre, prg_hora_entrada_custom, prg_hora_salida_custom
  ON public.sgrh_programacion_semanal
  FOR EACH ROW EXECUTE FUNCTION sgrh_private.prg_validar_tramos();

COMMENT ON TABLE public.sgrh_programacion_semanal IS
  'Horario planificado por empleado, día y sucursal: cada fila es un tramo del día (SGRH-110). Un día puede tener varios tramos en sucursales distintas, sin traslaparse. Las columnas *_custom sobreescriben puntualmente el horario del catálogo sin crear una plantilla nueva.';

COMMIT;
