-- SGRH-101: server-only atomic compare-and-insert with retry identity.
ALTER TABLE public.sgrh_marcas_asistencia ADD COLUMN IF NOT EXISTS mar_operacion_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS idx_marcas_operacion
  ON public.sgrh_marcas_asistencia (mar_operacion_id) WHERE mar_operacion_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.registrar_marca_kiosco_atomica(
  p_marca jsonb, p_snapshot jsonb, p_empresa_id integer
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_historial integer := (p_marca->>'mar_historial_laboral_id')::integer;
  v_fecha timestamp := (p_marca->>'mar_fecha_hora')::timestamp;
  v_operacion uuid := (p_marca->>'mar_operacion_id')::uuid;
  v_existing public.sgrh_marcas_asistencia%ROWTYPE;
  v_snapshot jsonb;
BEGIN
  -- Serialize kiosk operations for the same employment/day, including retries.
  PERFORM pg_catalog.pg_advisory_xact_lock(v_historial, (v_fecha::date - DATE '2000-01-01')::integer);
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_historial_laboral
    WHERE lab_id = v_historial AND lab_empresa_id = p_empresa_id AND lab_fecha_fin IS NULL)
  THEN RETURN 'invalid_contract'; END IF;

  SELECT * INTO v_existing FROM public.sgrh_marcas_asistencia WHERE mar_operacion_id = v_operacion;
  IF FOUND THEN
    IF v_existing.mar_historial_laboral_id = v_historial
      AND v_existing.mar_tipo = p_marca->>'mar_tipo'
      AND v_existing.mar_sucursal_id = (p_marca->>'mar_sucursal_id')::integer
      AND v_existing.mar_fecha_hora = v_fecha
    THEN RETURN 'duplicate'; ELSE RETURN 'conflict'; END IF;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_array(mar_id, mar_tipo,
    to_char(mar_fecha_hora, 'YYYY-MM-DD HH24:MI:SS')) ORDER BY mar_id), '[]'::jsonb)
    INTO v_snapshot FROM public.sgrh_marcas_asistencia
    WHERE mar_historial_laboral_id = v_historial
      AND mar_fecha_hora >= v_fecha::date AND mar_fecha_hora < v_fecha::date + INTERVAL '1 day';
  IF v_snapshot IS DISTINCT FROM p_snapshot THEN RETURN 'stale'; END IF;
  IF v_operacion IS NULL OR p_marca->>'mar_metodo_verificacion' IS DISTINCT FROM 'FACIAL'
  THEN RETURN 'conflict'; END IF;

  INSERT INTO public.sgrh_marcas_asistencia (
    mar_historial_laboral_id, mar_sucursal_id, mar_tipo, mar_fecha_hora,
    mar_latitud_marcada, mar_longitud_marcada, mar_distancia_geocerca_metros,
    mar_metodo_verificacion, mar_dispositivo_id, mar_registrado_por_id,
    mar_observacion, mar_operacion_id
  ) VALUES (
    v_historial, (p_marca->>'mar_sucursal_id')::integer, p_marca->>'mar_tipo', v_fecha,
    (p_marca->>'mar_latitud_marcada')::numeric, (p_marca->>'mar_longitud_marcada')::numeric,
    (p_marca->>'mar_distancia_geocerca_metros')::numeric, 'FACIAL',
    p_marca->>'mar_dispositivo_id', (p_marca->>'mar_registrado_por_id')::integer,
    p_marca->>'mar_observacion', v_operacion
  );
  RETURN 'inserted';
EXCEPTION WHEN unique_violation THEN
  -- A caller reused an operation UUID across different employment/day locks.
  RETURN 'conflict';
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_marca_kiosco_atomica(jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_marca_kiosco_atomica(jsonb, jsonb, integer) TO service_role;
COMMENT ON FUNCTION public.registrar_marca_kiosco_atomica(jsonb, jsonb, integer) IS
  'Server-only kiosk write: authorization/sequence checked by action; snapshot rechecked under per-day lock. Apply before deploying SGRH-101.';
