-- =====================================================================
-- Nómina por empresa, fase 2: los permisos deciden por la fila
-- =====================================================================
-- Hasta acá, quién ve una fila de planilla (y sus líneas y su comprobante)
-- lo decidía la sucursal del PERIODO. Ahora lo decide la sucursal de la FILA
-- (ndt_sucursal_id, fase 1). Mientras los periodos sigan siendo por sucursal
-- las dos cosas son lo mismo, así que esta fase tampoco cambia lo que ve
-- nadie: deja los permisos listos para cuando el periodo sea de la empresa.
--
--   * 20 reglas reescritas: filas, las tres tablas de líneas y comprobantes.
--     Las 4 del periodo NO se tocan (las cambia la fase 4).
--   * La regla de siempre para el empleado se conserva: ve sus propias filas,
--     líneas y comprobantes aunque no tenga permisos de nómina.
--
-- Funciones nuevas, todas de solo lectura y sin montos:
--
--   * nomina_filas_estado: contrato, pagado y fecha de TODAS las filas de un
--     periodo. Con el periodo por empresa, una cuenta de una sola sucursal
--     ve solo sus filas; sin esto marcaría "pagado" el periodo entero al
--     terminar las suyas, o intentaría cargar dos veces a alguien que ya
--     está en el periodo por otra sucursal.
--   * nomina_contratos_con_filas_ocultas: de una lista de contratos, cuáles
--     tienen quincenas en sucursales que la cuenta no ve (traslados),
--     opcionalmente dentro de un rango de meses. Para avisar en vez de
--     calcular un aguinaldo o una liquidación de menos.
--   * nomina_periodo_actual: en qué periodo quedó uno que se fusionó (para
--     que los enlaces viejos sigan abriendo).
--
-- eliminar_periodo_nomina: un periodo de toda la empresa solo lo borra una
-- cuenta de toda la empresa (sin sucursal asignada).
--
-- Para revertir solo los permisos: supabase/scripts/revertir-permisos-nomina-por-fila.sql
--
-- Idempotente.
-- =====================================================================

-- ─── 1. Filas ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "nomina_detalle_select" ON public.sgrh_nomina_detalle;
DROP POLICY IF EXISTS "nomina_detalle_insert" ON public.sgrh_nomina_detalle;
DROP POLICY IF EXISTS "nomina_detalle_update" ON public.sgrh_nomina_detalle;
DROP POLICY IF EXISTS "nomina_detalle_delete" ON public.sgrh_nomina_detalle;

CREATE POLICY "nomina_detalle_select" ON public.sgrh_nomina_detalle
FOR SELECT TO authenticated USING (
  (
    (SELECT public.tiene_permiso('NOMINA_READ'))
    AND ndt_sucursal_id IN (SELECT public.sucursales_visibles())
  )
  OR ndt_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = (SELECT public.get_emp_id())
  )
);

-- La sucursal ya la puso el trigger (corre antes que esta revisión): si la
-- cuenta no la ve, la fila no entra. El periodo tiene que ser de la empresa.
CREATE POLICY "nomina_detalle_insert" ON public.sgrh_nomina_detalle
FOR INSERT TO authenticated WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND ndt_sucursal_id IN (SELECT public.sucursales_visibles())
  AND ndt_nomina_periodo_id IN (
    SELECT npe_id
    FROM public.sgrh_nomina_periodo
    WHERE npe_empresa_id = (SELECT public.get_empresa_id())
  )
);

CREATE POLICY "nomina_detalle_update" ON public.sgrh_nomina_detalle
FOR UPDATE TO authenticated
USING (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND ndt_sucursal_id IN (SELECT public.sucursales_visibles())
)
WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND ndt_sucursal_id IN (SELECT public.sucursales_visibles())
);

CREATE POLICY "nomina_detalle_delete" ON public.sgrh_nomina_detalle
FOR DELETE TO authenticated USING (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND ndt_sucursal_id IN (SELECT public.sucursales_visibles())
);

