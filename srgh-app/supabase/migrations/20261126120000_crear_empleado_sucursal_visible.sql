-- =====================================================================
-- SGRH-122: el alta de empleados respeta las sucursales de la cuenta
-- =====================================================================
-- crear_empleado_completo validaba que la sucursal fuera de la empresa del
-- JWT, pero no que la cuenta la pudiera ver. Como corre con SECURITY DEFINER,
-- la RLS no la cubre: una cuenta limitada a la sucursal A podía crear un
-- empleado (y su contrato) en la sucursal B llamando a la RPC directamente.
--
-- Cambio: el mismo cuerpo de 20260824120000_datos_pago_cifrado.sql más un
-- chequeo con public.sucursal_visible(). Una cuenta de empresa (sin sucursales
-- asignadas) sigue viendo todas, igual que antes.
-- =====================================================================

BEGIN;

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
  -- Los dos permisos que exigirían empleados_insert e historial_insert si la
  -- RLS estuviera activa. Ver la nota de cabecera.
  IF NOT (public.tiene_permiso('EMPLEADOS_WRITE') AND public.tiene_permiso('HISTORIAL_WRITE')) THEN
    RAISE EXCEPTION 'Sin permiso para crear empleados'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  v_empresa_id := public.get_empresa_id();
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo determinar la empresa del usuario'
      USING ERRCODE = '42501';
  END IF;

  -- Los catálogos con dueño se validan contra la empresa del JWT para impedir
  -- referencias cruzadas entre inquilinos.
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
  ) THEN
    RAISE EXCEPTION 'Sucursal inexistente o de otra empresa'
      USING ERRCODE = '23503';
  END IF;

  -- SGRH-122: además de ser de la empresa, la sucursal tiene que ser una de las
  -- que ve la cuenta. La función es SECURITY DEFINER (salta la RLS), así que
  -- sin esto una cuenta de una sola sucursal podía dar de alta personal en
  -- otra llamando a la RPC directo, sin pasar por la pantalla.
  IF NOT public.sucursal_visible((p_contratacion->>'lab_sucursal_id')::int) THEN
    RAISE EXCEPTION 'No tenés acceso a esa sucursal'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  IF p_datos_pago IS NOT NULL THEN
    v_banco_id    := (p_datos_pago->>'edp_banco_id')::int;
    -- SIN normalizar: el valor ya viene cifrado y cualquier upper()/replace()
    -- sobre base64 lo destruye. nullif('') solo descarta la cadena vacía.
    v_cuenta      := nullif(p_datos_pago->>'edp_numero_cuenta', '');
    v_cuenta_hmac := nullif(p_datos_pago->>'edp_cuenta_hmac', '');

    -- El banco es catálogo global: basta con que exista y esté activo.
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
      -- Una cuenta sin banco no es interpretable (el banco define la entidad
      -- del IBAN); la UI además deshabilita el campo hasta elegir banco.
      IF v_banco_id IS NULL THEN
        RAISE EXCEPTION 'Selecciona el banco de la cuenta'
          USING ERRCODE = '23514'; -- check_violation
      END IF;

      -- El constraint edp_cuenta_hmac_pareado atajaría esto igual, pero con un
      -- mensaje ilegible para la UI. Acá el error dice qué falta.
      IF v_cuenta_hmac IS NULL THEN
        RAISE EXCEPTION 'Los datos de pago llegaron sin índice de cuenta'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;

  -- La dirección se crea primero: el FK vive en sgrh_empleados y la columna ya
  -- es NOT NULL, así que sin dirección no hay empleado.
  v_distrito_id := (p_direccion->>'dir_distrito_id')::int;

  IF v_distrito_id IS NULL THEN
    RAISE EXCEPTION 'La dirección del empleado es obligatoria'
      USING ERRCODE = '23514';
  END IF;

  -- Los distritos son catálogo global (sin dueño): basta con que exista.
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_distritos WHERE dis_id = v_distrito_id
  ) THEN
    RAISE EXCEPTION 'Distrito inexistente'
      USING ERRCODE = '23503';
  END IF;

  -- dir_codigo_postal se omite a propósito: lo calcula el trigger desde el
  -- distrito, así que un postal en el payload del cliente no tiene efecto.
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

  -- Los datos de pago son opcionales: solo se inserta la fila si viene al
  -- menos un valor real (evita filas vacías).
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

REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) TO authenticated;

COMMIT;
