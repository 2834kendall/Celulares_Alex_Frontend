-- Dirección estructurada para empleados (y normalización de las que ya existían
-- como columnas sueltas en empresas y sucursales).
--
-- Hasta ahora el expediente del empleado no guardaba dirección, y empresas y
-- sucursales la guardaban como dos columnas inline (*_distrito_id +
-- *_direccion_exacta). Se unifica todo en una tabla genérica sgrh_direcciones a
-- la que apuntan las tres entidades: una sola forma de guardar una dirección, un
-- solo lugar donde validar el código postal.
--
-- La dirección es PADRE del empleado (el FK sale de sgrh_empleados), no hijo como
-- sgrh_empleado_datos_pago. Eso es lo que permite que emp_direccion_id llegue a
-- ser NOT NULL y obliga a la RPC a insertar la dirección antes que el empleado.
--
-- Provincia y cantón NO se guardan: se derivan por la cadena de FKs desde
-- dir_distrito_id. Guardarlos permitiría estados incoherentes (un distrito que no
-- pertenece al cantón elegido). En la UI son solo estado de cascada.
--
-- Idempotente, como el resto de migraciones del proyecto.

-- ─── 1. Tabla genérica de direcciones ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_direcciones (
  dir_id            serial PRIMARY KEY,
  dir_distrito_id   int NOT NULL REFERENCES public.sgrh_cat_distritos(dis_id),
  -- Redundante con dis_codigo por diseño: se materializa para reportes y exports
  -- sin obligar al join de tres niveles. El DEFAULT existe solo para que quien
  -- inserta pueda omitir la columna; el trigger de abajo siempre la sobreescribe.
  dir_codigo_postal varchar(5) NOT NULL DEFAULT '',
  dir_senas_exactas varchar(300),
  dir_created_at    timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Código postal derivado del distrito ───────────────────────────────────
-- En Costa Rica el código de distrito de 5 dígitos (PCCDD) ES el código postal,
-- así que nunca se acepta el que mande el cliente: se recalcula siempre. Se
-- dispara en INSERT y en cualquier UPDATE (no solo al cambiar el distrito) para
-- que tampoco se pueda escribir un postal incoherente a mano.

CREATE OR REPLACE FUNCTION public.sgrh_set_codigo_postal()
RETURNS trigger AS $$
BEGIN
  SELECT dis_codigo INTO NEW.dir_codigo_postal
  FROM public.sgrh_cat_distritos
  WHERE dis_id = NEW.dir_distrito_id;

  -- El FK también lo rechazaría, pero el trigger corre antes y sin esto el error
  -- sería un NOT NULL confuso en vez del 23503 que la UI ya sabe interpretar.
  IF NEW.dir_codigo_postal IS NULL THEN
    RAISE EXCEPTION 'Distrito inexistente: %', NEW.dir_distrito_id
      USING ERRCODE = '23503'; -- foreign_key_violation
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_direcciones_codigo_postal ON public.sgrh_direcciones;
CREATE TRIGGER trg_direcciones_codigo_postal
  BEFORE INSERT OR UPDATE ON public.sgrh_direcciones
  FOR EACH ROW EXECUTE FUNCTION public.sgrh_set_codigo_postal();

-- ─── 3. Referencias desde las entidades que tienen dirección ──────────────────
-- Las tres columnas se agregan ANTES de las policies: la de SELECT las menciona,
-- y CREATE POLICY falla si una columna del predicado todavía no existe.
--
-- emp_direccion_id nace NULLABLE a propósito. El estado final es obligatoria, pero
-- el wizard todavía no manda dirección: ponerle NOT NULL aquí rompería el alta de
-- empleados entre esta migración y la de la interfaz. El NOT NULL se aplica en una
-- migración corta al cerrar la etapa de UI.
--
-- En empresas y sucursales quedan nullable de forma definitiva: no se pidió que la
-- dirección fuera obligatoria en esas dos.

ALTER TABLE public.sgrh_empleados
  ADD COLUMN IF NOT EXISTS emp_direccion_id int REFERENCES public.sgrh_direcciones(dir_id);

ALTER TABLE public.sgrh_empresas
  ADD COLUMN IF NOT EXISTS org_direccion_id int REFERENCES public.sgrh_direcciones(dir_id);

ALTER TABLE public.sgrh_sucursales
  ADD COLUMN IF NOT EXISTS suc_direccion_id int REFERENCES public.sgrh_direcciones(dir_id);

-- La policy de SELECT filtra direcciones por los empleados que las referencian.
CREATE INDEX IF NOT EXISTS sgrh_empleados_emp_direccion_id_idx
  ON public.sgrh_empleados (emp_direccion_id);

-- ─── 4. Policies ──────────────────────────────────────────────────────────────
-- Una dirección es visible si la referencia una entidad que el usuario ya puede
-- ver: su propio expediente, un empleado de su empresa, su empresa o una de sus
-- sucursales. El chequeo multi-tenant va explícito vía sgrh_historial_laboral
-- (mismo idiom que empleados_select) en vez de apoyarse en la RLS anidada de las
-- tablas referenciadas.

ALTER TABLE public.sgrh_direcciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "direcciones_select" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_select" ON public.sgrh_direcciones
  FOR SELECT TO authenticated
  USING (
    dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL AND (
        emp_id = (SELECT public.get_emp_id())
        OR (
          (SELECT public.tiene_permiso('EMPLEADOS_READ'))
          AND emp_id IN (
            SELECT lab_empleado_id FROM public.sgrh_historial_laboral
            WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          )
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

-- En el INSERT la fila todavía no la referencia nadie, así que no hay pertenencia
-- que verificar: se gatea solo por permiso. Mismo compromiso consciente que
-- empleados_insert. El alta real pasa por la RPC (SECURITY DEFINER), donde la
-- dirección y el empleado se crean en la misma transacción.
DROP POLICY IF EXISTS "direcciones_insert" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_insert" ON public.sgrh_direcciones
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    OR (SELECT public.tiene_permiso('EMPRESAS_WRITE'))
  );

DROP POLICY IF EXISTS "direcciones_update" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_update" ON public.sgrh_direcciones
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    AND dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL
        AND emp_id IN (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral
          WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        )
    )
  )
  WITH CHECK (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    AND dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL
        AND emp_id IN (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral
          WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        )
    )
  );

