-- Liquidación: paga las horas extra pendientes del banco de horas.
--
-- Auditoría de nómina, hallazgo 4: al liquidar, las horas extra que seguían
-- pendientes en el banco de horas no entraban al finiquito y ya no se podían
-- pagar (no queda ninguna quincena abierta), así que quedaban pendientes para
-- siempre ("horas muertas").
--
-- Ahora el cálculo (TypeScript) las suma al finiquito al monto sugerido, y
-- esta RPC, en la misma transacción que guarda la liquidación, las deja
-- pagadas apuntando a la liquidación.
--
-- Cambios:
--  - sgrh_liquidaciones.liq_horas_extra_banco: monto pagado por esas horas.
--  - sgrh_banco_horas_movimientos.bhm_liquidacion_id: liquidación que las pagó.
--  - registrar_liquidacion: misma lógica de antes (20260927120000) más el
--    guardado de liq_horas_extra_banco y el pago de los movimientos.

ALTER TABLE public.sgrh_liquidaciones
  ADD COLUMN IF NOT EXISTS liq_horas_extra_banco numeric NOT NULL DEFAULT 0
    CHECK (liq_horas_extra_banco >= 0);

ALTER TABLE public.sgrh_banco_horas_movimientos
  ADD COLUMN IF NOT EXISTS bhm_liquidacion_id integer
    REFERENCES public.sgrh_liquidaciones (liq_id);

CREATE INDEX IF NOT EXISTS idx_banco_horas_liquidacion
  ON public.sgrh_banco_horas_movimientos (bhm_liquidacion_id);

COMMENT ON COLUMN public.sgrh_liquidaciones.liq_horas_extra_banco IS
  'Horas extra que seguían pendientes en el banco de horas al salir, pagadas en el finiquito (salario: cotiza y entra al aguinaldo proporcional).';
COMMENT ON COLUMN public.sgrh_banco_horas_movimientos.bhm_liquidacion_id IS
  'Liquidación que pagó este movimiento (cuando se pagó en el finiquito y no en una quincena).';

