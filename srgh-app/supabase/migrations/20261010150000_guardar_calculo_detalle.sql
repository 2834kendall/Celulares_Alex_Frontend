-- Guardar el recálculo de una fila de planilla en una sola transacción.
--
-- Auditoría de nómina 2, riesgo "lectura y escritura sin atomicidad": pagar
-- (o revertir) horas del banco de horas lee las líneas de la fila, suma el
-- monto y reescribe totales y líneas con llamadas separadas. Dos pagos sobre
-- la misma fila al mismo tiempo leían lo mismo y el segundo pisaba al
-- primero: se perdía uno de los dos montos, con su movimiento marcado como
-- pagado.
--
-- Esta función recibe el cálculo ya hecho (TypeScript, el mismo motor de
-- siempre) y lo guarda con la fila bloqueada, solo si el bruto sigue siendo el
-- que se leyó antes de calcular. Si otro pago o una edición cambió la fila en
-- el medio, no guarda nada y avisa (55000): se vuelve a intentar con lo nuevo.
-- Totales y líneas quedan juntos o no quedan: ya no hay "pago a medias".
--
-- Las líneas conservan sus datos que no salen del cálculo (observación,
-- deducción voluntaria, beneficio), emparejadas por concepto, igual que
-- reemplazarLineasDetalle en TypeScript.
--
-- SECURITY INVOKER: corre con los permisos y la RLS de quien la llama.

CREATE OR REPLACE FUNCTION public.guardar_calculo_detalle(
  p_ndt_id integer,
  p_bruto_anterior numeric,
  p_calculo jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_fila record;
  v_obs_ingreso jsonb;
  v_meta_deduccion jsonb;
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para modificar la planilla.' USING ERRCODE = '42501';
  END IF;

  SELECT ndt_id, ndt_pagado, ndt_salario_bruto INTO v_fila
  FROM public.sgrh_nomina_detalle
  WHERE ndt_id = p_ndt_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La fila de planilla ya no existe.' USING ERRCODE = '23503';
  END IF;
  IF v_fila.ndt_pagado THEN
    RAISE EXCEPTION 'Esa quincena ya está marcada como pagada, así que no se le pueden cambiar los montos. No se tocó nada.'
      USING ERRCODE = '23514';
  END IF;
  IF abs(coalesce(v_fila.ndt_salario_bruto, 0) - coalesce(p_bruto_anterior, 0)) >= 0.005 THEN
    RAISE EXCEPTION 'La fila cambió mientras se guardaba (otro pago o una edición al mismo tiempo). No se tocó nada: volvé a intentarlo.'
      USING ERRCODE = '55000';
  END IF;

  UPDATE public.sgrh_nomina_detalle
  SET ndt_salario_bruto = (p_calculo->>'bruto')::numeric,
      ndt_total_deducciones_obreras = (p_calculo->>'deducciones')::numeric,
      ndt_salario_neto = (p_calculo->>'neto')::numeric,
      ndt_total_cargas_patronales = (p_calculo->>'cargas')::numeric
  WHERE ndt_id = p_ndt_id;

  -- Datos de las líneas que no salen del cálculo, por concepto.
  SELECT coalesce(jsonb_object_agg(ing_concepto_id::text, ing_observacion), '{}'::jsonb)
    INTO v_obs_ingreso
  FROM public.sgrh_nomina_linea_ingreso
  WHERE ing_nomina_detalle_id = p_ndt_id;

  SELECT coalesce(jsonb_object_agg(
           ded_concepto_id::text,
           jsonb_build_object(
             'voluntaria', ded_es_voluntaria,
             'beneficio', ded_beneficio_id,
             'observacion', ded_observacion
           )
         ), '{}'::jsonb)
    INTO v_meta_deduccion
  FROM public.sgrh_nomina_linea_deduccion
  WHERE ded_nomina_detalle_id = p_ndt_id;

  DELETE FROM public.sgrh_nomina_linea_ingreso WHERE ing_nomina_detalle_id = p_ndt_id;
  DELETE FROM public.sgrh_nomina_linea_deduccion WHERE ded_nomina_detalle_id = p_ndt_id;
  DELETE FROM public.sgrh_nomina_linea_patronal WHERE pat_nomina_detalle_id = p_ndt_id;

  INSERT INTO public.sgrh_nomina_linea_ingreso (
    ing_nomina_detalle_id, ing_concepto_id, ing_monto, ing_observacion
  )
  SELECT p_ndt_id,
         (l->>'con_id')::integer,
         (l->>'monto')::numeric,
         v_obs_ingreso->>(l->>'con_id')
  FROM jsonb_array_elements(coalesce(p_calculo->'ingresos', '[]'::jsonb)) l;

  INSERT INTO public.sgrh_nomina_linea_deduccion (
    ded_nomina_detalle_id, ded_concepto_id, ded_monto, ded_porcentaje_aplicado,
    ded_base_calculo, ded_es_voluntaria, ded_beneficio_id, ded_observacion
  )
  SELECT p_ndt_id,
         (l->>'con_id')::integer,
         (l->>'monto')::numeric,
         (l->>'porcentaje')::numeric,
         (l->>'base')::numeric,
         coalesce((v_meta_deduccion->(l->>'con_id')->>'voluntaria')::boolean, false),
         (v_meta_deduccion->(l->>'con_id')->>'beneficio')::integer,
         v_meta_deduccion->(l->>'con_id')->>'observacion'
  FROM jsonb_array_elements(coalesce(p_calculo->'deducciones_lineas', '[]'::jsonb)) l;

  INSERT INTO public.sgrh_nomina_linea_patronal (
    pat_nomina_detalle_id, pat_concepto_id, pat_monto, pat_porcentaje_aplicado, pat_base_calculo
  )
  SELECT p_ndt_id,
         (l->>'con_id')::integer,
         (l->>'monto')::numeric,
         (l->>'porcentaje')::numeric,
         (l->>'base')::numeric
  FROM jsonb_array_elements(coalesce(p_calculo->'patronales', '[]'::jsonb)) l;
END;
$$;

COMMENT ON FUNCTION public.guardar_calculo_detalle(integer, numeric, jsonb) IS
  'Guarda totales y líneas de una fila de planilla ya recalculada (en TypeScript), con la fila bloqueada y solo si el bruto sigue siendo el que se leyó (si no, 55000 y no guarda nada). La usan pagar y revertir horas del banco de horas.';

NOTIFY pgrst, 'reload schema';