DROP POLICY IF EXISTS "direcciones_delete" ON public.sgrh_direcciones;
CREATE POLICY "direcciones_delete" ON public.sgrh_direcciones
  FOR DELETE TO authenticated
  USING (
    (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    AND dir_id IN (
      SELECT emp_direccion_id FROM public.sgrh_empleados
      WHERE emp_direccion_id IS NOT NULL
        AND emp_id IN (
          SELECT lab_empleado_id FROM public.sgrh_historial_laboral
          WHERE lab_empresa_id = (SELECT public.get_empresa_id())
        )
    )
  );

-- ─── 5. Backfill de empleados existentes ──────────────────────────────────────
-- Entorno de desarrollo: los empleados ya cargados reciben una dirección aleatoria
-- para poder exigir la columna más adelante sin migración de datos manual. Las
-- señas quedan marcadas como generadas para poder ubicarlas y depurarlas antes de
-- producción:
--   SELECT * FROM sgrh_direcciones WHERE dir_senas_exactas LIKE '[DEV]%';
--
-- El WHERE ... IS NULL hace que re-ejecutar la migración no cree más filas.
-- Se recorre fila por fila en vez de con un INSERT masivo + row_number: emparejar
-- por número de fila depende de que el orden de inserción coincida con el orden de
-- lectura, algo que el planificador no garantiza. Son pocos registros y así la
-- dirección que se asigna a cada empleado es inequívoca.

DO $$
DECLARE
  r        record;
  v_dir_id int;
BEGIN
  FOR r IN
    SELECT emp_id FROM public.sgrh_empleados
    WHERE emp_direccion_id IS NULL
    ORDER BY emp_id
  LOOP
    -- El filtro por largo es defensivo: la migración de convergencia ya dejó solo
    -- códigos del IGN, pero si por lo que sea quedara una fila con otro formato,
    -- su código no cabría en dir_codigo_postal (varchar(5)) y reventaría el alta.
    INSERT INTO public.sgrh_direcciones (dir_distrito_id, dir_senas_exactas)
    SELECT dis_id, '[DEV] Dirección generada automáticamente'
    FROM public.sgrh_cat_distritos
    WHERE length(dis_codigo) = 5
    ORDER BY random()
    LIMIT 1
    RETURNING dir_id INTO v_dir_id;

    UPDATE public.sgrh_empleados
    SET emp_direccion_id = v_dir_id
    WHERE emp_id = r.emp_id;
  END LOOP;
END;
$$;

-- ─── 6. Normalización de empresas y sucursales ────────────────────────────────
-- Ambas ya guardaban dirección como dos columnas inline (*_distrito_id +
-- *_direccion_exacta). Sus columnas de referencia se crearon en la sección 3; aquí
-- se mueven los datos y se retiran las viejas, para que exista una sola
-- representación de "dirección" en todo el esquema. Ninguna de las columnas
-- retiradas tiene consumidores en src/ (solo aparecían en database.types.ts), así
-- que el cambio no rompe código.

-- Migración de datos, guardada tras un chequeo de existencia de la columna vieja
-- para que la migración siga siendo re-ejecutable después del DROP. Aquí el
-- recorrido fila por fila no es una preferencia de estilo: cada entidad tiene que
-- quedarse con SU dirección, y un INSERT masivo emparejado por número de fila no
-- garantiza esa correspondencia.
--
-- Se usa SQL dinámico porque el bloque tiene que compilar aunque las columnas
-- viejas ya no existan (al re-ejecutar la migración): plpgsql resuelve los
-- nombres al ejecutar, no al entrar en la rama del IF.
DO $$
DECLARE
  r        record;
  v_dir_id int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sgrh_empresas'
      AND column_name = 'org_distrito_id'
  ) THEN
    FOR r IN EXECUTE
      'SELECT org_id, org_distrito_id, org_direccion_exacta
       FROM public.sgrh_empresas
       WHERE org_direccion_id IS NULL AND org_distrito_id IS NOT NULL
       ORDER BY org_id'
    LOOP
      INSERT INTO public.sgrh_direcciones (dir_distrito_id, dir_senas_exactas)
      VALUES (r.org_distrito_id, left(r.org_direccion_exacta, 300))
      RETURNING dir_id INTO v_dir_id;

      UPDATE public.sgrh_empresas
      SET org_direccion_id = v_dir_id
      WHERE org_id = r.org_id;
    END LOOP;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sgrh_sucursales'
      AND column_name = 'suc_distrito_id'
  ) THEN
    FOR r IN EXECUTE
      'SELECT suc_id, suc_distrito_id, suc_direccion_exacta
       FROM public.sgrh_sucursales
       WHERE suc_direccion_id IS NULL AND suc_distrito_id IS NOT NULL
       ORDER BY suc_id'
    LOOP
      INSERT INTO public.sgrh_direcciones (dir_distrito_id, dir_senas_exactas)
      VALUES (r.suc_distrito_id, left(r.suc_direccion_exacta, 300))
      RETURNING dir_id INTO v_dir_id;

      UPDATE public.sgrh_sucursales
      SET suc_direccion_id = v_dir_id
      WHERE suc_id = r.suc_id;
    END LOOP;
  END IF;
