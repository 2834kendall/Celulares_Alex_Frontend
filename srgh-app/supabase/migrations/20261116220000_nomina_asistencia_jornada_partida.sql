-- SGRH-110: la nómina lee también el segundo bloque de una plantilla partida.
--
-- nomina_asistencia_periodo (20261002120000) le pasa a la nómina la
-- programación de cada contrato con su plantilla. Desde 20261116200000 una
-- plantilla puede tener un segundo bloque (hor_hora_entrada_2 a
-- hor_hora_salida_2), pero la función no lo devolvía: la nómina medía el día
-- contra el primer bloque solo y pagaba la mitad de una jornada partida.
--
-- Es la misma función, con las dos columnas nuevas en el objeto de la
-- plantilla. Mismos permisos y misma firma. Idempotente.

CREATE OR REPLACE FUNCTION public.nomina_asistencia_periodo(p_lab_ids integer[], p_desde date, p_hasta date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa       integer := (SELECT public.get_empresa_id());
  v_ver_horarios  boolean := (SELECT public.tiene_permiso('HORARIOS_READ'));
  v_labs          integer[];
  v_programacion  jsonb;
  v_marcas        jsonb;
BEGIN
  IF v_empresa IS NULL
     OR p_lab_ids IS NULL OR p_desde IS NULL OR p_hasta IS NULL
     OR NOT (SELECT public.tiene_permiso('ASISTENCIA_READ'))
     OR NOT ((SELECT public.tiene_permiso('NOMINA_READ'))
             OR (SELECT public.tiene_permiso('NOMINA_WRITE'))) THEN
    RETURN jsonb_build_object('programacion', '[]'::jsonb, 'marcas', '[]'::jsonb);
  END IF;

  SELECT coalesce(array_agg(lab_id), '{}')
  INTO v_labs
  FROM public.sgrh_historial_laboral
  WHERE lab_id = ANY (p_lab_ids)
    AND lab_empresa_id = v_empresa
    AND public.sucursal_visible(lab_sucursal_id);

  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'prg_historial_laboral_id',        p.prg_historial_laboral_id,
             'prg_fecha',                       p.prg_fecha,
             'prg_es_dia_libre',                p.prg_es_dia_libre,
             'prg_es_feriado',                  p.prg_es_feriado,
             'prg_hora_entrada_custom',         p.prg_hora_entrada_custom,
             'prg_hora_salida_custom',          p.prg_hora_salida_custom,
             'prg_hora_inicio_almuerzo_custom', p.prg_hora_inicio_almuerzo_custom,
             'prg_hora_fin_almuerzo_custom',    p.prg_hora_fin_almuerzo_custom,
             'prg_hora_inicio_break_custom',    p.prg_hora_inicio_break_custom,
             'prg_hora_fin_break_custom',       p.prg_hora_fin_break_custom,
             'sgrh_cat_horarios', CASE WHEN h.hor_id IS NULL THEN NULL ELSE jsonb_build_object(
               'hor_hora_entrada',         h.hor_hora_entrada,
               'hor_hora_salida',          h.hor_hora_salida,
               'hor_hora_inicio_almuerzo', h.hor_hora_inicio_almuerzo,
               'hor_hora_fin_almuerzo',    h.hor_hora_fin_almuerzo,
               'hor_hora_inicio_break',    h.hor_hora_inicio_break,
               'hor_hora_fin_break',       h.hor_hora_fin_break,
               'hor_hora_entrada_2',       h.hor_hora_entrada_2,
               'hor_hora_salida_2',        h.hor_hora_salida_2
             ) END
           )
           ORDER BY p.prg_historial_laboral_id, p.prg_fecha, p.prg_id
         ), '[]'::jsonb)
  INTO v_programacion
  FROM public.sgrh_programacion_semanal p
  LEFT JOIN public.sgrh_cat_horarios h
    ON h.hor_id = p.prg_horario_id
   AND h.hor_empresa_id = v_empresa
   AND v_ver_horarios
  WHERE p.prg_historial_laboral_id = ANY (v_labs)
    AND p.prg_fecha BETWEEN p_desde AND p_hasta;

  -- Un día más allá del fin: la salida de madrugada de un turno nocturno que
  -- empezó el último día (ver lib/horasPeriodoData.ts).
  SELECT coalesce(jsonb_agg(
           jsonb_build_object(
             'mar_id',                   m.mar_id,
             'mar_historial_laboral_id', m.mar_historial_laboral_id,
             'mar_tipo',                 m.mar_tipo,
             'mar_fecha_hora',           m.mar_fecha_hora
           )
           ORDER BY m.mar_historial_laboral_id, m.mar_fecha_hora, m.mar_id
         ), '[]'::jsonb)
  INTO v_marcas
  FROM public.sgrh_marcas_asistencia m
  WHERE m.mar_historial_laboral_id = ANY (v_labs)
    AND m.mar_fecha_hora >= p_desde
    AND m.mar_fecha_hora < p_hasta + 2;

  RETURN jsonb_build_object('programacion', v_programacion, 'marcas', v_marcas);
END;
$function$;

REVOKE ALL ON FUNCTION public.nomina_asistencia_periodo(integer[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_asistencia_periodo(integer[], date, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
