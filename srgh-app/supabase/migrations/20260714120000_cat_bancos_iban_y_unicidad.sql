-- El banco de los datos de pago era texto libre: imposible de agrupar para
-- reportes de nómina y propenso a variantes ('BAC', 'BNCR', 'Banco Nacional').
-- Se normaliza a un catálogo global sgrh_cat_bancos con FK desde
-- sgrh_empleado_datos_pago. Cada banco lleva su código de entidad financiera
-- (posiciones 6-8 del IBAN CR: CR + 2 verificadores + 0 + código + cuenta),
-- lo que permite validar que el IBAN digitado pertenezca al banco elegido.
-- Además se agrega la unicidad pendiente de identificación y nº de asegurado
-- CCSS en sgrh_empleados, y se normalizan los IBAN existentes (mayúsculas,
-- sin espacios) para que coincidan con la validación del frontend.
--
-- Toda la migración es convergente: puede re-ejecutarse sobre una base que ya
-- tenga versiones previas del catálogo (consolida alias y nombres viejos).

-- ─── 1. Catálogo global de bancos ─────────────────────────────────────────────
-- Mismo tratamiento que el resto de catálogos globales (sgrh_rls_final.sql):
-- lectura autenticada, escritura con CATALOGOS_WRITE.

CREATE TABLE IF NOT EXISTS public.sgrh_cat_bancos (
  ban_id     serial PRIMARY KEY,
  ban_nombre varchar(80) NOT NULL UNIQUE,
  -- Código de entidad financiera del BCCR (el que viaja dentro del IBAN CR).
  -- NULL para entidades capturadas como texto libre cuyo código se desconoce.
  ban_codigo varchar(3) UNIQUE,
  ban_activo boolean NOT NULL DEFAULT true
);

-- Si la tabla existe de una versión previa sin código, se le agrega.
ALTER TABLE public.sgrh_cat_bancos
  ADD COLUMN IF NOT EXISTS ban_codigo varchar(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sgrh_cat_bancos_ban_codigo_key'
  ) THEN
    ALTER TABLE public.sgrh_cat_bancos
      ADD CONSTRAINT sgrh_cat_bancos_ban_codigo_key UNIQUE (ban_codigo);
  END IF;
END;
$$;

ALTER TABLE public.sgrh_cat_bancos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_select" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_select" ON public.sgrh_cat_bancos
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cat_insert" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_insert" ON public.sgrh_cat_bancos
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_update" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_update" ON public.sgrh_cat_bancos
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_delete" ON public.sgrh_cat_bancos;
CREATE POLICY "cat_delete" ON public.sgrh_cat_bancos
  FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

-- Seed: un solo nombre estándar por entidad + su código IBAN. Solo entidades
-- con código verificado; las demás se agregan desde configuración
-- (CATALOGOS_WRITE) cuando hagan falta.
INSERT INTO public.sgrh_cat_bancos (ban_nombre, ban_codigo) VALUES
  ('Banco Nacional',      '151'),
  ('Banco de Costa Rica', '152'),
  ('BAC Credomatic',      '102'),
  ('Banco Popular',       '161'),
  ('Scotiabank',          '123'),
  ('Davivienda',          '115'),
  ('Banco Promerica',     '114'),
  ('Banco Lafise',        '121'),
  ('Banco Cathay',        '118'),
  ('Banco BCT',           '107'),
  ('Banco Improsa',       '108')
ON CONFLICT (ban_nombre) DO UPDATE SET ban_codigo = EXCLUDED.ban_codigo;

-- ─── 2. FK de banco en datos de pago + migración del texto libre ─────────────

ALTER TABLE public.sgrh_empleado_datos_pago
  ADD COLUMN IF NOT EXISTS edp_banco_id int REFERENCES public.sgrh_cat_bancos(ban_id);

-- Guardado tras un chequeo de existencia de columna para que la migración sea
-- re-ejecutable después del DROP (idempotencia, igual que la migración previa).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sgrh_empleado_datos_pago'
      AND column_name = 'edp_banco'
  ) THEN
    -- Bancos ya capturados como texto que no matchean el catálogo: se
    -- incorporan (sin código) en vez de perderse; los alias conocidos se
    -- consolidan en el paso 3.
    INSERT INTO public.sgrh_cat_bancos (ban_nombre)
    SELECT DISTINCT trim(edp_banco)
    FROM public.sgrh_empleado_datos_pago
    WHERE edp_banco IS NOT NULL
      AND trim(edp_banco) <> ''
      AND NOT EXISTS (
        SELECT 1 FROM public.sgrh_cat_bancos b
        WHERE lower(b.ban_nombre) = lower(trim(edp_banco))
      );

    UPDATE public.sgrh_empleado_datos_pago d
    SET edp_banco_id = b.ban_id
    FROM public.sgrh_cat_bancos b
    WHERE d.edp_banco IS NOT NULL
      AND lower(b.ban_nombre) = lower(trim(d.edp_banco));
  END IF;