-- ─── 2. Líneas y comprobantes: por la sucursal de su fila ───────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT *
    FROM (VALUES
      ('sgrh_nomina_linea_ingreso',   'nomina_lineas_ingreso',   'ing_nomina_detalle_id'),
      ('sgrh_nomina_linea_deduccion', 'nomina_lineas_deduccion', 'ded_nomina_detalle_id'),
      ('sgrh_nomina_linea_patronal',  'nomina_lineas_patronal',  'pat_nomina_detalle_id'),
      ('sgrh_comprobantes_pago',      'comprobantes',            'com_nomina_detalle_id')
    ) AS v (tabla, prefijo, columna)
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.prefijo || '_select', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.prefijo || '_insert', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.prefijo || '_update', r.tabla);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.prefijo || '_delete', r.tabla);

    EXECUTE format(
      $f$
      CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
        %I IN (
          SELECT ndt_id
          FROM public.sgrh_nomina_detalle
          WHERE ndt_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE lab_empleado_id = (SELECT public.get_emp_id())
          )
        )
        OR (
          (SELECT public.tiene_permiso('NOMINA_READ'))
          AND %I IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE ndt_sucursal_id IN (SELECT public.sucursales_visibles())
          )
        )
      )
      $f$,
      r.prefijo || '_select', r.tabla, r.columna, r.columna
    );

    EXECUTE format(
      $f$
      CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        (SELECT public.tiene_permiso('NOMINA_WRITE'))
        AND %I IN (
          SELECT ndt_id
          FROM public.sgrh_nomina_detalle
          WHERE ndt_sucursal_id IN (SELECT public.sucursales_visibles())
        )
      )
      $f$,
      r.prefijo || '_insert', r.tabla, r.columna
    );

    EXECUTE format(
      $f$
      CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
      USING (
        (SELECT public.tiene_permiso('NOMINA_WRITE'))
        AND %I IN (
          SELECT ndt_id
          FROM public.sgrh_nomina_detalle
          WHERE ndt_sucursal_id IN (SELECT public.sucursales_visibles())
        )
      )
      WITH CHECK (
        (SELECT public.tiene_permiso('NOMINA_WRITE'))
        AND %I IN (
          SELECT ndt_id
          FROM public.sgrh_nomina_detalle
          WHERE ndt_sucursal_id IN (SELECT public.sucursales_visibles())
        )
      )
      $f$,
      r.prefijo || '_update', r.tabla, r.columna, r.columna
    );

    EXECUTE format(
      $f$
      CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
        (SELECT public.tiene_permiso('NOMINA_WRITE'))
        AND %I IN (
          SELECT ndt_id
          FROM public.sgrh_nomina_detalle
          WHERE ndt_sucursal_id IN (SELECT public.sucursales_visibles())
        )
      )
      $f$,
      r.prefijo || '_delete', r.tabla, r.columna
    );
  END LOOP;
END
$$;

