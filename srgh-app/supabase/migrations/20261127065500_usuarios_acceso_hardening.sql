-- =====================================================================
-- SGRH-119 — Endurecimiento de acceso, revocación inmediata y listado
-- =====================================================================
-- 1. custom_access_token_hook: filtra usr_activo = true y roles activos
--    (con excepción explícita para KIOSCO, SGRH-111), limpia claims de
--    negocio cuando el usuario está inactivo o sin rol activo, agrega
--    sucursales solo de la empresa seleccionada y resuelve permisos por
--    rpe_rol_id.
-- 2. sgrh_private.permisos_actor: filtra roles activos (o KIOSCO).
-- 3. sgrh_private.sesion_activa() + helpers RLS + sgrh_sesion_vigente():
--    valida sesión viva en auth.sessions, ban en auth.users, usr_activo y
--    asignación activa en la empresa del JWT en cada sentencia.
-- 4. sgrh_revoke_user_sessions(uuid): wrapper service_role para revocar
--    sesiones al desactivar un usuario.
-- 5. sgrh_usuarios_ultimo_acceso_empresa(int): consulta last_sign_in_at
--    solo para la empresa solicitada sin depender de listUsers(1000).
-- =====================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS sgrh_private;
GRANT USAGE ON SCHEMA sgrh_private TO authenticated, service_role;

-- ─── 1. Hook JWT ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims            jsonb;
  v_app_metadata    jsonb;
  v_rol_id          int;
  v_rol             text;
  v_empresa         int;
  v_sucursales      int[];
  v_sin_restriccion boolean := false;
  v_usr_id          int;
  v_emp_id          int;
  v_permisos        text[];
  v_user_id_raw     text;
