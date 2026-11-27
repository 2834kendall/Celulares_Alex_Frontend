-- =====================================================================
-- SGRH-118 — Stage 3 (Contract / Lockdown + Hardening):
--   1. Column-level SELECT lockdown & direct write lockdown on
--      public.sgrh_historial_laboral (revokes INSERT/UPDATE/DELETE and
--      drops DML policies so all contract writes go through audited RPCs,
--      plus chk_historial_salarios_positivos CHECK constraint).
--   2. Non-recursive SECURITY DEFINER helpers (historial_en_alcance with
--      pre-filtered branch IDs, empleado_en_empresa) + index on
--      sgrh_evaluaciones + branch-scoped historial_select (including
--      NOMINA_READ) & company-wide sgrh_empleados / sgrh_direcciones RLS.
--   3. Harden contract/liquidation & anti-fraud RPCs (crear_contrato,
--      editar_contrato, terminar_contrato, revertir_terminacion,
--      registrar_liquidacion, verificar_cuenta_pago_duplicada,
--      empleados_con_contrato_vigente_oculto).
--   4. Close lateral branch exposure on sgrh_liquidaciones,
--      sgrh_pagos_extraordinarios, and sgrh_banco_horas_movimientos.
--   5. Add nomina_alcance_relacion(...) RPC returning both hidden-scope
--      flags and prior liquidated cut dates without leaking salaries.
-- =====================================================================

BEGIN;

-- ─── 1. Column-level salary protection & direct write lockdown ──────────
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.sgrh_historial_laboral FROM PUBLIC, anon, authenticated;

GRANT SELECT (
  lab_id,
  lab_empleado_id,
  lab_empresa_id,
  lab_sucursal_id,
  lab_puesto_id,
  lab_tipo_jornada_id,
  lab_tipo_contrato_id,
  lab_fecha_inicio,
  lab_fecha_fin,
  lab_motivo_salida_id,
  lab_observaciones_salida,
  lab_recontratable,
  lab_created_at,
  lab_fecha_fin_programada
) ON public.sgrh_historial_laboral TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_historial_salarios_positivos'
      AND conrelid = 'public.sgrh_historial_laboral'::regclass
  ) THEN
    ALTER TABLE public.sgrh_historial_laboral
      ADD CONSTRAINT chk_historial_salarios_positivos
      CHECK (lab_salario_base > 0 AND lab_salario_real > 0);
  END IF;
END $$;

-- ─── 2. Performance index & non-recursive SECURITY DEFINER helpers ──────
CREATE INDEX IF NOT EXISTS idx_evaluaciones_historial_sucursal
  ON public.sgrh_evaluaciones (eve_historial_laboral_id, eve_sucursal_id)
  WHERE eve_historial_laboral_id IS NOT NULL;

GRANT USAGE ON SCHEMA sgrh_private TO authenticated;