END;
$$;

ALTER TABLE public.sgrh_empleado_datos_pago
  DROP COLUMN IF EXISTS edp_banco;

-- ─── 3. Consolidación de alias y limpieza del catálogo ────────────────────────
-- Los textos libres históricos ('BCR', 'BNCR', 'BN', nombres largos) se
-- repuntan al nombre estándar y desaparecen del catálogo. Al final se retira
-- cualquier entrada sin código que nadie referencia (residuos de seeds
-- anteriores); las referenciadas sin alias conocido se conservan.

DO $$
DECLARE
  alias_row record;
  v_canonico int;
  v_alias    int;
BEGIN
  FOR alias_row IN
    SELECT * FROM (VALUES
      ('banco nacional de costa rica', 'Banco Nacional'),
      ('bncr',                         'Banco Nacional'),
      ('bn',                           'Banco Nacional'),
      ('bcr',                          'Banco de Costa Rica'),
      ('bac',                          'BAC Credomatic'),
      ('bac san josé',                 'BAC Credomatic'),
      ('banco popular y de desarrollo comunal', 'Banco Popular'),
      ('scotiabank de costa rica',     'Scotiabank'),
      ('banco davivienda',             'Davivienda')
    ) AS a(alias, canonico)
  LOOP
    SELECT ban_id INTO v_alias
    FROM public.sgrh_cat_bancos WHERE lower(ban_nombre) = alias_row.alias;
    SELECT ban_id INTO v_canonico
    FROM public.sgrh_cat_bancos WHERE ban_nombre = alias_row.canonico;

    IF v_alias IS NOT NULL AND v_canonico IS NOT NULL AND v_alias <> v_canonico THEN
      UPDATE public.sgrh_empleado_datos_pago
      SET edp_banco_id = v_canonico
      WHERE edp_banco_id = v_alias;

      DELETE FROM public.sgrh_cat_bancos WHERE ban_id = v_alias;
    END IF;
  END LOOP;
END;
$$;

DELETE FROM public.sgrh_cat_bancos b
WHERE b.ban_codigo IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_empleado_datos_pago d
    WHERE d.edp_banco_id = b.ban_id
  );

-- ─── 4. Normalización de IBAN existentes ──────────────────────────────────────
-- El frontend guarda y valida el número en mayúsculas y sin espacios; los
-- datos históricos se alinean. No se agrega CHECK en DB: hay datos legados que
-- no son IBAN y romperían la migración; la validación fuerte vive en el
-- formulario y en el RPC.

UPDATE public.sgrh_empleado_datos_pago
SET edp_numero_cuenta = upper(regexp_replace(edp_numero_cuenta, '\s', '', 'g'))
WHERE edp_numero_cuenta IS NOT NULL
  AND edp_numero_cuenta <> upper(regexp_replace(edp_numero_cuenta, '\s', '', 'g'));

-- ─── 5. Unicidad pendiente en sgrh_empleados ──────────────────────────────────
-- La identificación y el nº de asegurado CCSS identifican a UNA persona; solo
-- el email personal tenía UNIQUE. Los NULL no chocan entre sí (semántica de
-- UNIQUE en Postgres), así que CCSS sigue siendo opcional.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sgrh_empleados_emp_numero_identificacion_key'
  ) THEN
    ALTER TABLE public.sgrh_empleados
      ADD CONSTRAINT sgrh_empleados_emp_numero_identificacion_key
      UNIQUE (emp_numero_identificacion);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sgrh_empleados_emp_numero_asegurado_ccss_key'
  ) THEN
    ALTER TABLE public.sgrh_empleados
      ADD CONSTRAINT sgrh_empleados_emp_numero_asegurado_ccss_key
      UNIQUE (emp_numero_asegurado_ccss);
  END IF;
END;
$$;

-- ─── 6. RPC de onboarding: banco por FK + coherencia del número de cuenta ─────
-- Misma firma y mismas garantías que la versión anterior (permiso interno,
-- empresa SOLO del JWT, catálogos validados, extracción explícita del jsonb).
-- Cambios: edp_banco (texto) → edp_banco_id (FK validada), y el número de
-- cuenta se valida según el tipo: SINPE Móvil = teléfono de 8 dígitos; resto =
-- IBAN CR cuyo código de entidad debe coincidir con el banco seleccionado.

CREATE OR REPLACE FUNCTION public.crear_empleado_completo(
  p_empleado     jsonb,
  p_contratacion jsonb,
  p_datos_pago   jsonb DEFAULT NULL
)
RETURNS int AS $$
DECLARE
  v_empresa_id int;
  v_emp_id     int;
  v_banco_id   int;
  v_ban_codigo varchar(3);
  v_cuenta     text;
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

-- CREATE OR REPLACE conserva los grants, pero se re-declaran para que la
-- migración sea autosuficiente si se aplica sobre una base limpia.
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb) TO authenticated;