BEGIN
  IF event IS NULL THEN
    RETURN '{"claims":{}}'::jsonb;
  END IF;

  IF event->'claims' IS NULL OR jsonb_typeof(event->'claims') <> 'object' THEN
    event := jsonb_set(event, '{claims}', '{}'::jsonb);
  END IF;

  v_user_id_raw := event->>'user_id';
  IF v_user_id_raw IS NULL THEN
    RETURN event;
  END IF;

  BEGIN
    SELECT usr_id, usr_empleado_id
    INTO v_usr_id, v_emp_id
    FROM public.sgrh_usuarios
    WHERE usr_auth_id = v_user_id_raw::uuid
      AND usr_activo = true;

    IF v_usr_id IS NOT NULL THEN
      -- Seleccionar deterministamente una empresa activa y su rol activo
      -- (o KIOSCO, SGRH-111). Nunca mezclar sucursales entre empresas.
      SELECT uer.uer_empresa_id, uer.uer_rol_id, r.rol_codigo
      INTO v_empresa, v_rol_id, v_rol
      FROM public.sgrh_usuarios_empresa_rol uer
      JOIN public.sgrh_cat_roles r ON r.rol_id = uer.uer_rol_id
      WHERE uer.uer_usuario_id = v_usr_id
        AND uer.uer_activo = true
        AND (r.rol_activo = true OR r.rol_codigo = 'KIOSCO')
      ORDER BY uer.uer_id
      LIMIT 1;

      IF v_empresa IS NOT NULL THEN
        SELECT
          bool_or(uer.uer_sucursal_id IS NULL),
          ARRAY_AGG(uer.uer_sucursal_id ORDER BY uer.uer_sucursal_id)
            FILTER (WHERE uer.uer_sucursal_id IS NOT NULL)
        INTO v_sin_restriccion, v_sucursales
        FROM public.sgrh_usuarios_empresa_rol uer
        JOIN public.sgrh_cat_roles r ON r.rol_id = uer.uer_rol_id
        WHERE uer.uer_usuario_id = v_usr_id
          AND uer.uer_empresa_id = v_empresa
          AND uer.uer_activo = true
          AND (r.rol_activo = true OR r.rol_codigo = 'KIOSCO');

        IF v_sin_restriccion THEN
          v_sucursales := NULL;
        END IF;
      END IF;

      IF v_rol_id IS NOT NULL THEN
        SELECT ARRAY_AGG(DISTINCT p.per_codigo ORDER BY p.per_codigo)
        INTO v_permisos
        FROM public.sgrh_rol_permisos rp
        JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
        WHERE rp.rpe_rol_id = v_rol_id;
      END IF;
    END IF;

    claims := event->'claims';
    v_app_metadata := CASE
      WHEN jsonb_typeof(claims->'app_metadata') = 'object' THEN claims->'app_metadata'
      ELSE '{}'::jsonb
    END;

    -- Siempre sobrescribir los claims de negocio: si el usuario está inactivo
    -- o sin roles activos, limpia cualquier claim previo en app_metadata.
    v_app_metadata := jsonb_set(v_app_metadata, '{usr_id}',
                        coalesce(to_jsonb(v_usr_id), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{emp_id}',
                        coalesce(to_jsonb(v_emp_id), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{rol}',
                        to_jsonb(coalesce(v_rol, 'SIN_ROL')));
    v_app_metadata := jsonb_set(v_app_metadata, '{empresa_id}',
                        coalesce(to_jsonb(v_empresa), 'null'::jsonb));
    v_app_metadata := jsonb_set(v_app_metadata, '{sucursal_ids}',
                        coalesce(to_jsonb(v_sucursales), 'null'::jsonb));
    v_app_metadata := v_app_metadata - 'sucursal_id';
    v_app_metadata := jsonb_set(v_app_metadata, '{permisos}',
                        to_jsonb(coalesce(v_permisos, '{}'::text[])));

    claims := jsonb_set(claims, '{app_metadata}', v_app_metadata);

    RETURN jsonb_set(event, '{claims}', claims);
  EXCEPTION WHEN OTHERS THEN
    RETURN event;
  END;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ─── 2. Permisos vivos del actor ──────────────────────────────────────
CREATE OR REPLACE FUNCTION sgrh_private.permisos_actor(p_actor uuid, p_empresa int)
RETURNS TABLE (usr_id int, rol_id int, permisos text[])
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT u.usr_id, a.uer_rol_id,
    coalesce((SELECT array_agg(DISTINCT p.per_codigo)
              FROM public.sgrh_rol_permisos rp
              JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
              WHERE rp.rpe_rol_id = a.uer_rol_id), '{}')
  FROM public.sgrh_usuarios u
  JOIN public.sgrh_usuarios_empresa_rol a
    ON a.uer_usuario_id = u.usr_id AND a.uer_empresa_id = p_empresa AND a.uer_activo
  JOIN public.sgrh_cat_roles r
    ON r.rol_id = a.uer_rol_id AND (r.rol_activo = true OR r.rol_codigo = 'KIOSCO')
  WHERE u.usr_auth_id = p_actor AND u.usr_activo
  ORDER BY a.uer_id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION sgrh_private.permisos_actor(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sgrh_private.permisos_actor(uuid, int) TO service_role;

-- ─── 3. Validación de sesión viva para RLS y Next.js ──────────────────
CREATE OR REPLACE FUNCTION sgrh_private.sesion_activa()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         uuid;
  v_jwt         jsonb;
  v_session_raw text;
  v_session_id  uuid;
  v_empresa_raw text;
  v_empresa_id  int;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  v_jwt := auth.jwt();
  IF v_jwt IS NULL THEN
    RETURN false;
  END IF;

  v_session_raw := nullif(trim(v_jwt ->> 'session_id'), '');
  IF v_session_raw IS NULL THEN
    RETURN false;
  END IF;

  BEGIN
    v_session_id := v_session_raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN false;
  END;

  v_empresa_raw := nullif(trim(v_jwt -> 'app_metadata' ->> 'empresa_id'), '');
  IF v_empresa_raw IS NOT NULL THEN
    BEGIN
      v_empresa_id := v_empresa_raw::int;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN false;
    END;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM auth.sessions s
    JOIN auth.users au ON au.id = s.user_id
    JOIN public.sgrh_usuarios u ON u.usr_auth_id = au.id
    WHERE s.id = v_session_id
      AND s.user_id = v_uid
      AND (au.banned_until IS NULL OR au.banned_until <= now())
      AND u.usr_activo = true
      AND (
        v_empresa_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.sgrh_usuarios_empresa_rol uer
          JOIN public.sgrh_cat_roles r ON r.rol_id = uer.uer_rol_id
          WHERE uer.uer_usuario_id = u.usr_id
            AND uer.uer_empresa_id = v_empresa_id
            AND uer.uer_activo = true
            AND (r.rol_activo = true OR r.rol_codigo = 'KIOSCO')
        )
      )
  );
EXCEPTION WHEN invalid_text_representation THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION sgrh_private.sesion_activa() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sgrh_private.sesion_activa() TO authenticated, service_role;

-- Integrar sgrh_private.sesion_activa() en los helpers RLS existentes
CREATE OR REPLACE FUNCTION public.get_rol()
RETURNS text AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa() THEN (auth.jwt() -> 'app_metadata' ->> 'rol')
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS int AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa() THEN (auth.jwt() -> 'app_metadata' ->> 'empresa_id')::int
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_usr_id()
RETURNS int AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa() THEN (auth.jwt() -> 'app_metadata' ->> 'usr_id')::int
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_emp_id()
RETURNS int AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa() THEN (auth.jwt() -> 'app_metadata' ->> 'emp_id')::int
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_codigo text)
RETURNS boolean AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa() THEN coalesce(
      (auth.jwt() -> 'app_metadata' -> 'permisos') @> to_jsonb(p_codigo),
      false
    )
    ELSE false
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_sucursal_ids()
RETURNS int[] AS $$
  SELECT CASE
    WHEN NOT sgrh_private.sesion_activa() THEN NULL
    WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'sucursal_ids') IS DISTINCT FROM 'array'
      THEN NULL
    ELSE ARRAY(
      SELECT jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'sucursal_ids')::int
    )
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION
  public.get_rol(),
  public.get_empresa_id(),
  public.get_usr_id(),
  public.get_emp_id(),
  public.tiene_permiso(text),
  public.get_sucursal_ids()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.get_rol(),
  public.get_empresa_id(),
  public.get_usr_id(),
  public.get_emp_id(),
  public.tiene_permiso(text),
  public.get_sucursal_ids()
