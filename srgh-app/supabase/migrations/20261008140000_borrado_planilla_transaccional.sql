-- Borrado de filas y periodos de planilla en una sola transacción.
--
-- Auditoría de nómina, riesgo "borrado sin transacción": deletePeriodo y la
-- subida del Excel (empleados que salen del archivo) borraban con varias
-- llamadas separadas (banco de horas, comisiones, comprobantes, tres tablas
-- de líneas, filas, periodo). Un fallo a mitad de camino dejaba datos
-- sueltos: por ejemplo, horas de banco devueltas a pendiente con el periodo
-- todavía vivo, o filas con su total y sin ninguna línea.
--
-- Estas funciones hacen lo mismo que hacía la aplicación, en el mismo orden,
-- dentro de una transacción: o se borra todo, o no se borra nada.
-- SECURITY INVOKER: corren con los permisos y la RLS de quien las llama, igual
-- que las llamadas sueltas de antes.

CREATE OR REPLACE FUNCTION public.eliminar_filas_planilla(p_ndt_ids integer[])
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_borradas integer;
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para modificar la planilla.' USING ERRCODE = '42501';
  END IF;
  IF p_ndt_ids IS NULL OR cardinality(p_ndt_ids) = 0 THEN
    RETURN 0;
  END IF;

  -- Una fila pagada tiene comprobante emitido y aguinaldo acumulado.
  IF EXISTS (
    SELECT 1 FROM public.sgrh_nomina_detalle WHERE ndt_id = ANY (p_ndt_ids) AND ndt_pagado
  ) THEN
    RAISE EXCEPTION 'No se puede borrar una fila con el pago marcado: desmarcalo primero.'
      USING ERRCODE = '23514';
  END IF;

  -- Horas extra de estas filas ya pagadas (en otra quincena o en una
  -- liquidación) o compensadas: el movimiento cuelga de la fila y borrarla
  -- borraría ese registro.
  IF EXISTS (
    SELECT 1 FROM public.sgrh_banco_horas_movimientos
    WHERE bhm_nomina_detalle_id = ANY (p_ndt_ids) AND bhm_estado <> 'pendiente'
  ) THEN
    RAISE EXCEPTION 'Hay horas extra de estas filas que ya se pagaron o compensaron desde el banco de horas: revertí esos movimientos primero.'
      USING ERRCODE = '23514';
  END IF;

  -- 1. Horas de banco que se PAGARON en estas filas pero nacieron en otra:
  --    vuelven a pendiente (el monto se va con la fila).
  UPDATE public.sgrh_banco_horas_movimientos
  SET bhm_estado = 'pendiente',
      bhm_monto_pagado = NULL,
      bhm_nomina_detalle_pago_id = NULL,
      bhm_resuelto_por_id = NULL,
      bhm_fecha_resolucion = NULL
  WHERE bhm_nomina_detalle_pago_id = ANY (p_ndt_ids);

  -- 2. Movimientos generados por estas filas (todos pendientes, ver arriba).
  DELETE FROM public.sgrh_banco_horas_movimientos WHERE bhm_nomina_detalle_id = ANY (p_ndt_ids);

  -- 3. Comisiones: siguen existiendo, solo se suelta el vínculo.
  UPDATE public.sgrh_comisiones_calculadas
  SET cal_nomina_detalle_id = NULL
  WHERE cal_nomina_detalle_id = ANY (p_ndt_ids);

  -- 4. Comprobantes sueltos (una fila impaga no debería tener).
  DELETE FROM public.sgrh_comprobantes_pago WHERE com_nomina_detalle_id = ANY (p_ndt_ids);

  -- 5. Las tres tablas de líneas y las filas.
  DELETE FROM public.sgrh_nomina_linea_ingreso WHERE ing_nomina_detalle_id = ANY (p_ndt_ids);
  DELETE FROM public.sgrh_nomina_linea_deduccion WHERE ded_nomina_detalle_id = ANY (p_ndt_ids);
  DELETE FROM public.sgrh_nomina_linea_patronal WHERE pat_nomina_detalle_id = ANY (p_ndt_ids);
  DELETE FROM public.sgrh_nomina_detalle WHERE ndt_id = ANY (p_ndt_ids);
  GET DIAGNOSTICS v_borradas = ROW_COUNT;

  RETURN v_borradas;
END;
$$;

CREATE OR REPLACE FUNCTION public.eliminar_periodo_nomina(p_npe_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar periodos.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_nomina_periodo WHERE npe_id = p_npe_id) THEN
    RAISE EXCEPTION 'El periodo no existe o no es visible.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.eliminar_filas_planilla(
    ARRAY(SELECT ndt_id FROM public.sgrh_nomina_detalle WHERE ndt_nomina_periodo_id = p_npe_id)
  );

  DELETE FROM public.sgrh_nomina_periodo WHERE npe_id = p_npe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se pudo eliminar el periodo.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.eliminar_filas_planilla(integer[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eliminar_filas_planilla(integer[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.eliminar_filas_planilla(integer[]) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.eliminar_periodo_nomina(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eliminar_periodo_nomina(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.eliminar_periodo_nomina(integer) TO authenticated;

COMMENT ON FUNCTION public.eliminar_filas_planilla(integer[]) IS
  'Borra filas impagas de planilla con todo lo que cuelga de ellas, en una transacción. Rechaza filas pagadas o con horas de banco ya resueltas.';
COMMENT ON FUNCTION public.eliminar_periodo_nomina(integer) IS
  'Borra un periodo de planilla con sus filas (ver eliminar_filas_planilla), en una transacción.';

NOTIFY pgrst, 'reload schema';