CREATE OR REPLACE FUNCTION sgrh_private.historial_en_alcance(
  p_lab_id integer,
  p_empresa_id integer,
  p_sucursal_id integer
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_sucursal_ids integer[];
BEGIN
  IF v_empresa_id IS NULL OR p_empresa_id IS DISTINCT FROM v_empresa_id THEN
    RETURN false;
  END IF;

  v_sucursal_ids := public.get_sucursal_ids();
  IF v_sucursal_ids IS NULL THEN
    RETURN true;
  END IF;

  SELECT coalesce(array_agg(s.suc_id), '{}'::integer[])
  INTO v_sucursal_ids
  FROM public.sgrh_sucursales s
  WHERE s.suc_empresa_id = v_empresa_id
    AND s.suc_id = ANY (v_sucursal_ids);

  IF cardinality(v_sucursal_ids) = 0 THEN
    RETURN false;
  END IF;

  IF p_sucursal_id = ANY (v_sucursal_ids) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.sgrh_nomina_detalle d
    WHERE d.ndt_historial_laboral_id = p_lab_id
      AND d.ndt_sucursal_id = ANY (v_sucursal_ids)
  )
  OR EXISTS (
    SELECT 1
    FROM public.sgrh_programacion_semanal p
    WHERE p.prg_historial_laboral_id = p_lab_id
      AND p.prg_sucursal_id = ANY (v_sucursal_ids)
  )
  OR EXISTS (
    SELECT 1
    FROM public.sgrh_marcas_asistencia m
    WHERE m.mar_historial_laboral_id = p_lab_id
      AND m.mar_sucursal_id = ANY (v_sucursal_ids)
  )
  OR EXISTS (
    SELECT 1
    FROM public.sgrh_justificaciones_bloque j
    WHERE j.jbl_historial_laboral_id = p_lab_id
      AND j.jbl_empresa_id = v_empresa_id
      AND j.jbl_sucursal_id = ANY (v_sucursal_ids)
  )
  OR EXISTS (
    SELECT 1
    FROM public.sgrh_evaluaciones e
    WHERE e.eve_historial_laboral_id = p_lab_id
      AND e.eve_empresa_id = v_empresa_id
      AND e.eve_sucursal_id = ANY (v_sucursal_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.historial_en_alcance(integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sgrh_private.historial_en_alcance(integer, integer, integer) TO authenticated;

COMMENT ON FUNCTION sgrh_private.historial_en_alcance(integer, integer, integer) IS
  'Checks whether a contract row belongs to the caller company and either its base branch or cross-branch activity (payroll, schedule, attendance, block justifications, evaluations) is within sucursal_ids. SECURITY DEFINER prevents RLS recursion (42P17).';

CREATE OR REPLACE FUNCTION sgrh_private.empleado_en_empresa(p_emp_id integer)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id integer := public.get_empresa_id();
BEGIN
  IF v_empresa_id IS NULL OR p_emp_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.sgrh_historial_laboral h
    WHERE h.lab_empleado_id = p_emp_id
      AND h.lab_empresa_id = v_empresa_id
  );
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.empleado_en_empresa(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sgrh_private.empleado_en_empresa(integer) TO authenticated;

COMMENT ON FUNCTION sgrh_private.empleado_en_empresa(integer) IS
  'Checks company-wide membership of an employee via sgrh_historial_laboral without subjecting sgrh_empleados or sgrh_direcciones to branch-scoped historial_select.';

-- ─── 3. RLS policies: sgrh_historial_laboral, sgrh_empleados, sgrh_direcciones ──
DROP POLICY IF EXISTS "historial_select" ON public.sgrh_historial_laboral;
CREATE POLICY "historial_select" ON public.sgrh_historial_laboral
FOR SELECT TO authenticated USING (
  lab_empleado_id = (SELECT public.get_emp_id())
  OR (
    (
      (SELECT public.tiene_permiso('HISTORIAL_READ'))
      OR (SELECT public.tiene_permiso('EMPLEADOS_READ'))
      OR (SELECT public.tiene_permiso('NOMINA_READ'))
    )
    AND lab_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT sgrh_private.historial_en_alcance(lab_id, lab_empresa_id, lab_sucursal_id))
  )
);

-- Direct DML policies removed: writes are enforced via SECURITY DEFINER RPCs
-- (crear_empleado_completo, crear_contrato, editar_contrato, terminar_contrato,
--  revertir_terminacion, cerrar_contratos_programados).
DROP POLICY IF EXISTS "historial_insert" ON public.sgrh_historial_laboral;
DROP POLICY IF EXISTS "historial_update" ON public.sgrh_historial_laboral;
DROP POLICY IF EXISTS "historial_delete" ON public.sgrh_historial_laboral;

-- Keep sgrh_empleados and employee addresses company-wide per rls-y-alcance.md
DROP POLICY IF EXISTS "empleados_select" ON public.sgrh_empleados;
CREATE POLICY "empleados_select" ON public.sgrh_empleados
FOR SELECT TO authenticated USING (
  (
    (SELECT public.tiene_permiso('EMPLEADOS_READ'))
    AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
  )
  OR emp_id = (SELECT public.get_emp_id())
  OR (
    (SELECT public.tiene_permiso('ASISTENCIA_KIOSCO'))
    AND emp_id IN (
      SELECT lab_empleado_id
      FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        AND lab_fecha_fin IS NULL
        AND (SELECT public.sucursal_visible(lab_sucursal_id))
    )
  )
);

DROP POLICY IF EXISTS "empleados_update" ON public.sgrh_empleados;
CREATE POLICY "empleados_update" ON public.sgrh_empleados
FOR UPDATE TO authenticated
USING (
  (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
)
WITH CHECK (
  (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
);

DROP POLICY IF EXISTS "empleados_delete" ON public.sgrh_empleados;
CREATE POLICY "empleados_delete" ON public.sgrh_empleados
FOR DELETE TO authenticated USING (
  (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
);

DROP POLICY IF EXISTS "direcciones_select" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_select" ON public.sgrh_direcciones
FOR SELECT TO authenticated USING (
  dir_id IN (
    SELECT emp_direccion_id FROM public.sgrh_empleados
    WHERE emp_direccion_id IS NOT NULL AND (
      emp_id = (SELECT public.get_emp_id())
      OR (
        (SELECT public.tiene_permiso('EMPLEADOS_READ'))
        AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
      )
    )
  )
  OR dir_id IN (
    SELECT org_direccion_id FROM public.sgrh_empresas
    WHERE org_direccion_id IS NOT NULL
      AND org_id = (SELECT public.get_empresa_id())
  )
  OR dir_id IN (
    SELECT suc_direccion_id FROM public.sgrh_sucursales
    WHERE suc_direccion_id IS NOT NULL
      AND suc_empresa_id = (SELECT public.get_empresa_id())
  )
);

DROP POLICY IF EXISTS "direcciones_update" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_update" ON public.sgrh_direcciones
FOR UPDATE TO authenticated
USING (
  (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  AND dir_id IN (
    SELECT emp_direccion_id FROM public.sgrh_empleados
    WHERE emp_direccion_id IS NOT NULL
      AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
  )
)
WITH CHECK (
  (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  AND dir_id IN (
    SELECT emp_direccion_id FROM public.sgrh_empleados
    WHERE emp_direccion_id IS NOT NULL
      AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
  )
);

DROP POLICY IF EXISTS "direcciones_delete" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_delete" ON public.sgrh_direcciones
FOR DELETE TO authenticated USING (
  (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  AND dir_id IN (
    SELECT emp_direccion_id FROM public.sgrh_empleados
    WHERE emp_direccion_id IS NOT NULL
      AND (SELECT sgrh_private.empleado_en_empresa(emp_id))
  )
);

-- ─── 4. Close lateral branch exposure on financial / hours tables ─────────
DROP POLICY IF EXISTS "liquidaciones_select" ON public.sgrh_liquidaciones;
CREATE POLICY "liquidaciones_select" ON public.sgrh_liquidaciones
FOR SELECT TO authenticated USING (
  liq_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = (SELECT public.get_emp_id())
  )
  OR (
    (SELECT public.tiene_permiso('NOMINA_READ'))
    AND liq_historial_laboral_id IN (
      SELECT lab_id
      FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        AND (SELECT public.sucursal_visible(lab_sucursal_id))
    )
  )
);

DROP POLICY IF EXISTS "liquidaciones_insert" ON public.sgrh_liquidaciones;
CREATE POLICY "liquidaciones_insert" ON public.sgrh_liquidaciones
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND liq_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

DROP POLICY IF EXISTS "liquidaciones_update" ON public.sgrh_liquidaciones;
CREATE POLICY "liquidaciones_update" ON public.sgrh_liquidaciones
FOR UPDATE TO authenticated
USING (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND liq_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
)
WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND liq_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

DROP POLICY IF EXISTS "liquidaciones_delete" ON public.sgrh_liquidaciones;
CREATE POLICY "liquidaciones_delete" ON public.sgrh_liquidaciones
FOR DELETE TO authenticated USING (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND liq_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

DROP POLICY IF EXISTS "pagos_extraordinarios_select" ON public.sgrh_pagos_extraordinarios;
CREATE POLICY "pagos_extraordinarios_select" ON public.sgrh_pagos_extraordinarios
FOR SELECT TO authenticated USING (
  pex_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = (SELECT public.get_emp_id())
  )
  OR (
    (SELECT public.tiene_permiso('NOMINA_READ'))
    AND pex_historial_laboral_id IN (
      SELECT lab_id
      FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        AND (SELECT public.sucursal_visible(lab_sucursal_id))
    )
  )
);

DROP POLICY IF EXISTS "pagos_extraordinarios_insert" ON public.sgrh_pagos_extraordinarios;
CREATE POLICY "pagos_extraordinarios_insert" ON public.sgrh_pagos_extraordinarios
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND pex_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

DROP POLICY IF EXISTS "banco_horas_select" ON public.sgrh_banco_horas_movimientos;
CREATE POLICY "banco_horas_select" ON public.sgrh_banco_horas_movimientos
FOR SELECT TO authenticated USING (
  bhm_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = (SELECT public.get_emp_id())
  )
  OR (
    (SELECT public.tiene_permiso('NOMINA_READ'))
    AND bhm_historial_laboral_id IN (
      SELECT lab_id
      FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        AND (SELECT public.sucursal_visible(lab_sucursal_id))
    )
  )
);

DROP POLICY IF EXISTS "banco_horas_insert" ON public.sgrh_banco_horas_movimientos;
CREATE POLICY "banco_horas_insert" ON public.sgrh_banco_horas_movimientos
FOR INSERT TO authenticated
WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND bhm_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

DROP POLICY IF EXISTS "banco_horas_update" ON public.sgrh_banco_horas_movimientos;
CREATE POLICY "banco_horas_update" ON public.sgrh_banco_horas_movimientos
FOR UPDATE TO authenticated
USING (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND bhm_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
)
WITH CHECK (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND bhm_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

DROP POLICY IF EXISTS "banco_horas_delete" ON public.sgrh_banco_horas_movimientos;
CREATE POLICY "banco_horas_delete" ON public.sgrh_banco_horas_movimientos
FOR DELETE TO authenticated USING (
  (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND bhm_historial_laboral_id IN (
    SELECT lab_id
    FROM public.sgrh_historial_laboral
    WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      AND (SELECT public.sucursal_visible(lab_sucursal_id))
  )
);

-- ─── 5. Protect contract & liquidation RPCs (SECURITY DEFINER) ──────────
CREATE OR REPLACE FUNCTION public.crear_contrato(p_empleado_id integer, p_contrato jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_puesto_id    integer := (p_contrato->>'lab_puesto_id')::integer;
  v_sucursal_id  integer := (p_contrato->>'lab_sucursal_id')::integer;
  v_tipo_id      integer := (p_contrato->>'lab_tipo_contrato_id')::integer;
  v_jornada_id   integer := (p_contrato->>'lab_tipo_jornada_id')::integer;
  v_inicio       date    := (p_contrato->>'lab_fecha_inicio')::date;
  v_base         numeric := (p_contrato->>'lab_salario_base')::numeric;
  v_real         numeric := (p_contrato->>'lab_salario_real')::numeric;
  v_ingreso      date;
  v_ultimo       record;
  v_lab_id       integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para registrar contratos.' USING ERRCODE = '42501';
  END IF;

  IF v_puesto_id IS NULL OR v_sucursal_id IS NULL OR v_tipo_id IS NULL
     OR v_jornada_id IS NULL OR v_inicio IS NULL OR v_base IS NULL OR v_real IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del contrato.' USING ERRCODE = '23514';
  END IF;

  SELECT e.emp_fecha_ingreso_original INTO v_ingreso
  FROM public.sgrh_empleados e
  WHERE e.emp_id = p_empleado_id
    AND EXISTS (
      SELECT 1
      FROM public.sgrh_historial_laboral h
      WHERE h.lab_empleado_id = e.emp_id
        AND h.lab_empresa_id = v_empresa_id
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empleado no encontrado.' USING ERRCODE = '23503';
  END IF;

  SELECT lab_id, lab_fecha_fin INTO v_ultimo
  FROM public.sgrh_historial_laboral
  WHERE lab_empleado_id = p_empleado_id AND lab_empresa_id = v_empresa_id
  ORDER BY lab_fecha_inicio DESC, lab_id DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_ultimo.lab_fecha_fin IS NULL THEN
      RAISE EXCEPTION 'Este empleado ya tiene un contrato vigente.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.sgrh_liquidaciones WHERE liq_historial_laboral_id = v_ultimo.lab_id
    ) THEN
      RAISE EXCEPTION 'El contrato anterior todavía está pendiente de liquidar.' USING ERRCODE = '23514';
    END IF;
    IF v_inicio <= v_ultimo.lab_fecha_fin THEN
      RAISE EXCEPTION 'El contrato nuevo tiene que empezar después del anterior, que terminó el %.',
        to_char(v_ultimo.lab_fecha_fin, 'DD/MM/YYYY') USING ERRCODE = '23514';
    END IF;
  END IF;

  IF v_ingreso IS NOT NULL AND v_inicio < v_ingreso THEN
    RAISE EXCEPTION 'El contrato no puede empezar antes del ingreso a la empresa (%).',
      to_char(v_ingreso, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;

  IF v_base <= 0 OR v_real <= 0 THEN
    RAISE EXCEPTION 'Los salarios tienen que ser mayores a 0.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_puestos
    WHERE pue_id = v_puesto_id AND pue_empresa_id = v_empresa_id AND pue_activo
  ) THEN
    RAISE EXCEPTION 'Puesto inexistente, inactivo o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = v_sucursal_id AND suc_empresa_id = v_empresa_id AND suc_activa
  ) THEN
    RAISE EXCEPTION 'Sucursal inexistente, inactiva o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.sucursal_visible(v_sucursal_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal seleccionada.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_contrato WHERE tco_id = v_tipo_id) THEN
    RAISE EXCEPTION 'Tipo de contrato inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_jornada WHERE tjo_id = v_jornada_id) THEN
    RAISE EXCEPTION 'Tipo de jornada inexistente.' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.sgrh_historial_laboral (
    lab_empleado_id, lab_empresa_id, lab_sucursal_id, lab_puesto_id,
    lab_tipo_contrato_id, lab_tipo_jornada_id, lab_fecha_inicio,
    lab_salario_base, lab_salario_real
  ) VALUES (
    p_empleado_id, v_empresa_id, v_sucursal_id, v_puesto_id,
    v_tipo_id, v_jornada_id, v_inicio,
    v_base, v_real
  )
  RETURNING lab_id INTO v_lab_id;

  RETURN v_lab_id;
END;
$$;

REVOKE ALL ON FUNCTION public.crear_contrato(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_contrato(integer, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.editar_contrato(p_lab_id integer, p_contrato jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_puesto_id    integer := (p_contrato->>'lab_puesto_id')::integer;
  v_tipo_id      integer := (p_contrato->>'lab_tipo_contrato_id')::integer;
  v_jornada_id   integer := (p_contrato->>'lab_tipo_jornada_id')::integer;
  v_sucursal_id  integer := (p_contrato->>'lab_sucursal_id')::integer;
  v_base         numeric := (p_contrato->>'lab_salario_base')::numeric;
  v_real         numeric := (p_contrato->>'lab_salario_real')::numeric;
  v_contrato     record;
  v_actualizados integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para editar contratos.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.tiene_permiso('NOMINA_READ') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar salarios del contrato.' USING ERRCODE = '42501';
  END IF;

  IF v_puesto_id IS NULL OR v_tipo_id IS NULL OR v_jornada_id IS NULL
     OR v_sucursal_id IS NULL OR v_base IS NULL OR v_real IS NULL THEN
    RAISE EXCEPTION 'Faltan datos del contrato.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_fecha_fin, lab_fecha_fin_programada, lab_sucursal_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.sucursal_visible(v_contrato.lab_sucursal_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal del contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_contrato.lab_fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Solo se puede editar el contrato vigente.' USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_fecha_fin_programada IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato tiene una terminación registrada: revertila antes de editarlo.'
      USING ERRCODE = '23514';
  END IF;

  IF v_base <= 0 OR v_real <= 0 THEN
    RAISE EXCEPTION 'Los salarios tienen que ser mayores a 0.' USING ERRCODE = '23514';
  END IF;

  IF v_sucursal_id <> v_contrato.lab_sucursal_id
     AND sgrh_private.tiene_quincena_sin_pagar(p_lab_id) THEN
    RAISE EXCEPTION 'Este contrato tiene una quincena sin pagar: terminá de pagarla antes de cambiarle la sucursal.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_puestos
    WHERE pue_id = v_puesto_id AND pue_empresa_id = v_empresa_id AND pue_activo
  ) THEN
    RAISE EXCEPTION 'Puesto inexistente, inactivo o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_contrato WHERE tco_id = v_tipo_id) THEN
    RAISE EXCEPTION 'Tipo de contrato inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_tipos_jornada WHERE tjo_id = v_jornada_id) THEN
    RAISE EXCEPTION 'Tipo de jornada inexistente.' USING ERRCODE = '23503';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = v_sucursal_id AND suc_empresa_id = v_empresa_id AND suc_activa
  ) THEN
    RAISE EXCEPTION 'Sucursal inexistente, inactiva o de otra empresa.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.sucursal_visible(v_sucursal_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal seleccionada.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.sgrh_historial_laboral
  SET lab_puesto_id        = v_puesto_id,
      lab_sucursal_id      = v_sucursal_id,
      lab_tipo_contrato_id = v_tipo_id,
      lab_tipo_jornada_id  = v_jornada_id,
      lab_salario_base     = v_base,
      lab_salario_real     = v_real
  WHERE lab_id = p_lab_id
    AND lab_empresa_id = v_empresa_id;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para editar este contrato.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_contrato(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_contrato(integer, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.terminar_contrato(
  p_lab_id         integer,
  p_fecha_fin      date,
  p_motivo_id      integer,
  p_recontratable  boolean,
  p_observaciones  character varying DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_hoy          date    := (now() AT TIME ZONE 'America/Costa_Rica')::date;
  v_contrato     record;
  v_programada   boolean;
  v_actualizados integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para terminar contratos.' USING ERRCODE = '42501';
  END IF;

  IF p_fecha_fin IS NULL OR p_motivo_id IS NULL THEN
    RAISE EXCEPTION 'Faltan la fecha o el motivo de salida.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_fecha_inicio, lab_fecha_fin, lab_fecha_fin_programada, lab_sucursal_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.sucursal_visible(v_contrato.lab_sucursal_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal del contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_contrato.lab_fecha_fin IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato ya está terminado.' USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_fecha_fin_programada IS NOT NULL THEN
    RAISE EXCEPTION 'Este contrato ya tiene una terminación programada para el %.',
      to_char(v_contrato.lab_fecha_fin_programada, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;
  IF p_fecha_fin < v_contrato.lab_fecha_inicio THEN
    RAISE EXCEPTION 'El último día no puede ser anterior al inicio del contrato (%).',
      to_char(v_contrato.lab_fecha_inicio, 'DD/MM/YYYY') USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_motivos_salida WHERE mot_id = p_motivo_id) THEN
    RAISE EXCEPTION 'Motivo de salida inexistente.' USING ERRCODE = '23503';
  END IF;

  v_programada := p_fecha_fin >= v_hoy;

  UPDATE public.sgrh_historial_laboral
  SET lab_fecha_fin            = CASE WHEN v_programada THEN NULL ELSE p_fecha_fin END,
      lab_fecha_fin_programada = CASE WHEN v_programada THEN p_fecha_fin ELSE NULL END,
      lab_motivo_salida_id     = p_motivo_id,
      lab_recontratable        = coalesce(p_recontratable, true),
      lab_observaciones_salida = nullif(btrim(p_observaciones), '')
  WHERE lab_id = p_lab_id
    AND lab_empresa_id = v_empresa_id;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para terminar este contrato.' USING ERRCODE = '42501';
  END IF;

  RETURN v_programada;
END;
$$;

REVOKE ALL ON FUNCTION public.terminar_contrato(integer, date, integer, boolean, character varying) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.terminar_contrato(integer, date, integer, boolean, character varying) TO authenticated;

CREATE OR REPLACE FUNCTION public.revertir_terminacion(p_lab_id integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id   integer := public.get_empresa_id();
  v_contrato     record;
  v_actualizados integer;
BEGIN
  IF NOT public.tiene_permiso('HISTORIAL_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para revertir terminaciones.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_empleado_id, lab_fecha_fin, lab_fecha_fin_programada, lab_sucursal_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.sucursal_visible(v_contrato.lab_sucursal_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal del contrato.' USING ERRCODE = '42501';
  END IF;
  IF v_contrato.lab_fecha_fin IS NULL AND v_contrato.lab_fecha_fin_programada IS NULL THEN
    RAISE EXCEPTION 'Este contrato no tiene una terminación registrada.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS (SELECT 1 FROM public.sgrh_liquidaciones WHERE liq_historial_laboral_id = p_lab_id) THEN
    RAISE EXCEPTION 'Este contrato ya fue liquidado: la terminación no se puede revertir.'
      USING ERRCODE = '23514';
  END IF;
  IF v_contrato.lab_fecha_fin IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sgrh_historial_laboral
    WHERE lab_empleado_id = v_contrato.lab_empleado_id
      AND lab_empresa_id = v_empresa_id
      AND lab_id <> p_lab_id
      AND lab_fecha_fin IS NULL
  ) THEN
    RAISE EXCEPTION 'El empleado ya tiene otro contrato vigente.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.sgrh_historial_laboral
  SET lab_fecha_fin            = NULL,
      lab_fecha_fin_programada = NULL,
      lab_motivo_salida_id     = NULL,
      lab_observaciones_salida = NULL,
      lab_recontratable        = true
  WHERE lab_id = p_lab_id
    AND lab_empresa_id = v_empresa_id;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para revertir esta terminación.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.revertir_terminacion(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revertir_terminacion(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_liquidacion(p_lab_id integer, p_liquidacion jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id integer := public.get_empresa_id();
  v_contrato   record;
  v_liq_id     integer;
  v_banco      jsonb := coalesce(p_liquidacion->'banco_horas', '[]'::jsonb);
  v_pagados    integer;
  v_suma       numeric;
  v_pendientes jsonb;
  v_absorbidos jsonb;
BEGIN
  IF NOT public.tiene_permiso('NOMINA_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para liquidar.' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('sgrh_contrato'), p_lab_id);

  SELECT lab_empleado_id, lab_sucursal_id, lab_fecha_fin, lab_motivo_salida_id INTO v_contrato
  FROM public.sgrh_historial_laboral
  WHERE lab_id = p_lab_id AND lab_empresa_id = v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '23503';
  END IF;
  IF NOT public.sucursal_visible(v_contrato.lab_sucursal_id) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal del contrato.' USING ERRCODE = '42501';
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

  IF jsonb_typeof(v_banco) <> 'array' THEN
    RAISE EXCEPTION 'Formato inválido de las horas del banco de horas.' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(sum((b->>'monto')::numeric), 0) INTO v_suma FROM jsonb_array_elements(v_banco) b;
  IF abs(v_suma - coalesce((p_liquidacion->>'liq_horas_extra_banco')::numeric, 0)) >= 0.01 THEN
    RAISE EXCEPTION 'El monto de horas extra del banco no coincide con sus movimientos.'
      USING ERRCODE = '23514';
  END IF;

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
        SELECT h.lab_id
        FROM public.sgrh_historial_laboral h
        WHERE h.lab_empleado_id = v_contrato.lab_empleado_id
          AND h.lab_empresa_id = v_empresa_id
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
        SELECT h.lab_id
        FROM public.sgrh_historial_laboral h
        WHERE h.lab_empleado_id = v_contrato.lab_empleado_id
          AND h.lab_empresa_id = v_empresa_id
      );
    GET DIAGNOSTICS v_pagados = ROW_COUNT;
    IF v_pagados <> jsonb_array_length(v_absorbidos) THEN
      RAISE EXCEPTION 'Las horas del banco de horas de este empleado cambiaron mientras se liquidaba (alguien las pagó o compensó). Volvé a calcular la liquidación.'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  DELETE FROM public.sgrh_programacion_semanal
  WHERE prg_historial_laboral_id = p_lab_id
    AND prg_fecha > v_contrato.lab_fecha_fin
    AND public.tiene_permiso('ASISTENCIA_WRITE')
    AND public.sucursal_visible(prg_sucursal_id);

  RETURN v_liq_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_liquidacion(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_liquidacion(integer, jsonb) TO authenticated;

-- ─── 6. Cross-branch anti-fraud, contract visibility & relation RPCs ────
CREATE OR REPLACE FUNCTION public.verificar_cuenta_pago_duplicada(
  p_cuenta_hmac text,
  p_excluir_emp_id integer DEFAULT NULL
)
RETURNS TABLE (duplicada boolean, empleado_nombre text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id integer := public.get_empresa_id();
  v_nombre     text;
BEGIN
  IF NOT public.tiene_permiso('EMPLEADOS_WRITE') OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para verificar cuentas bancarias.' USING ERRCODE = '42501';
  END IF;

  IF nullif(btrim(p_cuenta_hmac), '') IS NULL THEN
    RETURN QUERY SELECT false, NULL::text;
    RETURN;
  END IF;

  SELECT nullif(btrim(coalesce(e.emp_nombre, '') || ' ' || coalesce(e.emp_apellido_1, '')), '')
  INTO v_nombre
  FROM public.sgrh_empleado_datos_pago edp
  JOIN public.sgrh_empleados e ON e.emp_id = edp.edp_empleado_id
  WHERE edp.edp_cuenta_hmac = p_cuenta_hmac
    AND (p_excluir_emp_id IS NULL OR edp.edp_empleado_id <> p_excluir_emp_id)
    AND EXISTS (
      SELECT 1
      FROM public.sgrh_historial_laboral h
      WHERE h.lab_empleado_id = edp.edp_empleado_id
        AND h.lab_empresa_id = v_empresa_id
    )
  ORDER BY edp.edp_id ASC
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT true, coalesce(v_nombre, 'otro empleado');
  ELSE
    RETURN QUERY SELECT false, NULL::text;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_cuenta_pago_duplicada(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_cuenta_pago_duplicada(text, integer) TO authenticated;

COMMENT ON FUNCTION public.verificar_cuenta_pago_duplicada(text, integer) IS
  'Checks across the caller company if another employee already registered the same payment account HMAC, returning only boolean + display name without leaking cross-branch rows.';

CREATE OR REPLACE FUNCTION public.empleados_con_contrato_vigente_oculto(
  p_emp_ids integer[]
)
RETURNS integer[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id integer := public.get_empresa_id();
BEGIN
  IF NOT (public.tiene_permiso('EMPLEADOS_READ') OR public.tiene_permiso('HISTORIAL_READ'))
     OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No tenés permiso para consultar vigencia de contratos.' USING ERRCODE = '42501';
  END IF;

  IF p_emp_ids IS NULL OR cardinality(p_emp_ids) = 0 OR public.get_sucursal_ids() IS NULL THEN
    RETURN '{}'::integer[];
  END IF;

  RETURN (
    SELECT coalesce(array_agg(DISTINCT h.lab_empleado_id), '{}'::integer[])
    FROM public.sgrh_historial_laboral h
    WHERE h.lab_empleado_id = ANY (p_emp_ids)
      AND h.lab_empresa_id = v_empresa_id
      AND h.lab_fecha_fin IS NULL
      AND NOT public.sucursal_visible(h.lab_sucursal_id)
      AND NOT sgrh_private.historial_en_alcance(h.lab_id, h.lab_empresa_id, h.lab_sucursal_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.empleados_con_contrato_vigente_oculto(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.empleados_con_contrato_vigente_oculto(integer[]) TO authenticated;

COMMENT ON FUNCTION public.empleados_con_contrato_vigente_oculto(integer[]) IS
  'Returns only employee IDs in p_emp_ids that currently hold an active (lab_fecha_fin IS NULL) contract in another branch hidden from the caller. Never exposes salaries or branch IDs.';

CREATE OR REPLACE FUNCTION public.nomina_alcance_relacion(
  p_lab_ids integer[],
  p_desde date DEFAULT NULL,
  p_hasta date DEFAULT NULL
)
RETURNS TABLE (
  lab_id integer,
  tiene_alcance_oculto boolean,
  ultimo_corte_liquidado date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_empresa_id      integer := public.get_empresa_id();
  v_restringido     boolean := public.get_sucursal_ids() IS NOT NULL;
BEGIN
  IF p_lab_ids IS NULL OR cardinality(p_lab_ids) = 0 OR v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT (public.tiene_permiso('NOMINA_READ') OR public.tiene_permiso('NOMINA_WRITE')) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    actual.lab_id,
    (
      v_restringido
      AND EXISTS (
        SELECT 1
        FROM public.sgrh_historial_laboral otro
        WHERE otro.lab_empleado_id = actual.lab_empleado_id
          AND otro.lab_empresa_id = v_empresa_id
          AND otro.lab_id <> actual.lab_id
          AND NOT EXISTS (
            SELECT 1
            FROM public.sgrh_liquidaciones l
            WHERE l.liq_historial_laboral_id = otro.lab_id
          )
          AND (
            (
              otro.lab_fecha_inicio <= actual.lab_fecha_inicio
              AND (uc.ultimo_corte IS NULL OR otro.lab_fecha_inicio > uc.ultimo_corte)
              AND (p_hasta IS NULL OR otro.lab_fecha_inicio <= p_hasta)
              AND (p_desde IS NULL OR otro.lab_fecha_fin IS NULL OR otro.lab_fecha_fin >= p_desde)
            )
            OR (
              otro.lab_fecha_inicio > actual.lab_fecha_inicio
              AND NOT EXISTS (
                SELECT 1
                FROM public.sgrh_liquidaciones l_act
                WHERE l_act.liq_historial_laboral_id = actual.lab_id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM public.sgrh_historial_laboral corte_post
                JOIN public.sgrh_liquidaciones l_post
                  ON l_post.liq_historial_laboral_id = corte_post.lab_id
                WHERE corte_post.lab_empleado_id = actual.lab_empleado_id
                  AND corte_post.lab_empresa_id = v_empresa_id
                  AND corte_post.lab_fecha_inicio >= actual.lab_fecha_inicio
                  AND corte_post.lab_fecha_inicio < otro.lab_fecha_inicio
              )
            )
          )
          AND NOT public.sucursal_visible(otro.lab_sucursal_id)
      )
    ) AS tiene_alcance_oculto,
    uc.ultimo_corte AS ultimo_corte_liquidado
  FROM public.sgrh_historial_laboral actual
  LEFT JOIN LATERAL (
    SELECT max(coalesce(corte.lab_fecha_fin, corte.lab_fecha_inicio)) AS ultimo_corte
    FROM public.sgrh_historial_laboral corte
    JOIN public.sgrh_liquidaciones l_corte
      ON l_corte.liq_historial_laboral_id = corte.lab_id
    WHERE corte.lab_empleado_id = actual.lab_empleado_id
      AND corte.lab_empresa_id = v_empresa_id
      AND corte.lab_id <> actual.lab_id
      AND corte.lab_fecha_inicio <= actual.lab_fecha_inicio
  ) uc ON true
  WHERE actual.lab_id = ANY (p_lab_ids)
    AND actual.lab_empresa_id = v_empresa_id
    AND (
      NOT v_restringido
      OR sgrh_private.historial_en_alcance(
        actual.lab_id,
        actual.lab_empresa_id,
        actual.lab_sucursal_id
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.nomina_alcance_relacion(integer[], date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.nomina_alcance_relacion(integer[], date, date) TO authenticated;

COMMENT ON FUNCTION public.nomina_alcance_relacion(integer[], date, date) IS
  'For each visible contract in p_lab_ids, returns whether its active employment relation includes another unliquidated contract in an invisible branch plus the latest prior liquidated cut date (ultimo_corte_liquidado). Returns zero salaries.';

NOTIFY pgrst, 'reload schema';

COMMIT;
