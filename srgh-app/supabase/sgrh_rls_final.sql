-- =====================================================================
-- SGRH - SUPABASE MASTER SECURITY & CONFIGURATION SCRIPT
-- =====================================================================
-- Este script es completamente IDEMPOTENTE y seguro de ejecutar
-- múltiples veces tanto en desarrollo como en producción (migraciones).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ESQUEMAS Y LIMPIEZA DE OBJETOS DESPLAZADOS/DUPLICADOS
-- ---------------------------------------------------------------------
-- Crear esquema para funciones privadas/administrativas no expuestas por la API PostgREST
CREATE SCHEMA IF NOT EXISTS sgrh_private;

-- Eliminar la función antigua en el esquema público para evitar su exposición a la API REST (PostgREST)
DROP FUNCTION IF EXISTS public.asignar_permisos(text, text[]);

-- Eliminar índice duplicado detectado en public.sgrh_historial_laboral
DROP INDEX IF EXISTS public.idx_sgrh_his_lab_empleado;

-- ---------------------------------------------------------------------
-- 2. FUNCIONES BASE (HELPERS & HOOKS)
-- ---------------------------------------------------------------------

-- Hook para inyectar claims personalizados dentro de app_metadata en el JWT de forma segura
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims         jsonb;
  v_app_metadata jsonb;
  v_rol          text;
  v_empresa      int;
  v_usr_id       int;
  v_emp_id       int;
  v_permisos     text[];
  v_user_id_raw  text;
