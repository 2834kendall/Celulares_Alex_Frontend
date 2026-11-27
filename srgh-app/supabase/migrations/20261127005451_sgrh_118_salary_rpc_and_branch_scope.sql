-- =====================================================================
-- SGRH-118 — Stage 2 (Expand + Migrate):
--   1. Scope crear_empleado_completo, crear_contrato, and editar_contrato
--      to public.sucursal_visible(...) + defense-in-depth checks.
--   2. Add obtener_salarios_historial(integer[]) RPC to decouple salary
--      reads from direct SELECT on sgrh_historial_laboral.
--
-- Backwards-compatible: does NOT revoke SELECT or alter historial_select.
-- =====================================================================

BEGIN;

-- ─── 1. crear_empleado_completo ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_empleado_completo(
  p_empleado     jsonb,
  p_contratacion jsonb,
  p_datos_pago   jsonb DEFAULT NULL,
  p_direccion    jsonb DEFAULT NULL
)
RETURNS int AS $$
DECLARE
  v_empresa_id   int;
  v_emp_id       int;
  v_banco_id     int;
  v_cuenta       text;
  v_cuenta_hmac  text;
  v_distrito_id  int;
  v_direccion_id int;
BEGIN
  IF NOT (public.tiene_permiso('EMPLEADOS_WRITE') AND public.tiene_permiso('HISTORIAL_WRITE')) THEN
    RAISE EXCEPTION 'Sin permiso para crear empleados'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  v_empresa_id := public.get_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la empresa del usuario'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_puestos
    WHERE pue_id = (p_contratacion->>'lab_puesto_id')::int
      AND pue_empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Puesto inexistente o de otra empresa'
      USING ERRCODE = '23503'; -- foreign_key_violation
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = (p_contratacion->>'lab_sucursal_id')::int
      AND suc_empresa_id = v_empresa_id
      AND suc_activa
  ) THEN
    RAISE EXCEPTION 'Sucursal inexistente, inactiva o de otra empresa'
      USING ERRCODE = '23503';
  END IF;

  IF NOT public.sucursal_visible((p_contratacion->>'lab_sucursal_id')::int) THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal seleccionada.'
      USING ERRCODE = '42501';
  END IF;

  IF (p_contratacion->>'lab_salario_base')::numeric IS NULL
     OR (p_contratacion->>'lab_salario_real')::numeric IS NULL
     OR (p_contratacion->>'lab_salario_base')::numeric <= 0
     OR (p_contratacion->>'lab_salario_real')::numeric <= 0 THEN
    RAISE EXCEPTION 'Los salarios tienen que ser mayores a 0.'
      USING ERRCODE = '23514';
  END IF;

  IF (p_empleado->>'emp_fecha_nacimiento')::date IS NOT NULL
     AND (p_empleado->>'emp_fecha_nacimiento')::date > (now() AT TIME ZONE 'America/Costa_Rica')::date THEN
    RAISE EXCEPTION 'La fecha de nacimiento no puede ser futura.'
      USING ERRCODE = '23514';
  END IF;

  IF p_datos_pago IS NOT NULL THEN
    v_banco_id    := (p_datos_pago->>'edp_banco_id')::int;
    v_cuenta      := nullif(p_datos_pago->>'edp_numero_cuenta', '');
    v_cuenta_hmac := nullif(p_datos_pago->>'edp_cuenta_hmac', '');

    IF v_banco_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.sgrh_cat_bancos
         WHERE ban_id = v_banco_id AND ban_activo
       )
    THEN
      RAISE EXCEPTION 'Banco inexistente o inactivo'
        USING ERRCODE = '23503';
    END IF;

    IF v_cuenta IS NOT NULL THEN
      IF v_banco_id IS NULL THEN
        RAISE EXCEPTION 'Selecciona el banco de la cuenta'
          USING ERRCODE = '23514';
      END IF;

      IF v_cuenta_hmac IS NULL THEN
        RAISE EXCEPTION 'Los datos de pago llegaron sin índice de cuenta'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  v_distrito_id := (p_direccion->>'dir_distrito_id')::int;

  IF v_distrito_id IS NULL THEN
    RAISE EXCEPTION 'La dirección del empleado es obligatoria'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_distritos WHERE dis_id = v_distrito_id
  ) THEN
    RAISE EXCEPTION 'Distrito inexistente'
      USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.sgrh_direcciones (dir_distrito_id, dir_senas_exactas)
  VALUES (v_distrito_id, nullif(trim(p_direccion->>'dir_senas_exactas'), ''))
  RETURNING dir_id INTO v_direccion_id;

  INSERT INTO public.sgrh_empleados (
    emp_nombre, emp_apellido_1, emp_apellido_2,
    emp_tipo_identificacion_id, emp_numero_identificacion,
    emp_fecha_ingreso_original, emp_fecha_nacimiento, emp_genero,
    emp_nacionalidad, emp_telefono, emp_email_personal,
    emp_numero_asegurado_ccss,
    emp_nombre_contacto_emergencia, emp_telefono_emergencia,
    emp_direccion_id
  ) VALUES (
    p_empleado->>'emp_nombre',
    p_empleado->>'emp_apellido_1',
    p_empleado->>'emp_apellido_2',
    (p_empleado->>'emp_tipo_identificacion_id')::int,
    p_empleado->>'emp_numero_identificacion',
    (p_empleado->>'emp_fecha_ingreso_original')::date,
    (p_empleado->>'emp_fecha_nacimiento')::date,
    p_empleado->>'emp_genero',
    coalesce(p_empleado->>'emp_nacionalidad', 'Costarricense'),
    p_empleado->>'emp_telefono',
    p_empleado->>'emp_email_personal',
    p_empleado->>'emp_numero_asegurado_ccss',
    p_empleado->>'emp_nombre_contacto_emergencia',
    p_empleado->>'emp_telefono_emergencia',
    v_direccion_id
  )
  RETURNING emp_id INTO v_emp_id;

  INSERT INTO public.sgrh_historial_laboral (
    lab_empleado_id, lab_empresa_id, lab_puesto_id, lab_sucursal_id,
    lab_tipo_contrato_id, lab_tipo_jornada_id, lab_fecha_inicio,
    lab_salario_base, lab_salario_real
  ) VALUES (
    v_emp_id,
    v_empresa_id,
    (p_contratacion->>'lab_puesto_id')::int,
    (p_contratacion->>'lab_sucursal_id')::int,
    (p_contratacion->>'lab_tipo_contrato_id')::int,
    (p_contratacion->>'lab_tipo_jornada_id')::int,
    (p_contratacion->>'lab_fecha_inicio')::date,
    (p_contratacion->>'lab_salario_base')::numeric,
    (p_contratacion->>'lab_salario_real')::numeric
  );

  IF v_banco_id IS NOT NULL
     OR p_datos_pago->>'edp_tipo_cuenta' IS NOT NULL
     OR v_cuenta IS NOT NULL
  THEN
    INSERT INTO public.sgrh_empleado_datos_pago (
      edp_empleado_id, edp_banco_id, edp_tipo_cuenta, edp_numero_cuenta, edp_cuenta_hmac
    ) VALUES (
      v_emp_id,
      v_banco_id,
      p_datos_pago->>'edp_tipo_cuenta',
      v_cuenta,
      v_cuenta_hmac
    );
  END IF;

  RETURN v_emp_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) TO authenticated;