-- ─── 3. Estado de todas las filas de un periodo (sin montos) ────────────
CREATE OR REPLACE FUNCTION public.nomina_filas_estado(p_npe_id integer)
RETURNS TABLE (
  ndt_historial_laboral_id integer,
  ndt_pagado boolean,
  ndt_fecha_pago date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT d.ndt_historial_laboral_id, d.ndt_pagado, d.ndt_fecha_pago
  FROM public.sgrh_nomina_detalle d
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
  WHERE p.npe_id = p_npe_id
    AND p.npe_empresa_id = (SELECT public.get_empresa_id())
    AND (
      (SELECT public.tiene_permiso('NOMINA_READ'))
      OR (SELECT public.tiene_permiso('NOMINA_WRITE'))
    );
$$;

REVOKE ALL ON FUNCTION public.nomina_filas_estado(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_filas_estado(integer) TO authenticated;

COMMENT ON FUNCTION public.nomina_filas_estado(integer) IS
  'Contrato, pagado y fecha de pago de TODAS las filas de un periodo de la empresa, también las de sucursales que la cuenta no ve. Sin montos. Exige NOMINA_READ o NOMINA_WRITE.';

-- ─── 4. Contratos con quincenas en sucursales que la cuenta no ve ───────
-- p_desde / p_hasta acotan por el MES del periodo (cualquier día del mes
-- sirve): el aguinaldo solo mira su ciclo, y un traslado de hace años no le
-- esconde nada. Sin fechas, cualquier quincena cuenta.
CREATE OR REPLACE FUNCTION public.nomina_contratos_con_filas_ocultas(
  p_lab_ids integer[],
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS integer[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT d.ndt_historial_laboral_id), '{}')
  FROM public.sgrh_nomina_detalle d
  JOIN public.sgrh_historial_laboral l ON l.lab_id = d.ndt_historial_laboral_id
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
  WHERE d.ndt_historial_laboral_id = ANY (p_lab_ids)
    AND l.lab_empresa_id = (SELECT public.get_empresa_id())
    AND (
      (SELECT public.tiene_permiso('NOMINA_READ'))
      OR (SELECT public.tiene_permiso('NOMINA_WRITE'))
    )
    AND d.ndt_sucursal_id NOT IN (SELECT public.sucursales_visibles())
    AND (
      p_desde IS NULL
      OR make_date(p.npe_periodo_anio, p.npe_periodo_mes, 1) >= date_trunc('month', p_desde)::date
    )
    AND (
      p_hasta IS NULL
      OR make_date(p.npe_periodo_anio, p.npe_periodo_mes, 1) <= p_hasta
    );
$$;

REVOKE ALL ON FUNCTION public.nomina_contratos_con_filas_ocultas(integer[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_contratos_con_filas_ocultas(integer[], date, date) TO authenticated;

COMMENT ON FUNCTION public.nomina_contratos_con_filas_ocultas(integer[], date, date) IS
  'De los contratos pedidos, los que tienen filas de planilla en sucursales que la cuenta no ve (opcionalmente, solo en periodos entre los meses de p_desde y p_hasta). Solo dice cuáles, sin montos. Exige NOMINA_READ o NOMINA_WRITE.';

-- ─── 5. En qué periodo quedó uno fusionado ──────────────────────────────
CREATE OR REPLACE FUNCTION public.nomina_periodo_actual(p_npe_id integer)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.npf_periodo_nuevo
  FROM sgrh_private.nomina_periodo_fusion f
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = f.npf_periodo_nuevo
  WHERE f.npf_periodo_viejo = p_npe_id
    AND f.npf_periodo_nuevo <> f.npf_periodo_viejo
    AND p.npe_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('NOMINA_READ'));
$$;

REVOKE ALL ON FUNCTION public.nomina_periodo_actual(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_periodo_actual(integer) TO authenticated;

COMMENT ON FUNCTION public.nomina_periodo_actual(integer) IS
  'Id del periodo de la empresa en que quedó un periodo viejo (por sucursal) al fusionarse. NULL si no se fusionó. Exige NOMINA_READ.';

-- ─── 6. Borrar un periodo de toda la empresa ────────────────────────────
-- Igual que antes (20261008140000), más una revisión: con el periodo por
-- empresa, una cuenta de una sucursal solo ve sus filas; si pudiera borrar
-- el periodo, o fallaría a medias o se llevaría el encabezado de todos.
CREATE OR REPLACE FUNCTION public.eliminar_periodo_nomina(p_npe_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sucursal integer;
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para eliminar periodos.' USING ERRCODE = '42501';
  END IF;

  SELECT npe_sucursal_id INTO v_sucursal
  FROM public.sgrh_nomina_periodo
  WHERE npe_id = p_npe_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'El periodo no existe o no es visible.' USING ERRCODE = 'P0002';
  END IF;

  IF v_sucursal IS NULL AND public.get_sucursal_ids() IS NOT NULL THEN
    RAISE EXCEPTION 'Este periodo es de toda la empresa: solo lo puede eliminar una cuenta sin sucursal asignada.'
      USING ERRCODE = '42501';
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

REVOKE EXECUTE ON FUNCTION public.eliminar_periodo_nomina(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.eliminar_periodo_nomina(integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.eliminar_periodo_nomina(integer) TO authenticated;

COMMENT ON FUNCTION public.eliminar_periodo_nomina(integer) IS
  'Borra un periodo de planilla con sus filas (ver eliminar_filas_planilla), en una transacción. Un periodo de toda la empresa solo lo borra una cuenta sin sucursal asignada.';

NOTIFY pgrst, 'reload schema';
