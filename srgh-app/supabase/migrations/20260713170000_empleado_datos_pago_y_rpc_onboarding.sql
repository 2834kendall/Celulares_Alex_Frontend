-- Los datos de pago (banco, tipo y número de cuenta) vivían como columnas de
-- sgrh_empleados. RLS protege filas, no columnas: cualquier rol con
-- EMPLEADOS_READ (p. ej. SUPERVISOR) podía leer cuentas bancarias vía la API
-- aunque la UI las ocultara. Se mueven a una tabla propia con policies más
-- estrictas (NOMINA_READ / EMPLEADOS_WRITE / el propio empleado).
--
-- Además, el alta de empleado tocaba 2-3 tablas desde el frontend con
-- compensación manual (sin transacción real). Se reemplaza por la RPC
-- crear_empleado_completo: una transacción atómica que elimina la ventana de
-- empleados huérfanos y la necesidad del cliente admin en el alta.

-- ─── 1. Tabla de datos de pago ────────────────────────────────────────────────
-- 1:1 con el empleado. El UNIQUE sobre el FK también lo indexa; si a futuro se
-- necesita histórico de cuentas o depósito dividido, se retira el UNIQUE y se
-- agrega vigencia sin romper el modelo.

CREATE TABLE IF NOT EXISTS public.sgrh_empleado_datos_pago (
  edp_id            serial PRIMARY KEY,
  edp_empleado_id   int NOT NULL UNIQUE REFERENCES public.sgrh_empleados(emp_id) ON DELETE CASCADE,
  edp_banco         varchar(80),
  edp_tipo_cuenta   varchar(10) CHECK (edp_tipo_cuenta IN ('CORRIENTE', 'AHORRO', 'SINPE')),
  edp_numero_cuenta varchar(30),
  edp_created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sgrh_empleado_datos_pago ENABLE ROW LEVEL SECURITY;

-- ─── 2. Policies ──────────────────────────────────────────────────────────────
-- La ficha general del empleado sigue visible con EMPLEADOS_READ; los datos de
-- pago exigen NOMINA_READ o EMPLEADOS_WRITE, o ser el propio empleado.
-- Multi-tenant vía historial laboral, igual que el resto de policies.

DROP POLICY IF EXISTS "datos_pago_select" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_select" ON public.sgrh_empleado_datos_pago
  FOR SELECT TO authenticated
  USING (
    edp_empleado_id = (SELECT public.get_emp_id()) OR
    (
      ((SELECT public.tiene_permiso('NOMINA_READ')) OR (SELECT public.tiene_permiso('EMPLEADOS_WRITE')))
      AND edp_empleado_id IN (
        SELECT lab_empleado_id FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
      )
    )
  );

DROP POLICY IF EXISTS "datos_pago_insert" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_insert" ON public.sgrh_empleado_datos_pago
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

DROP POLICY IF EXISTS "datos_pago_update" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_update" ON public.sgrh_empleado_datos_pago
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  )
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

DROP POLICY IF EXISTS "datos_pago_delete" ON public.sgrh_empleado_datos_pago;
CREATE POLICY "datos_pago_delete" ON public.sgrh_empleado_datos_pago
  FOR DELETE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE')) AND edp_empleado_id IN (
      SELECT lab_empleado_id FROM public.sgrh_historial_laboral
      WHERE lab_empresa_id = (SELECT public.get_empresa_id())
    )
  );

-- ─── 3. Migración de datos existentes ─────────────────────────────────────────
-- Guardada tras un chequeo de existencia de columna para que la migración sea
-- re-ejecutable después del DROP (idempotencia).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sgrh_empleados' AND column_name = 'emp_banco'
  ) THEN
    INSERT INTO public.sgrh_empleado_datos_pago
      (edp_empleado_id, edp_banco, edp_tipo_cuenta, edp_numero_cuenta)
    SELECT 
      emp_id, 
      emp_banco, 
      CASE 
        WHEN upper(emp_tipo_cuenta) IN ('AHORRO', 'AHORROS') THEN 'AHORRO'
        WHEN upper(emp_tipo_cuenta) IN ('CORRIENTE', 'CORRIENTES') THEN 'CORRIENTE'
        WHEN upper(emp_tipo_cuenta) = 'SINPE' THEN 'SINPE'
        ELSE NULL
      END, 
      emp_numero_cuenta
    FROM public.sgrh_empleados
    WHERE emp_banco IS NOT NULL
       OR emp_tipo_cuenta IS NOT NULL
       OR emp_numero_cuenta IS NOT NULL
    ON CONFLICT (edp_empleado_id) DO NOTHING;
  END IF;
END;
$$;

-- ─── 4. Retiro de las columnas antiguas ───────────────────────────────────────

ALTER TABLE public.sgrh_empleados
  DROP COLUMN IF EXISTS emp_banco,
  DROP COLUMN IF EXISTS emp_tipo_cuenta,
  DROP COLUMN IF EXISTS emp_numero_cuenta;

-- ─── 5. RPC de onboarding atómico ─────────────────────────────────────────────
-- SECURITY DEFINER por dos razones: (a) transacción real sobre 3 tablas sin
-- compensación manual; (b) el RETURNING del insert de empleado es invisible
-- bajo empleados_select para un empleado aún sin historial. Como DEFINER no
-- evalúa RLS, la autorización se re-verifica adentro y la empresa sale SIEMPRE
-- del JWT — nunca del payload. Los campos se extraen de forma explícita: un
-- jsonb con claves extra no puede colar columnas.

CREATE OR REPLACE FUNCTION public.crear_empleado_completo(
  p_empleado     jsonb,
  p_contratacion jsonb,
  p_datos_pago   jsonb DEFAULT NULL
)
RETURNS int AS $$
DECLARE
  v_empresa_id int;
  v_emp_id     int;
BEGIN
  IF NOT public.tiene_permiso('EMPLEADOS_WRITE') THEN
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

  INSERT INTO public.sgrh_empleados (
    emp_nombre, emp_apellido_1, emp_apellido_2,
    emp_tipo_identificacion_id, emp_numero_identificacion,
    emp_fecha_ingreso_original, emp_fecha_nacimiento, emp_genero,
    emp_nacionalidad, emp_telefono, emp_email_personal,
    emp_numero_asegurado_ccss,
    emp_nombre_contacto_emergencia, emp_telefono_emergencia
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
    p_empleado->>'emp_telefono_emergencia'
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
  IF p_datos_pago IS NOT NULL AND (
    p_datos_pago->>'edp_banco' IS NOT NULL OR
    p_datos_pago->>'edp_tipo_cuenta' IS NOT NULL OR
    p_datos_pago->>'edp_numero_cuenta' IS NOT NULL
  ) THEN
    INSERT INTO public.sgrh_empleado_datos_pago (
      edp_empleado_id, edp_banco, edp_tipo_cuenta, edp_numero_cuenta
    ) VALUES (
      v_emp_id,
      p_datos_pago->>'edp_banco',
      p_datos_pago->>'edp_tipo_cuenta',
      p_datos_pago->>'edp_numero_cuenta'
    );
  END IF;

  RETURN v_emp_id;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- Igual que el resto de funciones del sistema: nada de EXECUTE implícito.
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb) TO authenticated;