-- ─── 2. crear_contrato ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crear_contrato(p_empleado_id integer, p_contrato jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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

  SELECT emp_fecha_ingreso_original INTO v_ingreso
  FROM public.sgrh_empleados WHERE emp_id = p_empleado_id;
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

-- ─── 3. editar_contrato ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.editar_contrato(p_lab_id integer, p_contrato jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
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
  WHERE lab_id = p_lab_id;

  GET DIAGNOSTICS v_actualizados = ROW_COUNT;
  IF v_actualizados = 0 THEN
    RAISE EXCEPTION 'No tenés permiso para editar este contrato.' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.editar_contrato(integer, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.editar_contrato(integer, jsonb) TO authenticated;

-- ─── 4. obtener_salarios_historial ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.obtener_salarios_historial(p_lab_ids integer[])
RETURNS TABLE (lab_id integer, lab_salario_base numeric, lab_salario_real numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id integer;
BEGIN
  IF p_lab_ids IS NULL OR cardinality(p_lab_ids) = 0 THEN
    RETURN;
  END IF;

  v_empresa_id := public.get_empresa_id();
  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF public.tiene_permiso('NOMINA_READ') THEN
    RETURN QUERY
    SELECT hl.lab_id, hl.lab_salario_base, hl.lab_salario_real
    FROM public.sgrh_historial_laboral hl
    WHERE hl.lab_id = ANY(p_lab_ids)
      AND hl.lab_empresa_id = v_empresa_id
      AND (
        public.sucursal_visible(hl.lab_sucursal_id)
        OR EXISTS (
          SELECT 1
          FROM public.sgrh_nomina_detalle d
          WHERE d.ndt_historial_laboral_id = hl.lab_id
            AND d.ndt_sucursal_id IN (SELECT public.sucursales_visibles())
        )
      );
  ELSE
    RETURN QUERY
    SELECT hl.lab_id, hl.lab_salario_base, hl.lab_salario_real
    FROM public.sgrh_historial_laboral hl
    WHERE hl.lab_id = ANY(p_lab_ids)
      AND hl.lab_empresa_id = v_empresa_id
      AND hl.lab_empleado_id = public.get_emp_id();
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_salarios_historial(integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.obtener_salarios_historial(integer[]) TO authenticated;

COMMENT ON FUNCTION public.obtener_salarios_historial(integer[]) IS
  'Devuelve lab_salario_base y lab_salario_real por lab_id solo para usuarios con NOMINA_READ (acotado a sucursales visibles del contrato o de sus filas de planilla) o para el propio empleado (get_emp_id()).';

COMMIT;
