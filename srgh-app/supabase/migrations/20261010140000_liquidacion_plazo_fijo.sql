-- Liquidación: contrato a plazo fijo roto por el patrono antes del plazo, y
-- por qué el preaviso o la cesantía quedan en 0 días.
--
-- Auditoría de nómina 2:
--  - Riesgo "plazo fijo": un contrato a plazo fijo (u obra determinada)
--    despedido con responsabilidad se liquidaba con preaviso y cesantía de
--    plazo indefinido. Lo que corresponde es la indemnización del Art. 31 del
--    Código de Trabajo (texto reformado por la Ley 7983 de 2000): un día de
--    salario por cada siete días de trabajo continuo o fracción, mínimo tres
--    días, y mínimo veintidós si el contrato se pactó por seis meses o más.
--    Se calcula en TypeScript; acá se guarda como rubro propio.
--  - Hallazgo 10: "Preaviso (0 días)" sin explicar. Se guarda el motivo en
--    texto (menos de 3 meses, no aplica por el motivo, plazo fijo…), para el
--    historial y el comprobante.
--
-- Columnas nuevas con valor por defecto: las liquidaciones ya guardadas no
-- cambian. registrar_liquidacion se reemplaza con la misma firma.

ALTER TABLE public.sgrh_liquidaciones
  ADD COLUMN IF NOT EXISTS liq_dias_indemnizacion_plazo_fijo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liq_indemnizacion_plazo_fijo numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS liq_nota_preaviso text,
  ADD COLUMN IF NOT EXISTS liq_nota_cesantia text;

COMMENT ON COLUMN public.sgrh_liquidaciones.liq_indemnizacion_plazo_fijo IS
  'Indemnización del Art. 31 CT: contrato a plazo fijo u obra determinada roto por el patrono sin justa causa antes del plazo. No es salario: no cotiza. Reemplaza al preaviso y la cesantía.';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_dias_indemnizacion_plazo_fijo IS
  'Días de salario de la indemnización del Art. 31 CT (1 por cada 7 días trabajados o fracción; mínimo 3, o 22 si el plazo pactado era de seis meses o más).';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_nota_preaviso IS
  'Por qué el preaviso quedó en 0 días (null si tiene días o en liquidaciones anteriores a esta columna).';
COMMENT ON COLUMN public.sgrh_liquidaciones.liq_nota_cesantia IS
  'Por qué la cesantía quedó en 0 días (null si tiene días o en liquidaciones anteriores a esta columna).';

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
  v_pagados   integer;
  v_suma      numeric;
  v_pendientes jsonb;
  v_absorbidos jsonb;
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
    liq_nota_preaviso,
    liq_nota_cesantia,
    liq_dias_indemnizacion_plazo_fijo,
    liq_indemnizacion_plazo_fijo,
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
    p_liquidacion->>'liq_nota_preaviso',
    p_liquidacion->>'liq_nota_cesantia',
    coalesce((p_liquidacion->>'liq_dias_indemnizacion_plazo_fijo')::numeric, 0),
    coalesce((p_liquidacion->>'liq_indemnizacion_plazo_fijo')::numeric, 0),
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
  SELECT coalesce(sum((b->>'monto')::numeric), 0) INTO v_suma FROM jsonb_array_elements(v_banco) b;
  IF abs(v_suma - coalesce((p_liquidacion->>'liq_horas_extra_banco')::numeric, 0)) >= 0.01 THEN
    RAISE EXCEPTION 'El monto de horas extra del banco no coincide con sus movimientos.'
      USING ERRCODE = '23514';
  END IF;
  -- Dos clases de movimientos:
  --  - pendientes: se pagan acá (quedan pagados por la liquidación);
  --  - absorbidos ("absorbido": true): ya se habían pagado a una quincena que
  --    nunca se va a pagar por planilla porque esta liquidación la cubre como
  --    salario pendiente (auditoría 2, fallo 4). Esa plata no salía por ningún
  --    lado; ahora entra al finiquito y el movimiento queda apuntando también
  --    a la liquidación. Se exige que esa quincena siga sin pagar.
  SELECT coalesce(jsonb_agg(b) FILTER (WHERE coalesce((b->>'absorbido')::boolean, false) = false), '[]'::jsonb),
         coalesce(jsonb_agg(b) FILTER (WHERE coalesce((b->>'absorbido')::boolean, false)), '[]'::jsonb)
    INTO v_pendientes, v_absorbidos
  FROM jsonb_array_elements(v_banco) b;

  IF jsonb_array_length(v_pendientes) > 0 THEN
    UPDATE public.sgrh_banco_horas_movimientos m
    SET bhm_estado = 'pagado',
        bhm_monto_pagado = (b->>'monto')::numeric,
        bhm_liquidacion_id = v_liq_id,
        bhm_nomina_detalle_pago_id = NULL,
        bhm_resuelto_por_id = nullif(p_liquidacion->>'resuelto_por_id', '')::integer,
        bhm_fecha_resolucion = (now() AT TIME ZONE 'America/Costa_Rica')
    FROM jsonb_array_elements(v_pendientes) b
    WHERE m.bhm_id = (b->>'bhm_id')::integer
      AND m.bhm_estado = 'pendiente'
      AND m.bhm_historial_laboral_id IN (
        SELECT h.lab_id FROM public.sgrh_historial_laboral h
        WHERE h.lab_empleado_id = (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_id = p_lab_id
        )
      );
    GET DIAGNOSTICS v_pagados = ROW_COUNT;
    IF v_pagados <> jsonb_array_length(v_pendientes) THEN
      RAISE EXCEPTION 'Las horas del banco de horas de este empleado cambiaron mientras se liquidaba (alguien las pagó o compensó). Volvé a calcular la liquidación.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF jsonb_array_length(v_absorbidos) > 0 THEN
    UPDATE public.sgrh_banco_horas_movimientos m
    SET bhm_liquidacion_id = v_liq_id
    FROM jsonb_array_elements(v_absorbidos) b
    WHERE m.bhm_id = (b->>'bhm_id')::integer
      AND m.bhm_estado = 'pagado'
      AND m.bhm_liquidacion_id IS NULL
      AND abs(coalesce(m.bhm_monto_pagado, 0) - (b->>'monto')::numeric) < 0.01
      AND EXISTS (
        SELECT 1 FROM public.sgrh_nomina_detalle d
        WHERE d.ndt_id = m.bhm_nomina_detalle_pago_id AND d.ndt_pagado = false
      )
      AND m.bhm_historial_laboral_id IN (
        SELECT h.lab_id FROM public.sgrh_historial_laboral h
        WHERE h.lab_empleado_id = (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral WHERE lab_id = p_lab_id
        )
      );
    GET DIAGNOSTICS v_pagados = ROW_COUNT;
    IF v_pagados <> jsonb_array_length(v_absorbidos) THEN
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
  'Guarda la liquidación de un contrato ya terminado (montos calculados en TypeScript, incluida la indemnización del Art. 31 de un contrato a plazo fijo; contrato, fecha y motivo salen de la fila), deja pagadas las horas pendientes del banco de horas que van en el finiquito, liga a la liquidación las que se habían pagado a una quincena que ella cubre, y borra los turnos posteriores a la salida.';

NOTIFY pgrst, 'reload schema';
