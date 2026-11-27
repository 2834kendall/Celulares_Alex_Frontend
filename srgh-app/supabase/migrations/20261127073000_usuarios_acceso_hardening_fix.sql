-- =====================================================================
-- SGRH-119 (Ronda 2) — Cierre de casos límite en sesión y claims
-- =====================================================================
-- 1. custom_access_token_hook: evita duplicados en `sucursal_ids` con
--    ARRAY_AGG(DISTINCT ...).
-- 2. sgrh_private.sesion_activa(): rechaza sesiones expiradas por
--    `auth.sessions.not_after <= now()`.
-- 3. get_empresa_id(), get_usr_id(), get_emp_id(): protegen contra `""`
--    con `nullif(trim(...), '')` para evitar 22P02.
-- =====================================================================
BEGIN;

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
          ARRAY_AGG(DISTINCT uer.uer_sucursal_id ORDER BY uer.uer_sucursal_id)
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
      AND (s.not_after IS NULL OR s.not_after > now())
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

CREATE OR REPLACE FUNCTION public.get_empresa_id()
RETURNS int AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa()
      THEN nullif(trim(auth.jwt() -> 'app_metadata' ->> 'empresa_id'), '')::int
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_usr_id()
RETURNS int AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa()
      THEN nullif(trim(auth.jwt() -> 'app_metadata' ->> 'usr_id'), '')::int
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

CREATE OR REPLACE FUNCTION public.get_emp_id()
RETURNS int AS $$
  SELECT CASE
    WHEN sgrh_private.sesion_activa()
      THEN nullif(trim(auth.jwt() -> 'app_metadata' ->> 'emp_id'), '')::int
    ELSE NULL
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

REVOKE ALL ON FUNCTION
  public.get_empresa_id(),
  public.get_usr_id(),
  public.get_emp_id()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.get_empresa_id(),
  public.get_usr_id(),
  public.get_emp_id()
TO authenticated;

COMMIT;