BEGIN
  -- 1. Asegurar que event no sea nulo
  IF event IS NULL THEN
    RETURN '{"claims":{}}'::jsonb;
  END IF;

  -- 2. Asegurar que event->'claims' sea siempre un objeto JSON válido (nunca null ni escalar)
  IF event->'claims' IS NULL OR jsonb_typeof(event->'claims') <> 'object' THEN
    event := jsonb_set(event, '{claims}', '{}'::jsonb);
  END IF;

  -- 3. Validar user_id de forma segura
  v_user_id_raw := event->>'user_id';
  IF v_user_id_raw IS NULL THEN
    RETURN event;
  END IF;

  -- 4. Bloque seguro para evitar caídas catastróficas en el login
  BEGIN
    -- Obtener usr_id y emp_id desde usr_auth_id
    SELECT usr_id, usr_empleado_id
    INTO v_usr_id, v_emp_id
    FROM public.sgrh_usuarios
    WHERE usr_auth_id = v_user_id_raw::uuid;

    -- Si el usuario no existe en la base de datos de negocio, retornar sin claims extras
    IF v_usr_id IS NULL THEN
      RETURN event;
    END IF;

    -- Rol y empresa activos del usuario
    SELECT r.rol_codigo, uer.uer_empresa_id
    INTO v_rol, v_empresa
    FROM public.sgrh_usuarios_empresa_rol uer
    JOIN public.sgrh_cat_roles r ON r.rol_id = uer.uer_rol_id
    WHERE uer.uer_usuario_id = v_usr_id
      AND uer.uer_activo = true
    LIMIT 1;

    -- Lista de códigos de permisos asignados al rol activo
    SELECT ARRAY_AGG(p.per_codigo)
    INTO v_permisos
    FROM public.sgrh_rol_permisos rp
    JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
    JOIN public.sgrh_cat_roles r    ON r.rol_id = rp.rpe_rol_id
    WHERE r.rol_codigo = v_rol;

    claims := event->'claims';
    
    -- Obtener app_metadata existente u objeto vacío
    v_app_metadata := coalesce(claims->'app_metadata', '{}'::jsonb);
    
    -- Guardar claims de negocio dentro de app_metadata para alineación con session.user en Next.js
    -- Se protege cada to_jsonb con coalesce para evitar que retorne NULL de base de datos (lo que anularía todo jsonb_set)
    v_app_metadata := jsonb_set(v_app_metadata, '{usr_id}',
                        coalesce(to_jsonb(v_usr_id), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{emp_id}',
                        coalesce(to_jsonb(v_emp_id), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{rol}',
                        to_jsonb(coalesce(v_rol, 'SIN_ROL')));
    v_app_metadata := jsonb_set(v_app_metadata, '{empresa_id}',
                        coalesce(to_jsonb(v_empresa), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{permisos}',
                        to_jsonb(coalesce(v_permisos, '{}'::text[])));
    
    claims := jsonb_set(claims, '{app_metadata}', v_app_metadata);

    RETURN jsonb_set(event, '{claims}', claims);
  EXCEPTION WHEN OTHERS THEN
    -- En caso de error imprevisto, retornar el evento original intacto para no bloquear el inicio de sesión
    RETURN event;
  END;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public;

-- Helpers optimizados (SECURITY INVOKER) para leer claims del JWT en las policies RLS
CREATE OR REPLACE FUNCTION public.get_rol()
RETURNS text AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'rol');
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'empresa_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_usr_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'usr_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_emp_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'emp_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

-- Validador de permisos en memoria de JWT (Optimizada y segura ante nulos o no-arrays)
CREATE OR REPLACE FUNCTION public.tiene_permiso(p_codigo text)
RETURNS boolean AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' -> 'permisos') @> to_jsonb(p_codigo),
    false
  );
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

-- Helper administrativo privado para asignar permisos
CREATE OR REPLACE FUNCTION sgrh_private.asignar_permisos(p_rol_codigo text, p_permisos text[])
RETURNS void AS $$
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT r.rol_id, p.per_id
  FROM public.sgrh_cat_roles r
  CROSS JOIN public.sgrh_cat_permisos p
  WHERE r.rol_codigo = p_rol_codigo
    AND p.per_codigo = ANY(p_permisos)
  ON CONFLICT DO NOTHING;
$$ LANGUAGE sql SECURITY DEFINER SET search_path = public;

-- Trigger para autocreación de usuarios vinculados a Auth (Manejo seguro de conflictos de correo)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.sgrh_usuarios (usr_auth_id, usr_email, usr_password_hash, usr_activo)
  VALUES (NEW.id, NEW.email, '', true)
  ON CONFLICT (usr_email) DO UPDATE
  SET usr_auth_id = EXCLUDED.usr_auth_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ---------------------------------------------------------------------
-- 3. ASOCIAR TRIGGERS E INTEGRACIONES
-- ---------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- ---------------------------------------------------------------------
-- 4. GRANTS Y ACCESOS DE SISTEMA
-- ---------------------------------------------------------------------
-- Otorgar accesos al servicio de autenticación de Supabase (Admin Hook)
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;

GRANT
SELECT ON public.sgrh_usuarios TO supabase_auth_admin;

GRANT
SELECT ON public.sgrh_usuarios_empresa_rol TO supabase_auth_admin;

GRANT
SELECT ON public.sgrh_cat_roles TO supabase_auth_admin;

GRANT
SELECT ON public.sgrh_rol_permisos TO supabase_auth_admin;

GRANT
SELECT ON public.sgrh_cat_permisos TO supabase_auth_admin;

-- Revocar permisos de ejecución por defecto a PUBLIC de manera explícita
REVOKE
EXECUTE ON FUNCTION public.handle_new_auth_user ()
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.custom_access_token_hook (jsonb)
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.get_rol ()
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.get_empresa_id ()
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.get_usr_id ()
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.get_emp_id ()
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.tiene_permiso (text)
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION sgrh_private.asignar_permisos (text, text [])
FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. HABILITAR ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------
-- Habilita RLS de forma dinámica en todas las tablas con prefijo sgrh_
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'sgrh_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- 6. LIMPIEZA DE POLÍTICAS PREVIAS (Para Re-ejecución)
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t   text;
  pol text;
  policies text[] := ARRAY[
    -- Catálogos (Nuevas y Legadas)
    'cat_select','cat_write','cat_insert','cat_update','cat_delete',
    -- Empresas
    'empresas_select','empresas_write','empresas_insert','empresas_update','empresas_delete',
    -- Sucursales
    'sucursales_select','sucursales_write','sucursales_insert','sucursales_update','sucursales_delete',
    -- Usuarios
    'usuarios_select','usuarios_write','usuarios_insert','usuarios_update','usuarios_delete',
    -- Uer
    'uer_select','uer_write','uer_insert','uer_update','uer_delete',
    -- Horarios
    'horarios_select','horarios_write','horarios_insert','horarios_update','horarios_delete',
    -- Puestos
    'puestos_select','puestos_write','puestos_insert','puestos_update','puestos_delete',
    -- Niveles comisión
    'niveles_comision_select','niveles_comision_write','niveles_comision_insert','niveles_comision_update','niveles_comision_delete',
    -- Feriados
    'feriados_select','feriados_write','feriados_insert','feriados_update','feriados_delete',
    -- Empleados
    'empleados_select','empleados_write','empleados_insert','empleados_update','empleados_delete',
    -- Historial
    'historial_select','historial_write','historial_insert','historial_update','historial_delete',
    -- Marcas
    'marcas_select','marcas_insert','marcas_update','marcas_delete',
    -- Programación
    'programacion_select','programacion_write','programacion_insert','programacion_update','programacion_delete',
    -- Ausencias
    'ausencias_select','ausencias_insert','ausencias_update','ausencias_delete',
    -- Nómina Periodo
    'nomina_periodo_all','nomina_periodo_select','nomina_periodo_insert','nomina_periodo_update','nomina_periodo_delete',
    -- Nómina Detalle
    'nomina_detalle_select','nomina_detalle_write','nomina_detalle_insert','nomina_detalle_update','nomina_detalle_delete',
    -- Nómina Líneas (Ingreso/Deducción/Patronal)
    'nomina_lineas_ingreso','nomina_lineas_ingreso_select','nomina_lineas_ingreso_insert','nomina_lineas_ingreso_update','nomina_lineas_ingreso_delete',
    'nomina_lineas_deduccion','nomina_lineas_deduccion_select','nomina_lineas_deduccion_insert','nomina_lineas_deduccion_update','nomina_lineas_deduccion_delete',
    'nomina_lineas_patronal','nomina_lineas_patronal_select','nomina_lineas_patronal_insert','nomina_lineas_patronal_update','nomina_lineas_patronal_delete',
    -- Comprobantes
    'comprobantes_select','comprobantes_write','comprobantes_insert','comprobantes_update','comprobantes_delete',
    -- Beneficios
    'beneficios_all','beneficios_select','beneficios_insert','beneficios_update','beneficios_delete',
    -- Provisiones
    'provisiones_select','provisiones_write','provisiones_insert','provisiones_update','provisiones_delete',
    -- Comisiones
    'comisiones_all','comisiones_select','comisiones_insert','comisiones_update','comisiones_delete',
    -- Notificaciones
    'notificaciones_select','notificaciones_write','notificaciones_insert','notificaciones_update','notificaciones_delete',
    -- Candidatos
    'candidatos_all','candidatos_select','candidatos_insert','candidatos_update','candidatos_delete',
    -- Postulaciones
    'postulaciones_all','postulaciones_select','postulaciones_insert','postulaciones_update','postulaciones_delete',
    -- Postulación Etapas
    'postulacion_etapas_all','postulacion_etapas_select','postulacion_etapas_insert','postulacion_etapas_update','postulacion_etapas_delete',
    -- Evaluaciones
    'evaluaciones_select','evaluaciones_write','evaluaciones_insert','evaluaciones_update','evaluaciones_delete',
    -- Eval Resultados
    'eval_resultados_all','eval_resultados_select','eval_resultados_insert','eval_resultados_update','eval_resultados_delete'
  ];
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename LIKE 'sgrh_%'
  LOOP
    FOREACH pol IN ARRAY policies LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, t);
    END LOOP;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------
