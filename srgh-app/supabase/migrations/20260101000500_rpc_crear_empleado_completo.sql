-- =====================================================================
-- SGRH — Baseline: RPC de onboarding de empleados
-- =====================================================================
-- Alta atómica de empleado: dirección + empleado + historial laboral +
-- datos de pago en una sola transacción. Existe porque supabase-js no puede
-- hacer transacciones multi-statement: sin la RPC, un fallo a mitad dejaría
-- un empleado sin contrato o una dirección huérfana.
--
-- ── Por qué SECURITY DEFINER (y por qué NO cambiarlo a INVOKER) ──────────
-- Parece un candidato obvio a SECURITY INVOKER, pero no lo es. Las cuatro
-- inserciones usan RETURNING para encadenar los ids, y en Postgres un
-- INSERT ... RETURNING con RLS activa aplica también la policy de SELECT a
-- la fila devuelta. Ahí está el problema:
--
--   * empleados_select exige que el emp_id ya aparezca en
--     sgrh_historial_laboral — pero el historial se inserta DESPUÉS, porque
--     necesita el emp_id. Bajo INVOKER el RETURNING devolvería vacío,
--     v_emp_id quedaría NULL y el INSERT del historial fallaría.
--   * direcciones_select exige que la dirección ya esté referenciada por un
--     empleado, empresa o sucursal — y en ese punto no lo está por nadie.
--
-- Es un grafo de objetos cuyas policies de lectura solo se satisfacen una
-- vez que el grafo está completo. DEFINER es la respuesta correcta acá, no
-- un atajo.
--
-- ── Consecuencia: los chequeos de abajo son la ÚNICA capa ────────────────
-- Al saltarse la RLS, esta función es responsable de replicar TODO lo que
-- las policies habrían exigido. Antes no lo hacía: validaba EMPLEADOS_WRITE
-- pero no HISTORIAL_WRITE, y sin embargo escribe en sgrh_historial_laboral
-- (donde viven lab_salario_base y lab_salario_real). Eso convertía un
-- permiso de "crear empleados" en uno de "escribir salarios" para cualquier
-- rol que tuviera el primero sin el segundo. Se exigen los dos.
--
-- Si algún día se agrega una tabla más a esta RPC, hay que agregar acá el
-- permiso que pide su policy de INSERT. No hay red de seguridad detrás.
-- =====================================================================

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
  v_ban_codigo   varchar(3);
  v_cuenta       text;
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

  IF p_datos_pago IS NOT NULL THEN
    v_banco_id := (p_datos_pago->>'edp_banco_id')::int;
    v_cuenta   := nullif(upper(regexp_replace(p_datos_pago->>'edp_numero_cuenta', '\s', '', 'g')), '');

    -- El banco es catálogo global: basta con que exista y esté activo.
    IF v_banco_id IS NOT NULL THEN
      SELECT ban_codigo INTO v_ban_codigo
      FROM public.sgrh_cat_bancos
      WHERE ban_id = v_banco_id AND ban_activo;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Banco inexistente o inactivo'
          USING ERRCODE = '23503';
      END IF;
    END IF;

    -- Coherencia del número según el tipo de cuenta (23514 = check_violation).
    IF v_cuenta IS NOT NULL THEN
      -- Una cuenta sin banco no es interpretable (el banco define la entidad
      -- del IBAN); la UI además deshabilita el campo hasta elegir banco.
      IF v_banco_id IS NULL THEN
        RAISE EXCEPTION 'Selecciona el banco de la cuenta'
          USING ERRCODE = '23514';
      END IF;

      IF p_datos_pago->>'edp_tipo_cuenta' = 'SINPE' THEN
        IF v_cuenta !~ '^\d{8}$' THEN
          RAISE EXCEPTION 'Para SINPE Móvil el número debe ser un teléfono de 8 dígitos'
            USING ERRCODE = '23514';
        END IF;
      ELSE
        IF v_cuenta !~ '^CR\d{20}$' THEN
          RAISE EXCEPTION 'El IBAN debe tener el formato CR + 20 dígitos'
            USING ERRCODE = '23514';
        END IF;
        IF v_ban_codigo IS NOT NULL AND substr(v_cuenta, 6, 3) <> v_ban_codigo THEN
          RAISE EXCEPTION 'El IBAN no corresponde al banco seleccionado'
            USING ERRCODE = '23514';
        END IF;
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
      edp_empleado_id, edp_banco_id, edp_tipo_cuenta, edp_numero_cuenta
    ) VALUES (
      v_emp_id,
      v_banco_id,
      p_datos_pago->>'edp_tipo_cuenta',
      v_cuenta
    );
  END IF;

  RETURN v_emp_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- search_path fijo arriba + nada de EXECUTE implícito acá: las dos mitades de
-- endurecer una función SECURITY DEFINER.
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) TO authenticated;