CREATE OR REPLACE FUNCTION public.registrar_liquidacion(p_lab_id integer, p_liquidacion jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_contrato  record;
  v_liq_id    integer;
  v_banco     jsonb := coalesce(p_liquidacion->'banco_horas', '[]'::jsonb);
  v_esperados integer;
  v_pagados   integer;
  v_suma      numeric;
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para liquidar.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_fecha_fin, lab_motivo_salida_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF v_contrato.lab_fecha_fin IS NULL THEN
    RAISE EXCEPTION 'Este contrato sigue vigente: primero terminalo desde el perfil del empleado.'
      USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_motivo_salida_id IS NULL THEN
    RAISE EXCEPTION 'El contrato no tiene motivo de salida registrado.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sgrh_liquidaciones WHERE liq_historial_laboral_id = p_lab_id) THEN
    RAISE EXCEPTION 'Ya existe una liquidación guardada para este contrato.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.sgrh_liquidaciones (
    liq_historial_laboral_id,
    liq_motivo_salida_id,
    liq_fecha_salida,
    liq_salario_diario,
    liq_salario_diario_vacaciones,
    liq_dias_trabajados_mes,
    liq_salario_proporcional,
    liq_aguinaldo_proporcional,
    liq_dias_vacaciones_pendientes,
    liq_dias_vacaciones_propuestos,
    liq_vacaciones_pagadas,
    liq_horas_extra_banco,
    liq_dias_preaviso,
    liq_preaviso,
    liq_dias_cesantia,
    liq_cesantia,
    liq_total,
    liq_deducciones_obreras,
    liq_neto,
    liq_observaciones
  ) VALUES (
    p_lab_id,
    v_contrato.lab_motivo_salida_id,
    v_contrato.lab_fecha_fin,
    (p_liquidacion->>'liq_salario_diario')::numeric,
    (p_liquidacion->>'liq_salario_diario_vacaciones')::numeric,
    (p_liquidacion->>'liq_dias_trabajados_mes')::numeric,
    (p_liquidacion->>'liq_salario_proporcional')::numeric,
    (p_liquidacion->>'liq_aguinaldo_proporcional')::numeric,
    (p_liquidacion->>'liq_dias_vacaciones_pendientes')::numeric,
    (p_liquidacion->>'liq_dias_vacaciones_propuestos')::numeric,
    (p_liquidacion->>'liq_vacaciones_pagadas')::numeric,
    coalesce((p_liquidacion->>'liq_horas_extra_banco')::numeric, 0),
    (p_liquidacion->>'liq_dias_preaviso')::numeric,
    (p_liquidacion->>'liq_preaviso')::numeric,
    (p_liquidacion->>'liq_dias_cesantia')::numeric,
    (p_liquidacion->>'liq_cesantia')::numeric,
    (p_liquidacion->>'liq_total')::numeric,
    (p_liquidacion->>'liq_deducciones_obreras')::numeric,
    (p_liquidacion->>'liq_neto')::numeric,
    p_liquidacion->>'liq_observaciones'
  )
  RETURNING liq_id INTO v_liq_id;

  -- Horas extra pendientes del banco de horas que se pagan en este finiquito.
  -- Se marcan pagadas por la liquidación en la misma transacción. Si alguna
  -- ya no está pendiente (alguien la pagó o compensó mientras tanto), o no es
  -- de este empleado, no se guarda nada.
  IF jsonb_typeof(v_banco) <> 'array' THEN
    RAISE EXCEPTION 'Formato inválido de las horas del banco de horas.' USING ERRCODE = '22023';
  END IF;
  v_esperados := jsonb_array_length(v_banco);
  SELECT coalesce(sum((b->>'monto')::numeric), 0) INTO v_suma FROM jsonb_array_elements(v_banco) b;
  IF abs(v_suma - coalesce((p_liquidacion->>'liq_horas_extra_banco')::numeric, 0)) >= 0.01 THEN
    RAISE EXCEPTION 'El monto de horas extra del banco no coincide con sus movimientos.'
      USING ERRCODE = '23514';
  END IF;
  IF v_esperados > 0 THEN
    UPDATE public.sgrh_banco_horas_movimientos m
    SET bhm_estado = 'pagado',
        bhm_monto_pagado = (b->>'monto')::numeric,
        bhm_liquidacion_id = v_liq_id,
        bhm_nomina_detalle_pago_id = NULL,
        bhm_resuelto_por_id = nullif(p_liquidacion->>'resuelto_por_id', '')::integer,
        bhm_fecha_resolucion = (now() AT TIME ZONE 'America/Costa_Rica')
    FROM jsonb_array_elements(v_banco) b
    WHERE m.bhm_id = (b->>'bhm_id')::integer
      AND m.bhm_estado = 'pendiente'
      AND m.bhm_historial_laboral_id IN (
        SELECT h.lab_id FROM public.sgrh_historial_laboral h
        WHERE h.lab_empleado_id = (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_id = p_lab_id
        )
      );
    GET DIAGNOSTICS v_pagados = ROW_COUNT;
    IF v_pagados <> v_esperados THEN
      RAISE EXCEPTION 'Las horas del banco de horas de este empleado cambiaron mientras se liquidaba (alguien las pagó o compensó). Volvé a calcular la liquidación.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.sgrh_programacion_semanal
  WHERE prg_historial_laboral_id = p_lab_id
    AND prg_fecha > v_contrato.lab_fecha_fin;

  RETURN v_liq_id;
END;
$$;

COMMENT ON FUNCTION public.registrar_liquidacion(integer, jsonb) IS
  'Guarda la liquidación de un contrato ya terminado (montos calculados en TypeScript; contrato, fecha y motivo salen de la fila), deja pagadas las horas pendientes del banco de horas que van en el finiquito y borra los turnos posteriores a la salida.';

NOTIFY pgrst, 'reload schema';