-- 7. CREACIÓN DE NUEVAS POLÍTICAS OPTIMIZADAS
-- ---------------------------------------------------------------------

-- Catálogos Globales (Lectura autenticada, Escritura administrador)
DO $$
DECLARE
  t text;
  catalogos text[] := ARRAY[
    'sgrh_cat_areas_evaluacion','sgrh_cat_conceptos_nomina',
    'sgrh_cat_criterios_evaluacion','sgrh_cat_etapas_seleccion',
    'sgrh_cat_motivos_salida','sgrh_cat_permisos','sgrh_cat_provincias',
    'sgrh_cat_cantones','sgrh_cat_distritos','sgrh_cat_roles',
    'sgrh_cat_tipos_ausencia','sgrh_cat_tipos_contrato',
    'sgrh_cat_tipos_identificacion','sgrh_cat_tipos_jornada','sgrh_rol_permisos'
  ];
BEGIN
  FOREACH t IN ARRAY catalogos LOOP
    EXECUTE format(
      'CREATE POLICY "cat_select" ON public.%I
       FOR SELECT
       TO authenticated
       USING (true)', t);
    EXECUTE format(
      'CREATE POLICY "cat_insert" ON public.%I
       FOR INSERT
       TO authenticated
       WITH CHECK ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
    EXECUTE format(
      'CREATE POLICY "cat_update" ON public.%I
       FOR UPDATE
       TO authenticated
       USING ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))
       WITH CHECK ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
    EXECUTE format(
      'CREATE POLICY "cat_delete" ON public.%I
       FOR DELETE
       TO authenticated
       USING ((SELECT public.tiene_permiso(''CATALOGOS_WRITE'')))', t);
  END LOOP;
END;
$$;

-- Empresas y Sucursales (Aislamiento tenant con wrapping para cache)
CREATE POLICY "empresas_select" ON public.sgrh_empresas FOR
SELECT TO authenticated USING (
        org_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "empresas_insert" ON public.sgrh_empresas FOR INSERT TO authenticated
WITH
    CHECK (
        org_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "empresas_update" ON public.sgrh_empresas
FOR UPDATE
    TO authenticated USING (
        org_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    )
WITH
    CHECK (
        org_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "empresas_delete" ON public.sgrh_empresas FOR DELETE TO authenticated USING (
    org_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('EMPRESAS_WRITE')
    )
);

CREATE POLICY "sucursales_select" ON public.sgrh_sucursales FOR
SELECT TO authenticated USING (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "sucursales_insert" ON public.sgrh_sucursales FOR INSERT TO authenticated
WITH
    CHECK (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "sucursales_update" ON public.sgrh_sucursales
FOR UPDATE
    TO authenticated USING (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    )
WITH
    CHECK (
        suc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EMPRESAS_WRITE')
        )
    );

CREATE POLICY "sucursales_delete" ON public.sgrh_sucursales FOR DELETE TO authenticated USING (
    suc_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('EMPRESAS_WRITE')
    )
);

-- Empleados (Lectura de sucursal/empresa o datos propios)
CREATE POLICY "empleados_select" ON public.sgrh_empleados FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('EMPLEADOS_READ')
            )
            AND emp_id IN (
                SELECT lab_empleado_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        OR emp_id = (
            SELECT public.get_emp_id ()
        )
    );

CREATE POLICY "empleados_insert" ON public.sgrh_empleados FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
        )
    );

CREATE POLICY "empleados_update" ON public.sgrh_empleados
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
        )
        AND emp_id IN (
            SELECT lab_empleado_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
        )
        AND emp_id IN (
            SELECT lab_empleado_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "empleados_delete" ON public.sgrh_empleados FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('EMPLEADOS_WRITE')
    )
    AND emp_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Ausencias (Operaciones segregadas y protección WITH CHECK)
