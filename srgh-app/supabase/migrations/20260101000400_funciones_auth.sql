-- =====================================================================
-- SGRH — Baseline: funciones de autenticación y autorización
-- =====================================================================
-- El corazón del sistema de permisos. Sin este archivo nada funciona: la
-- RLS de 20260101000600 llama a tiene_permiso()/get_empresa_id(), y esas
-- funciones leen los claims que inyecta custom_access_token_hook.
--
-- IMPORTANTE — configuración que NO viaja en el repo: el hook tiene que
-- quedar habilitado en cada proyecto (Dashboard → Authentication → Hooks →
-- Customize Access Token, o el bloque [auth.hook.custom_access_token] de
-- config.toml para el entorno local). Si no se habilita, el JWT sale sin
-- claims, tiene_permiso() devuelve false para todo y la app queda muerta
-- aunque las migraciones hayan corrido bien.
--
-- Todo el archivo es idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LIMPIEZA DE OBJETOS DESPLAZADOS/DUPLICADOS
-- ---------------------------------------------------------------------
-- No-ops en una base nueva; se conservan para que el archivo siga siendo
-- convergente al aplicarlo sobre un proyecto que venga del esquema viejo.

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
  v_sucursal     int;
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

    -- Rol, empresa y sucursal activos del usuario.
    --
    -- uer_sucursal_id es NULL para quien trabaja a nivel empresa (ADMIN) y
    -- tiene valor para quien está adscrito a una sucursal (GERENTE, KIOSCO).
    -- Esa distinción es la que usan las policies: NULL = sin restricción de
    -- sucursal, con valor = solo esa sucursal. Ver get_sucursal_id().
    SELECT r.rol_codigo, uer.uer_empresa_id, uer.uer_sucursal_id
    INTO v_rol, v_empresa, v_sucursal
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
    -- null = el usuario opera a nivel empresa (no está adscrito a sucursal)
    v_app_metadata := jsonb_set(v_app_metadata, '{sucursal_id}',
                        coalesce(to_jsonb(v_sucursal), 'null'::jsonb));
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

-- Sucursal a la que está adscrito el usuario, o NULL si opera a nivel empresa.
--
-- El NULL es semántico, no un dato faltante: significa "sin restricción de
-- sucursal". Las policies operativas usan el idiom
--
--     (SELECT public.get_sucursal_id()) IS NULL
--     OR <columna_sucursal> = (SELECT public.get_sucursal_id())
--
-- de modo que un ADMIN (sucursal NULL) ve toda la empresa y un GERENTE solo
-- su sucursal, con una sola policy y sin ramas por rol.
--
-- OJO: esto NO reemplaza el filtro por empresa. Los ids de sucursal son
-- globales, así que sin el chequeo de empresa un id de sucursal ajena
-- colaría. Las dos condiciones van siempre juntas.
CREATE OR REPLACE FUNCTION public.get_sucursal_id()
RETURNS int AS $$
  SELECT (auth.jwt() -> 'app_metadata' ->> 'sucursal_id')::int;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

-- ¿Puede el usuario actual ver registros de esta sucursal?
--
-- Encapsula las DOS condiciones que siempre van juntas:
--   1. la sucursal pertenece a la empresa del JWT (aislamiento multi-empresa);
--   2. o el usuario no está adscrito a ninguna sucursal (ADMIN → ve todas),
--      o es exactamente la suya (GERENTE, KIOSCO).
--
-- Existe como función y no copiada en cada policy justamente porque separarlas
-- es el error fácil: los ids de sucursal son globales, así que un chequeo de
-- sucursal sin el de empresa deja pasar la sucursal de otro inquilino.
--
-- SECURITY DEFINER para poder leer sgrh_sucursales sin depender de la policy
-- de esa tabla; no filtra nada porque solo devuelve un booleano ya acotado a
-- la empresa del JWT.
--
-- Se aplica al SUCURSAL DEL REGISTRO (mar_sucursal_id, prg_sucursal_id,
-- npe_sucursal_id...), no a la sucursal actual del empleado. Esa distinción
-- es deliberada: un traslado no debe mover el historial de una sucursal a
-- otra ni borrárselo al gerente que era responsable en su momento.
CREATE OR REPLACE FUNCTION public.sucursal_visible(p_sucursal_id int)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sgrh_sucursales
    WHERE suc_id = p_sucursal_id
      AND suc_empresa_id = (SELECT public.get_empresa_id())
  )
  AND (
    (SELECT public.get_sucursal_id()) IS NULL
    OR p_sucursal_id = (SELECT public.get_sucursal_id())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

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
EXECUTE ON FUNCTION public.get_sucursal_id ()
FROM PUBLIC, anon, authenticated;

REVOKE
EXECUTE ON FUNCTION public.sucursal_visible (int)
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

-- Restituir a authenticated el acceso a los helpers que usan las policies RLS.
--
-- NO BORRAR ESTOS GRANT, y en particular no el de sucursal_visible. Suena a
-- privilegio de más (el linter de Supabase lo reporta como "Signed-In Users Can
-- Execute SECURITY DEFINER Function") pero es obligatorio:
--
--   Postgres SÍ chequea el privilegio EXECUTE del usuario que corre la query
--   sobre las funciones que aparecen dentro de una policy RLS.
--
-- Medido, no deducido: revocando EXECUTE de sucursal_visible y consultando una
-- tabla cuya policy la invoca, Postgres responde
--   42501 permission denied for function sucursal_visible
-- y se cae TODA la operación (11 tablas: empleados, marcas, ausencias, nómina,
-- comprobantes, programación, uer...). Nótese que esto contradice el ejemplo de
-- security-rls-performance.md de Supabase, que muestra un helper de policy con
-- EXECUTE revocado; ese ejemplo no funciona tal cual está.
--
-- Si el warning del linter molesta, la salida correcta NO es revocar sino mover
-- la función a un esquema que PostgREST no exponga (sgrh_private): ahí el GRANT
-- se conserva, las policies siguen andando y desaparece el endpoint
-- /rest/v1/rpc/sucursal_visible. Cuesta reescribir ~48 call sites en
-- 20260101000600_rls_policies.sql.
GRANT
EXECUTE ON FUNCTION public.get_rol ()
TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_empresa_id ()
TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_sucursal_id ()
TO authenticated;

GRANT
EXECUTE ON FUNCTION public.sucursal_visible (int)
TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_usr_id ()
TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_emp_id ()
TO authenticated;

GRANT
EXECUTE ON FUNCTION public.tiene_permiso (text)
TO authenticated;

REVOKE
EXECUTE ON FUNCTION sgrh_private.asignar_permisos (text, text [])
FROM PUBLIC, anon, authenticated;
