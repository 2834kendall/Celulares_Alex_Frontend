-- =====================================================================
-- Cifrado at-rest del número de cuenta del empleado (IBAN / SINPE)
-- =====================================================================
-- edp_numero_cuenta guardaba el IBAN o el teléfono SINPE en texto plano. La
-- RLS de datos_pago_select decide QUIÉN puede leer la fila, pero no protege el
-- dato de nada que ocurra por debajo de ella: un pg_dump, un backup, el Table
-- Editor del dashboard, una fuga de la secret key (que bypasea RLS) o un bug en
-- una policy. A partir de acá la columna guarda 'v1:<iv>:<ciphertext>' y la
-- llave vive solo en la aplicación: Postgres nunca ve el valor en claro.
--
-- ── Qué se pierde y con qué se reemplaza ────────────────────────────────
-- Esta función ya no puede validar el formato del número: recibe ciphertext.
-- Los tres chequeos que se van (SINPE de 8 dígitos, IBAN CR+20, código de
-- entidad contra el banco) pasan a modules/employees/lib/validateDatosPago.ts
-- y a datosPagoSchema, que corren sobre el texto plano ANTES de cifrar.
--
-- A cambio la base gana dos constraints que antes no existían y que sí puede
-- verificar sobre ciphertext (ver abajo). El intercambio no es neutro y hay que
-- tenerlo presente: un llamado directo a PostgREST ya no rebota por un IBAN mal
-- formado, solo por no venir cifrado.
--
-- ⚠️ La normalización `upper(regexp_replace(...))` que tenía la versión
-- anterior está ELIMINADA a propósito, no por olvido. upper() sobre base64 lo
-- corrompe de forma silenciosa e irreversible. Ninguna transformación de texto
-- puede volver a tocar esta columna.
-- =====================================================================

-- ─── 1. Forma de la columna ─────────────────────────────────────────────
-- El ciphertext ronda los 72 caracteres y no entra en varchar(30). Ensanchar a
-- text no reescribe la tabla.
ALTER TABLE public.sgrh_empleado_datos_pago
  ALTER COLUMN edp_numero_cuenta TYPE text;

-- ─── 2. Índice ciego ────────────────────────────────────────────────────
-- El IV aleatorio de GCM hace que dos cifrados del mismo número no se parezcan
-- en nada, así que sin esto sería imposible preguntar "¿esta cuenta ya está
-- registrada para otro empleado?" — un control antifraude real en planilla
-- (empleado fantasma cobrando a la cuenta de otro). El HMAC permite comparar
-- sin poder leer, y usa una llave DISTINTA a la de cifrado.
ALTER TABLE public.sgrh_empleado_datos_pago
  ADD COLUMN IF NOT EXISTS edp_cuenta_hmac text;

-- Índice NO único, y es deliberado. Un UNIQUE global sería incorrecto: esta
-- tabla no tiene empresa_id (la empresa llega vía sgrh_historial_laboral), una
-- misma persona puede trabajar en las dos empresas del grupo, una cuenta
-- compartida entre cónyuges es legítima, y un unique global sería además un
-- oráculo de enumeración cross-tenant — permitiría detectar que otra empresa
-- tiene registrada una cuenta. El alcance por empresa lo pone la consulta de
-- validateDatosPago, apoyada en la RLS.
CREATE INDEX IF NOT EXISTS sgrh_empleado_datos_pago_cuenta_hmac_idx
  ON public.sgrh_empleado_datos_pago (edp_cuenta_hmac);

-- ─── 3. Constraints ─────────────────────────────────────────────────────
-- Los dos van NOT VALID: las filas viejas (en claro y sin HMAC) sobreviven
-- hasta el backfill, pero toda escritura nueva queda obligada a cumplir. Se
-- validan en supabase/scripts/validar-cuentas-cifradas.sql, después de correr
-- scripts/encrypt-payment-data.ts.

-- Reemplaza a la validación de formato que la RPC pierde. La base deja de
-- validar "esto parece un IBAN" y pasa a validar "nadie escribió esto en
-- claro", que después de cifrar es la invariante que importa.
ALTER TABLE public.sgrh_empleado_datos_pago
  ADD CONSTRAINT edp_numero_cuenta_cifrado
  CHECK (edp_numero_cuenta IS NULL OR edp_numero_cuenta ~ '^v[0-9]+:')
  NOT VALID;

-- Ciphertext y HMAC se mueven SIEMPRE juntos. Escribir uno sin el otro deja el
-- índice apuntando a una cuenta que ya no está, y eso produce falsos positivos
-- de duplicado contra un número que nadie tiene registrado. Como constraint deja
-- de depender de que quien edite las Server Actions se acuerde.
ALTER TABLE public.sgrh_empleado_datos_pago
  ADD CONSTRAINT edp_cuenta_hmac_pareado
  CHECK ((edp_numero_cuenta IS NULL) = (edp_cuenta_hmac IS NULL))
  NOT VALID;

-- ─── 4. Documentación en la base ────────────────────────────────────────
COMMENT ON COLUMN public.sgrh_empleado_datos_pago.edp_numero_cuenta IS
  'IBAN (CR + 20 dígitos) o teléfono de 8 dígitos si el tipo es SINPE, CIFRADO con AES-256-GCM en el formato v1:<iv base64>:<ciphertext+tag base64>. NO es legible desde SQL: la llave (FIELD_ENCRYPTION_KEY) vive solo en la aplicación. El formato y la coherencia con el banco se validan en TypeScript sobre el texto plano, antes de cifrar.';

COMMENT ON COLUMN public.sgrh_empleado_datos_pago.edp_cuenta_hmac IS
  'Índice ciego del número de cuenta: HMAC-SHA256(FIELD_INDEX_KEY, cuenta normalizada) en base64. Sirve para detectar la misma cuenta en dos empleados sin poder leerla; no es reversible. Llave distinta a la de cifrado a propósito. Se escribe y se borra siempre junto con edp_numero_cuenta (constraint edp_cuenta_hmac_pareado).';

-- ─── 5. RPC de onboarding ───────────────────────────────────────────────
-- CREATE OR REPLACE conserva la firma, así que no hace falta DROP (que además
-- dejaría una sobrecarga ambigua en PostgREST si cambiara).
--
-- Sigue siendo SECURITY DEFINER por lo que explica la cabecera de
-- 20260101000500: las inserciones encadenan ids con RETURNING, y bajo RLS un
-- INSERT ... RETURNING aplica también la policy de SELECT a la fila devuelta —
-- policies que solo se satisfacen cuando el grafo ya está completo. Al saltarse
-- la RLS, los chequeos de acá siguen siendo la ÚNICA capa.
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

-- search_path fijo arriba + nada de EXECUTE implícito acá: las dos mitades de
-- endurecer una función SECURITY DEFINER. CREATE OR REPLACE conserva los grants
-- existentes, pero se repiten para que la migración sea autosuficiente si se
-- aplica sobre una base donde la función todavía no existía.
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) TO authenticated;