CREATE POLICY "ausencias_select" ON public.sgrh_ausencias FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('AUSENCIAS_READ')
            )
            AND aus_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        OR aus_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
    );

CREATE POLICY "ausencias_insert" ON public.sgrh_ausencias FOR INSERT TO authenticated
WITH
    CHECK (
        (
            aus_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empleado_id = (
                        SELECT public.get_emp_id ()
                    )
                    AND lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        OR (
            SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
        )
    );

CREATE POLICY "ausencias_update" ON public.sgrh_ausencias
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
        )
        AND aus_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
        )
        AND aus_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "ausencias_delete" ON public.sgrh_ausencias FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('AUSENCIAS_APPROVE')
    )
    AND aus_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Marcas de asistencia (Aislamiento tenant y propiedad)
CREATE POLICY "marcas_select" ON public.sgrh_marcas_asistencia FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('ASISTENCIA_READ')
            )
            AND mar_sucursal_id IN (
                SELECT suc_id
                FROM public.sgrh_sucursales
                WHERE
                    suc_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        OR mar_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
    );

CREATE POLICY "marcas_insert" ON public.sgrh_marcas_asistencia FOR INSERT TO authenticated
WITH
    CHECK (
        (
            mar_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empleado_id = (
                        SELECT public.get_emp_id ()
                    )
                    AND lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        OR (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
    );

CREATE POLICY "marcas_update" ON public.sgrh_marcas_asistencia
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND mar_sucursal_id IN (
            SELECT suc_id
            FROM public.sgrh_sucursales
            WHERE
                suc_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND mar_sucursal_id IN (
            SELECT suc_id
            FROM public.sgrh_sucursales
            WHERE
                suc_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "marcas_delete" ON public.sgrh_marcas_asistencia FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
    )
    AND mar_sucursal_id IN (
        SELECT suc_id
        FROM public.sgrh_sucursales
        WHERE
            suc_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Nómina Periodo (Segregando FOR ALL a políticas individuales)
CREATE POLICY "nomina_periodo_select" ON public.sgrh_nomina_periodo FOR
SELECT TO authenticated USING (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('NOMINA_READ')
        )
    );

CREATE POLICY "nomina_periodo_insert" ON public.sgrh_nomina_periodo FOR INSERT TO authenticated
WITH
    CHECK (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
    );

CREATE POLICY "nomina_periodo_update" ON public.sgrh_nomina_periodo
FOR UPDATE
    TO authenticated USING (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
    )
WITH
    CHECK (
        npe_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
    );

CREATE POLICY "nomina_periodo_delete" ON public.sgrh_nomina_periodo FOR DELETE TO authenticated USING (
    npe_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
);

-- Nómina Detalle
CREATE POLICY "nomina_detalle_select" ON public.sgrh_nomina_detalle FOR
SELECT TO authenticated USING (
        (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
        OR ndt_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
    );

CREATE POLICY "nomina_detalle_insert" ON public.sgrh_nomina_detalle FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ndt_nomina_periodo_id IN (
            SELECT npe_id
            FROM public.sgrh_nomina_periodo
            WHERE
                npe_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "nomina_detalle_update" ON public.sgrh_nomina_detalle
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ndt_nomina_periodo_id IN (
            SELECT npe_id
            FROM public.sgrh_nomina_periodo
            WHERE
                npe_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ndt_nomina_periodo_id IN (
            SELECT npe_id
            FROM public.sgrh_nomina_periodo
            WHERE
                npe_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "nomina_detalle_delete" ON public.sgrh_nomina_detalle FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ndt_nomina_periodo_id IN (
        SELECT npe_id
        FROM public.sgrh_nomina_periodo
        WHERE
            npe_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- ---------------------------------------------------------------------
-- MÓDULOS ADICIONALES (POLÍTICAS FALTANTES)
-- ---------------------------------------------------------------------

-- Usuarios (Perfiles de usuario)
CREATE POLICY "usuarios_select" ON public.sgrh_usuarios FOR
SELECT TO authenticated USING (
        usr_auth_id = (
            SELECT auth.uid ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    );

CREATE POLICY "usuarios_insert" ON public.sgrh_usuarios FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    );

CREATE POLICY "usuarios_update" ON public.sgrh_usuarios
FOR UPDATE
    TO authenticated USING (
        usr_auth_id = (
            SELECT auth.uid ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    )
WITH
    CHECK (
        usr_auth_id = (
            SELECT auth.uid ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
    );

CREATE POLICY "usuarios_delete" ON public.sgrh_usuarios FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('USUARIOS_WRITE')
    )
);

-- Usuarios Empresa Rol (Asociación Tenant-Rol)
CREATE POLICY "uer_select" ON public.sgrh_usuarios_empresa_rol FOR
SELECT TO authenticated USING (
        uer_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
        OR (
            SELECT public.tiene_permiso ('ROLES_WRITE')
        )
    );

CREATE POLICY "uer_insert" ON public.sgrh_usuarios_empresa_rol FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
        OR (
            SELECT public.tiene_permiso ('ROLES_WRITE')
        )
    );

CREATE POLICY "uer_update" ON public.sgrh_usuarios_empresa_rol
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
        OR (
            SELECT public.tiene_permiso ('ROLES_WRITE')
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('USUARIOS_WRITE')
        )
        OR (
            SELECT public.tiene_permiso ('ROLES_WRITE')
        )
    );

CREATE POLICY "uer_delete" ON public.sgrh_usuarios_empresa_rol FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('USUARIOS_WRITE')
    )
    OR (
        SELECT public.tiene_permiso ('ROLES_WRITE')
    )
);

-- Historial Laboral
CREATE POLICY "historial_select" ON public.sgrh_historial_laboral FOR
SELECT TO authenticated USING (
        lab_empleado_id = (
            SELECT public.get_emp_id ()
        )
        OR (
            (
                (
                    SELECT public.tiene_permiso ('HISTORIAL_READ')
                )
                OR (
                    SELECT public.tiene_permiso ('EMPLEADOS_READ')
                )
            )
            AND lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
    );

CREATE POLICY "historial_insert" ON public.sgrh_historial_laboral FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('HISTORIAL_WRITE')
        )
        AND lab_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "historial_update" ON public.sgrh_historial_laboral
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('HISTORIAL_WRITE')
        )
        AND lab_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('HISTORIAL_WRITE')
        )
        AND lab_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "historial_delete" ON public.sgrh_historial_laboral FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('HISTORIAL_WRITE')
    )
    AND lab_empresa_id = (
        SELECT public.get_empresa_id ()
    )
);