END;
$$;

ALTER TABLE public.sgrh_empresas
  DROP COLUMN IF EXISTS org_distrito_id,
  DROP COLUMN IF EXISTS org_direccion_exacta;

ALTER TABLE public.sgrh_sucursales
  DROP COLUMN IF EXISTS suc_distrito_id,
  DROP COLUMN IF EXISTS suc_direccion_exacta;

-- ─── 7. RPC de onboarding: + dirección ────────────────────────────────────────
-- Mismas garantías que la versión anterior (permiso interno, empresa SOLO del
-- JWT, catálogos validados, extracción explícita del jsonb). Cambio: cuarto
-- parámetro p_direccion, que se inserta ANTES del empleado porque el FK sale de
-- sgrh_empleados.
--
-- OJO: agregar un parámetro NO es un reemplazo. CREATE OR REPLACE crearía una
-- función nueva y dejaría viva la de 3 argumentos → sobrecarga ambigua en
-- PostgREST. Hay que borrar la firma vieja explícitamente.

DROP FUNCTION IF EXISTS public.crear_empleado_completo(jsonb, jsonb, jsonb);

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

  -- La dirección se crea primero: el FK vive en sgrh_empleados. Sigue siendo
  -- opcional mientras emp_direccion_id sea nullable (ver sección 4).
  IF p_direccion IS NOT NULL AND p_direccion->>'dir_distrito_id' IS NOT NULL THEN
    v_distrito_id := (p_direccion->>'dir_distrito_id')::int;

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
  END IF;

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

-- Igual que el resto de funciones del sistema: nada de EXECUTE implícito.
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.crear_empleado_completo(jsonb, jsonb, jsonb, jsonb) TO authenticated;