TO authenticated;

-- RPC expuesta a authenticated para validar vigencia de sesión desde proxy/SSR
CREATE OR REPLACE FUNCTION public.sgrh_sesion_vigente()
RETURNS boolean AS $$
  SELECT sgrh_private.sesion_activa();
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION public.sgrh_sesion_vigente() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_sesion_vigente() TO authenticated;

-- ─── 4. Revocación de sesiones vía service_role ───────────────────────
CREATE OR REPLACE FUNCTION public.sgrh_revoke_user_sessions(p_auth uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_auth IS NULL THEN
    RETURN;
  END IF;
  PERFORM sgrh_private.revoke_auth_sessions(p_auth);
END;
$$;

REVOKE ALL ON FUNCTION public.sgrh_revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_revoke_user_sessions(uuid) TO service_role;

-- ─── 5. Último acceso acotado por empresa (>1000 cuentas en Auth) ───────
CREATE OR REPLACE FUNCTION public.sgrh_usuarios_ultimo_acceso_empresa(p_empresa_id int)
RETURNS TABLE (usr_auth_id uuid, last_sign_in_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT DISTINCT u.usr_auth_id, au.last_sign_in_at
  FROM public.sgrh_usuarios_empresa_rol uer
  JOIN public.sgrh_usuarios u ON u.usr_id = uer.uer_usuario_id
  JOIN auth.users au ON au.id = u.usr_auth_id
  WHERE uer.uer_empresa_id = p_empresa_id
    AND u.usr_auth_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.sgrh_usuarios_ultimo_acceso_empresa(int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_usuarios_ultimo_acceso_empresa(int) TO service_role;

COMMIT;