-- Horarios por Empresa
CREATE POLICY "horarios_select" ON public.sgrh_cat_horarios FOR
SELECT TO authenticated USING (
        hor_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "horarios_insert" ON public.sgrh_cat_horarios FOR INSERT TO authenticated
WITH
    CHECK (
        hor_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "horarios_update" ON public.sgrh_cat_horarios
FOR UPDATE
    TO authenticated USING (
        hor_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        hor_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "horarios_delete" ON public.sgrh_cat_horarios FOR DELETE TO authenticated USING (
    hor_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Puestos por Empresa
CREATE POLICY "puestos_select" ON public.sgrh_cat_puestos FOR
SELECT TO authenticated USING (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "puestos_insert" ON public.sgrh_cat_puestos FOR INSERT TO authenticated
WITH
    CHECK (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "puestos_update" ON public.sgrh_cat_puestos
FOR UPDATE
    TO authenticated USING (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        pue_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "puestos_delete" ON public.sgrh_cat_puestos FOR DELETE TO authenticated USING (
    pue_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Niveles de Comisión por Empresa
CREATE POLICY "niveles_comision_select" ON public.sgrh_cat_niveles_comision FOR
SELECT TO authenticated USING (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "niveles_comision_insert" ON public.sgrh_cat_niveles_comision FOR INSERT TO authenticated
WITH
    CHECK (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "niveles_comision_update" ON public.sgrh_cat_niveles_comision
FOR UPDATE
    TO authenticated USING (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        nvc_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "niveles_comision_delete" ON public.sgrh_cat_niveles_comision FOR DELETE TO authenticated USING (
    nvc_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Feriados
CREATE POLICY "feriados_select" ON public.sgrh_cat_feriados FOR
SELECT TO authenticated USING (
        fer_empresa_id IS NULL
        OR fer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "feriados_insert" ON public.sgrh_cat_feriados FOR INSERT TO authenticated
WITH
    CHECK (
        (
            fer_empresa_id IS NULL
            OR fer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "feriados_update" ON public.sgrh_cat_feriados
FOR UPDATE
    TO authenticated USING (
        (
            fer_empresa_id IS NULL
            OR fer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    )
WITH
    CHECK (
        (
            fer_empresa_id IS NULL
            OR fer_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
        AND (
            SELECT public.tiene_permiso ('CATALOGOS_WRITE')
        )
    );

CREATE POLICY "feriados_delete" ON public.sgrh_cat_feriados FOR DELETE TO authenticated USING (
    (
        fer_empresa_id IS NULL
        OR fer_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    )
    AND (
        SELECT public.tiene_permiso ('CATALOGOS_WRITE')
    )
);

-- Programación Semanal de Asistencia
CREATE POLICY "programacion_select" ON public.sgrh_programacion_semanal FOR
SELECT TO authenticated USING (
        prg_empleado_id = (
            SELECT public.get_emp_id ()
        )
        OR (
            (
                SELECT public.tiene_permiso ('ASISTENCIA_READ')
            )
            AND prg_sucursal_id IN (
                SELECT suc_id
                FROM public.sgrh_sucursales
                WHERE
                    suc_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "programacion_insert" ON public.sgrh_programacion_semanal FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND prg_sucursal_id IN (
            SELECT suc_id
            FROM public.sgrh_sucursales
            WHERE
                suc_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "programacion_update" ON public.sgrh_programacion_semanal
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND prg_sucursal_id IN (
            SELECT suc_id
            FROM public.sgrh_sucursales
            WHERE
                suc_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
        )
        AND prg_sucursal_id IN (
            SELECT suc_id
            FROM public.sgrh_sucursales
            WHERE
                suc_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "programacion_delete" ON public.sgrh_programacion_semanal FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('ASISTENCIA_WRITE')
    )
    AND prg_sucursal_id IN (
        SELECT suc_id
        FROM public.sgrh_sucursales
        WHERE
            suc_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Comprobantes de Pago
CREATE POLICY "comprobantes_select" ON public.sgrh_comprobantes_pago FOR
SELECT TO authenticated USING (
        com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND com_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    )
            )
        )
    );

CREATE POLICY "comprobantes_insert" ON public.sgrh_comprobantes_pago FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "comprobantes_update" ON public.sgrh_comprobantes_pago
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND com_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "comprobantes_delete" ON public.sgrh_comprobantes_pago FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND com_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
    )
);

-- Beneficios del Empleado
CREATE POLICY "beneficios_select" ON public.sgrh_beneficios_empleado FOR
SELECT TO authenticated USING (
        ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                (
                    SELECT public.tiene_permiso ('NOMINA_READ')
                )
                OR (
                    SELECT public.tiene_permiso ('EMPLEADOS_READ')
                )
            )
            AND ben_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "beneficios_insert" ON public.sgrh_beneficios_empleado FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "beneficios_update" ON public.sgrh_beneficios_empleado
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ben_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "beneficios_delete" ON public.sgrh_beneficios_empleado FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ben_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Comisiones Calculadas
CREATE POLICY "comisiones_select" ON public.sgrh_comisiones_calculadas FOR
SELECT TO authenticated USING (
        cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND cal_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "comisiones_insert" ON public.sgrh_comisiones_calculadas FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "comisiones_update" ON public.sgrh_comisiones_calculadas
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND cal_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "comisiones_delete" ON public.sgrh_comisiones_calculadas FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND cal_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Provisiones Anuales
CREATE POLICY "provisiones_select" ON public.sgrh_provisiones_anuales FOR
SELECT TO authenticated USING (
        pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empleado_id = (
                    SELECT public.get_emp_id ()
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND pra_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
        )
    );

CREATE POLICY "provisiones_insert" ON public.sgrh_provisiones_anuales FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "provisiones_update" ON public.sgrh_provisiones_anuales
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pra_historial_laboral_id IN (
            SELECT lab_id
            FROM public.sgrh_historial_laboral
            WHERE
                lab_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
    );

CREATE POLICY "provisiones_delete" ON public.sgrh_provisiones_anuales FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND pra_historial_laboral_id IN (
        SELECT lab_id
        FROM public.sgrh_historial_laboral
        WHERE
            lab_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
);

-- Líneas de Nómina: Ingresos
CREATE POLICY "nomina_lineas_ingreso_select" ON public.sgrh_nomina_linea_ingreso FOR
SELECT TO authenticated USING (
        ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND ing_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    )
            )
        )
    );

CREATE POLICY "nomina_lineas_ingreso_insert" ON public.sgrh_nomina_linea_ingreso FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "nomina_lineas_ingreso_update" ON public.sgrh_nomina_linea_ingreso
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ing_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "nomina_lineas_ingreso_delete" ON public.sgrh_nomina_linea_ingreso FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ing_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
    )
);

-- Líneas de Nómina: Deducciones
CREATE POLICY "nomina_lineas_deduccion_select" ON public.sgrh_nomina_linea_deduccion FOR
SELECT TO authenticated USING (
        ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND ded_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    )
            )
        )
    );

CREATE POLICY "nomina_lineas_deduccion_insert" ON public.sgrh_nomina_linea_deduccion FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "nomina_lineas_deduccion_update" ON public.sgrh_nomina_linea_deduccion
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND ded_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "nomina_lineas_deduccion_delete" ON public.sgrh_nomina_linea_deduccion FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND ded_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
    )
);

-- Líneas de Nómina: Aportes Patronales
CREATE POLICY "nomina_lineas_patronal_select" ON public.sgrh_nomina_linea_patronal FOR
SELECT TO authenticated USING (
        pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_historial_laboral_id IN (
                    SELECT lab_id
                    FROM public.sgrh_historial_laboral
                    WHERE
                        lab_empleado_id = (
                            SELECT public.get_emp_id ()
                        )
                )
        )
        OR (
            (
                SELECT public.tiene_permiso ('NOMINA_READ')
            )
            AND pat_nomina_detalle_id IN (
                SELECT ndt_id
                FROM public.sgrh_nomina_detalle
                WHERE
                    ndt_nomina_periodo_id IN (
                        SELECT npe_id
                        FROM public.sgrh_nomina_periodo
                        WHERE
                            npe_empresa_id = (
                                SELECT public.get_empresa_id ()
                            )
                    )
            )
        )
    );

CREATE POLICY "nomina_lineas_patronal_insert" ON public.sgrh_nomina_linea_patronal FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "nomina_lineas_patronal_update" ON public.sgrh_nomina_linea_patronal
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('NOMINA_WRITE')
        )
        AND pat_nomina_detalle_id IN (
            SELECT ndt_id
            FROM public.sgrh_nomina_detalle
            WHERE
                ndt_nomina_periodo_id IN (
                    SELECT npe_id
                    FROM public.sgrh_nomina_periodo
                    WHERE
                        npe_empresa_id = (
                            SELECT public.get_empresa_id ()
                        )
                )
        )
    );

CREATE POLICY "nomina_lineas_patronal_delete" ON public.sgrh_nomina_linea_patronal FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('NOMINA_WRITE')
    )
    AND pat_nomina_detalle_id IN (
        SELECT ndt_id
        FROM public.sgrh_nomina_detalle
        WHERE
            ndt_nomina_periodo_id IN (
                SELECT npe_id
                FROM public.sgrh_nomina_periodo
                WHERE
                    npe_empresa_id = (
                        SELECT public.get_empresa_id ()
                    )
            )
    )
);

-- Candidatos
CREATE POLICY "candidatos_select" ON public.sgrh_candidatos FOR
SELECT TO authenticated USING (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_READ')
        )
    );

CREATE POLICY "candidatos_insert" ON public.sgrh_candidatos FOR INSERT TO authenticated
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "candidatos_update" ON public.sgrh_candidatos
FOR UPDATE
    TO authenticated USING (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    )
WITH
    CHECK (
        (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "candidatos_delete" ON public.sgrh_candidatos FOR DELETE TO authenticated USING (
    (
        SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
    )
);

-- Postulaciones
CREATE POLICY "postulaciones_select" ON public.sgrh_postulaciones FOR
SELECT TO authenticated USING (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_READ')
        )
    );

CREATE POLICY "postulaciones_insert" ON public.sgrh_postulaciones FOR INSERT TO authenticated
WITH
    CHECK (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulaciones_update" ON public.sgrh_postulaciones
FOR UPDATE
    TO authenticated USING (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    )
WITH
    CHECK (
        pos_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulaciones_delete" ON public.sgrh_postulaciones FOR DELETE TO authenticated USING (
    pos_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
    )
);

-- Etapas de Postulación
CREATE POLICY "postulacion_etapas_select" ON public.sgrh_postulacion_etapas FOR
SELECT TO authenticated USING (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_READ')
        )
    );

CREATE POLICY "postulacion_etapas_insert" ON public.sgrh_postulacion_etapas FOR INSERT TO authenticated
WITH
    CHECK (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulacion_etapas_update" ON public.sgrh_postulacion_etapas
FOR UPDATE
    TO authenticated USING (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    )
WITH
    CHECK (
        pet_postulacion_id IN (
            SELECT pos_id
            FROM public.sgrh_postulaciones
            WHERE
                pos_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
        )
    );

CREATE POLICY "postulacion_etapas_delete" ON public.sgrh_postulacion_etapas FOR DELETE TO authenticated USING (
    pet_postulacion_id IN (
        SELECT pos_id
        FROM public.sgrh_postulaciones
        WHERE
            pos_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
    AND (
        SELECT public.tiene_permiso ('RECLUTAMIENTO_WRITE')
    )
);

-- Evaluaciones de Desempeño
CREATE POLICY "evaluaciones_select" ON public.sgrh_evaluaciones FOR
SELECT TO authenticated USING (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            (
                SELECT public.tiene_permiso ('EVALUACIONES_READ')
            )
            OR eve_evaluador_id = (
                SELECT public.get_usr_id ()
            )
            OR eve_historial_laboral_id IN (
                SELECT lab_id
                FROM public.sgrh_historial_laboral
                WHERE
                    lab_empleado_id = (
                        SELECT public.get_emp_id ()
                    )
            )
        )
    );

CREATE POLICY "evaluaciones_insert" ON public.sgrh_evaluaciones FOR INSERT TO authenticated
WITH
    CHECK (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "evaluaciones_update" ON public.sgrh_evaluaciones
FOR UPDATE
    TO authenticated USING (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    )
WITH
    CHECK (
        eve_empresa_id = (
            SELECT public.get_empresa_id ()
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "evaluaciones_delete" ON public.sgrh_evaluaciones FOR DELETE TO authenticated USING (
    eve_empresa_id = (
        SELECT public.get_empresa_id ()
    )
    AND (
        SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
    )
);

-- Resultados de Evaluación
CREATE POLICY "eval_resultados_select" ON public.sgrh_evaluacion_resultados FOR
SELECT TO authenticated USING (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
                AND (
                    (
                        SELECT public.tiene_permiso ('EVALUACIONES_READ')
                    )
                    OR eve_evaluador_id = (
                        SELECT public.get_usr_id ()
                    )
                    OR eve_historial_laboral_id IN (
                        SELECT lab_id
                        FROM public.sgrh_historial_laboral
                        WHERE
                            lab_empleado_id = (
                                SELECT public.get_emp_id ()
                            )
                    )
                )
        )
    );

CREATE POLICY "eval_resultados_insert" ON public.sgrh_evaluacion_resultados FOR INSERT TO authenticated
WITH
    CHECK (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "eval_resultados_update" ON public.sgrh_evaluacion_resultados
FOR UPDATE
    TO authenticated USING (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    )
WITH
    CHECK (
        evr_evaluacion_id IN (
            SELECT eve_id
            FROM public.sgrh_evaluaciones
            WHERE
                eve_empresa_id = (
                    SELECT public.get_empresa_id ()
                )
        )
        AND (
            SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
        )
    );

CREATE POLICY "eval_resultados_delete" ON public.sgrh_evaluacion_resultados FOR DELETE TO authenticated USING (
    evr_evaluacion_id IN (
        SELECT eve_id
        FROM public.sgrh_evaluaciones
        WHERE
            eve_empresa_id = (
                SELECT public.get_empresa_id ()
            )
    )
    AND (
        SELECT public.tiene_permiso ('EVALUACIONES_WRITE')
    )
);

-- Notificaciones
CREATE POLICY "notificaciones_select" ON public.sgrh_notificaciones FOR
SELECT TO authenticated USING (
        ntf_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR ntf_empleado_id = (
            SELECT public.get_emp_id ()
        )
        OR (
            (
                SELECT public.tiene_permiso ('USUARIOS_WRITE')
            )
            AND ntf_empresa_id = (
                SELECT public.get_empresa_id ()
            )
        )
    );

CREATE POLICY "notificaciones_insert" ON public.sgrh_notificaciones FOR INSERT TO authenticated
WITH
    CHECK (
        ntf_empresa_id = (
            SELECT public.get_empresa_id ()
        )
    );

CREATE POLICY "notificaciones_update" ON public.sgrh_notificaciones
FOR UPDATE
    TO authenticated USING (
        ntf_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR ntf_empleado_id = (
            SELECT public.get_emp_id ()
        )
    )
WITH
    CHECK (
        ntf_usuario_id = (
            SELECT public.get_usr_id ()
        )
        OR ntf_empleado_id = (
            SELECT public.get_emp_id ()
        )
    );

CREATE POLICY "notificaciones_delete" ON public.sgrh_notificaciones FOR DELETE TO authenticated USING (
    ntf_usuario_id = (
        SELECT public.get_usr_id ()
    )
    OR ntf_empleado_id = (
        SELECT public.get_emp_id ()
    )
);