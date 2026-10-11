-- =====================================================================
-- Nómina: las horas de un turno cubierto en OTRA sucursal también cuentan
-- =====================================================================
-- Cubrir turnos en otra sucursal se hace moviendo el día en el horario
-- semanal (SGRH-84): la fila de sgrh_programacion_semanal queda con
-- prg_sucursal_id = la sucursal donde se trabaja, y el kiosco de esa
-- sucursal guarda la marca con mar_sucursal_id = esa misma sucursal. El
-- contrato no cambia: el día sigue siendo del mismo lab_id y se paga en la
-- planilla de la sucursal del contrato.
--
-- La planilla ya pedía la asistencia por contrato (sin filtrar sucursal),
-- pero la leía con la sesión del usuario, y RLS sí filtra por sucursal:
-- marcas_select y programacion_select exigen sucursal_visible(mar/prg_
-- sucursal_id). Para quien arma la planilla con acceso solo a su sucursal,
-- las marcas y el horario del día cubierto en otra sucursal no existían.
-- RLS no da error: el día quedaba "sin programar" (contaba como jornada no
-- cumplida) y sus horas no se sumaban. La persona cobraba de menos por haber
-- ido a ayudar a otra tienda. Con acceso a toda la empresa (ADMIN) sí se
-- contaban: el monto dependía de quién armara la planilla.
--
-- nomina_asistencia_periodo devuelve la programación y las marcas de los
-- contratos pedidos, sin importar en qué sucursal ocurrieron. La
-- autorización se mide contra el CONTRATO, que es lo que la planilla paga:
--   * el usuario tiene ASISTENCIA_READ (lo mismo que ya pedía RLS para
--     leer marcas y horario) y NOMINA_READ o NOMINA_WRITE (es para nómina);
--   * el contrato es de su empresa y de una sucursal que él ve.
-- Sin esos permisos devuelve listas vacías, igual que RLS: la planilla ya
-- sabe tratar "sin datos de asistencia".
--
-- El horario del catálogo va solo con HORARIOS_READ, como en la policy de
-- sgrh_cat_horarios; sin ese permiso el día queda sin horario, igual que
-- hoy. Solo lectura: no cambia ninguna policy ni lo que ven las pantallas
-- de asistencia.
--
-- Devuelve un único jsonb (no un SETOF): PostgREST corta a max_rows (1000)
-- cualquier resultado con filas, y una sucursal con doce personas ya pasa
-- las mil marcas en una quincena.
--
-- Idempotente.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.nomina_asistencia_periodo(
  p_lab_ids integer[],
  p_desde   date,
  p_hasta   date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
               'hor_hora_fin_break',       h.hor_hora_fin_break
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
$$;

REVOKE ALL ON FUNCTION public.nomina_asistencia_periodo(integer[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_asistencia_periodo(integer[], date, date) TO authenticated;

COMMENT ON FUNCTION public.nomina_asistencia_periodo(integer[], date, date) IS
  'Programación y marcas de unos contratos en un rango, en cualquier sucursal donde se hayan trabajado. Para la planilla: autoriza por la sucursal del CONTRATO (ASISTENCIA_READ + NOMINA_READ/WRITE). Solo lectura.';
