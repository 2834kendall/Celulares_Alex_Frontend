-- SGRH-111: kiosks sign in with a username and a password chosen by the
-- administrator, without a mailbox.
--
-- The kiosk keeps its Supabase Auth account (role KIOSCO, live checks and
-- face tickets stay as they are). New kiosks get an internal address that
-- nobody reads; the login form translates the username to that address.
-- Kiosks created before this migration keep their real address and can be
-- given a username later.
BEGIN;

-- ─── 1. Username ─────────────────────────────────────────────────────────────
-- Unique across ALL companies: the login screen does not know which company is
-- signing in. Stored in lowercase so "Caja1" and "caja1" are the same user.
ALTER TABLE public.sgrh_kioscos ADD COLUMN kio_login text
  CHECK (kio_login ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
CREATE UNIQUE INDEX sgrh_kioscos_login_key ON public.sgrh_kioscos (kio_login);

COMMENT ON COLUMN public.sgrh_kioscos.kio_login IS
  'Usuario con el que el kiosco inicia sesión (SGRH-111). Único en todo el sistema y en minúsculas. NULL = el kiosco todavía entra con su correo (kioscos anteriores a SGRH-111).';
COMMENT ON COLUMN public.sgrh_kioscos.kio_email IS
  'Correo de la cuenta de Auth del kiosco. Desde SGRH-111 es una dirección interna que nadie lee; los kioscos anteriores conservan su correo real.';

-- ─── 2. Session revocation ───────────────────────────────────────────────────
-- Changing the password must sign out every device. Deleting the refresh
-- tokens stops renewals; the access token still lives until it expires, so
-- sgrh_kiosk_context (below) also rejects a session that no longer exists.
CREATE SCHEMA IF NOT EXISTS sgrh_private;
GRANT USAGE ON SCHEMA sgrh_private TO service_role;

CREATE FUNCTION sgrh_private.revoke_auth_sessions(p_auth uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  DELETE FROM auth.refresh_tokens WHERE user_id = p_auth::text;
  DELETE FROM auth.sessions WHERE user_id = p_auth;
END $$;

CREATE FUNCTION sgrh_private.auth_session_exists(p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM auth.sessions WHERE id = p_session);
$$;

REVOKE ALL ON FUNCTION sgrh_private.revoke_auth_sessions(uuid),
  sgrh_private.auth_session_exists(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION sgrh_private.revoke_auth_sessions(uuid),
  sgrh_private.auth_session_exists(uuid) TO service_role;

-- ─── 3. Kiosk administration ─────────────────────────────────────────────────
-- Same function as SGRH-103, with:
--   - 'crear' validates and stores the username (the server sends the
--     internal address as the email);
--   - 'usuario' changes the username;
--   - 'clave' records a password change, revokes sessions and bumps the version.
CREATE OR REPLACE FUNCTION public.sgrh_manage_kiosk(p_actor uuid,p_empresa int,p_action text,p_id uuid,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_k public.sgrh_kioscos; v_branch int; v_target int; v_email text; v_role int; v_login text; v_auth uuid;
BEGIN
  v_usr:=public.sgrh_assert_branch_admin(p_actor,p_empresa,true);
  PERFORM pg_advisory_xact_lock(103,p_empresa);
  IF p_action='crear' THEN
    v_branch:=(p_data->>'sucursal_id')::int;
    PERFORM 1 FROM public.sgrh_sucursales WHERE suc_id=v_branch AND suc_empresa_id=p_empresa AND suc_activa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí una sucursal activa de tu empresa.' USING ERRCODE='23514'; END IF;
    v_login:=lower(trim(coalesce(p_data->>'login','')));
    IF length(trim(coalesce(p_data->>'nombre',''))) NOT BETWEEN 2 AND 80
      OR coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'Revisá el nombre y correo del kiosco.' USING ERRCODE='23514'; END IF;
    -- The app always sends a username. An empty one is still accepted so the
    -- shared dev project keeps working for branches deployed before SGRH-111.
    IF v_login <> '' AND v_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN
      RAISE EXCEPTION 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.' USING ERRCODE='23514'; END IF;
    IF EXISTS (SELECT 1 FROM public.sgrh_kioscos WHERE kio_login=v_login) THEN
      RAISE EXCEPTION 'Ese usuario ya está en uso. Elegí otro.' USING ERRCODE='23514'; END IF;
    INSERT INTO public.sgrh_kioscos(kio_empresa_id,kio_sucursal_id,kio_nombre,kio_email,kio_login)
      VALUES(p_empresa,v_branch,trim(p_data->>'nombre'),lower(trim(p_data->>'email')),nullif(v_login,'')) RETURNING * INTO v_k;
  ELSE
    SELECT * INTO v_k FROM public.sgrh_kioscos WHERE kio_id=p_id AND kio_empresa_id=p_empresa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Kiosco no encontrado.' USING ERRCODE='42501'; END IF;
    IF p_action='vincular' THEN
      IF v_k.kio_estado='bloqueado' THEN RAISE EXCEPTION 'El kiosco fue bloqueado. Desbloquealo antes de vincular la cuenta.' USING ERRCODE='23514'; END IF;
      v_target:=(p_data->>'usuario_id')::int;
      IF v_k.kio_usuario_id IS NOT NULL AND v_k.kio_usuario_id<>v_target THEN
        RAISE EXCEPTION 'El kiosco ya tiene una cuenta vinculada.' USING ERRCODE='23514'; END IF;
      PERFORM 1 FROM public.sgrh_usuarios WHERE usr_id=v_target AND usr_email=v_k.kio_email
        AND usr_empleado_id IS NULL AND usr_activo AND usr_auth_id IS NOT NULL FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta debe estar activa, sin empleado y con el correo del kiosco.' USING ERRCODE='23514'; END IF;
      SELECT rol_id INTO v_role FROM public.sgrh_cat_roles WHERE rol_codigo='KIOSCO';
      -- Do not steal an existing personal/cross-company identity.
      IF EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_target
        AND (uer_empresa_id<>p_empresa OR uer_rol_id<>v_role)) THEN
        RAISE EXCEPTION 'La cuenta ya tiene otro rol o empresa. Usá una cuenta técnica independiente.' USING ERRCODE='23514'; END IF;
      IF EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_target AND uer_activo)
        AND ((SELECT count(*) FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_target AND uer_activo)<>1
          OR NOT EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_target AND uer_activo AND uer_sucursal_id=v_k.kio_sucursal_id)) THEN
        RAISE EXCEPTION 'Corregí primero la cuenta existente: debe tener exactamente esta sucursal.' USING ERRCODE='23514'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_target AND uer_activo) THEN
        INSERT INTO public.sgrh_usuarios_empresa_rol(uer_usuario_id,uer_empresa_id,uer_rol_id,uer_sucursal_id,uer_activo)
          VALUES(v_target,p_empresa,v_role,v_k.kio_sucursal_id,true);
      END IF;
      UPDATE public.sgrh_kioscos SET kio_usuario_id=v_target,kio_estado='activo',kio_version=kio_version+1 WHERE kio_id=p_id;
    ELSIF p_action='renombrar' THEN
      IF length(trim(coalesce(p_data->>'nombre',''))) NOT BETWEEN 2 AND 80 THEN
        RAISE EXCEPTION 'El nombre del kiosco debe tener entre 2 y 80 caracteres.' USING ERRCODE='23514'; END IF;
      UPDATE public.sgrh_kioscos SET kio_nombre=trim(p_data->>'nombre') WHERE kio_id=p_id;
    ELSIF p_action='usuario' THEN
      v_login:=lower(trim(coalesce(p_data->>'login','')));
      IF v_login !~ '^[a-z0-9][a-z0-9._-]{2,39}$' THEN
        RAISE EXCEPTION 'El usuario debe tener de 3 a 40 caracteres: letras, números, punto, guion o guion bajo.' USING ERRCODE='23514'; END IF;
      IF EXISTS (SELECT 1 FROM public.sgrh_kioscos WHERE kio_login=v_login AND kio_id<>p_id) THEN
        RAISE EXCEPTION 'Ese usuario ya está en uso. Elegí otro.' USING ERRCODE='23514'; END IF;
      UPDATE public.sgrh_kioscos SET kio_login=v_login WHERE kio_id=p_id;
    ELSIF p_action='clave' THEN
      -- The password itself is changed by the server through the Auth admin
      -- API; this records it and signs out every device of the kiosk.
      SELECT usr_auth_id INTO v_auth FROM public.sgrh_usuarios WHERE usr_id=v_k.kio_usuario_id;
      IF v_auth IS NULL THEN RAISE EXCEPTION 'El kiosco todavía no tiene una cuenta de acceso.' USING ERRCODE='23514'; END IF;
      PERFORM sgrh_private.revoke_auth_sessions(v_auth);
      UPDATE public.sgrh_kioscos SET kio_version=kio_version+1 WHERE kio_id=p_id;
    ELSIF p_action='mover' THEN
      IF v_k.kio_estado<>'bloqueado' THEN RAISE EXCEPTION 'Bloqueá el kiosco antes de cambiar su sucursal.' USING ERRCODE='23514'; END IF;
      v_branch:=(p_data->>'sucursal_id')::int;
      PERFORM 1 FROM public.sgrh_sucursales WHERE suc_id=v_branch AND suc_empresa_id=p_empresa AND suc_activa FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Elegí una sucursal activa de tu empresa.' USING ERRCODE='23514'; END IF;
      IF v_k.kio_usuario_id IS NOT NULL THEN
        SELECT rol_id INTO v_role FROM public.sgrh_cat_roles WHERE rol_codigo='KIOSCO';
        IF EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_k.kio_usuario_id
          AND (uer_empresa_id<>p_empresa OR uer_rol_id<>v_role)) THEN
          RAISE EXCEPTION 'La cuenta tiene una asignación incompatible.' USING ERRCODE='23514'; END IF;
        UPDATE public.sgrh_usuarios_empresa_rol SET uer_activo=false WHERE uer_usuario_id=v_k.kio_usuario_id AND uer_empresa_id=p_empresa;
        INSERT INTO public.sgrh_usuarios_empresa_rol(uer_usuario_id,uer_empresa_id,uer_rol_id,uer_sucursal_id,uer_activo)
          VALUES(v_k.kio_usuario_id,p_empresa,v_role,v_branch,true);
      END IF;
      UPDATE public.sgrh_kioscos SET kio_sucursal_id=v_branch,kio_version=kio_version+1 WHERE kio_id=p_id;
    ELSIF p_action IN ('bloquear','activar') THEN
      IF p_action='activar' AND NOT EXISTS(
        SELECT 1 FROM public.sgrh_sucursales WHERE suc_id=v_k.kio_sucursal_id AND suc_empresa_id=p_empresa AND suc_activa) THEN
        RAISE EXCEPTION 'Activá su sucursal antes de habilitar el kiosco.' USING ERRCODE='23514'; END IF;
      IF p_action='activar' AND v_k.kio_usuario_id IS NOT NULL AND (NOT EXISTS (
        SELECT 1 FROM public.sgrh_usuarios WHERE usr_id=v_k.kio_usuario_id AND usr_activo AND usr_auth_id IS NOT NULL AND usr_empleado_id IS NULL)
        OR (SELECT count(*) FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_k.kio_usuario_id AND uer_activo)<>1
        OR NOT EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol a JOIN public.sgrh_cat_roles r ON r.rol_id=a.uer_rol_id
          WHERE a.uer_usuario_id=v_k.kio_usuario_id AND a.uer_activo AND a.uer_empresa_id=p_empresa AND a.uer_sucursal_id=v_k.kio_sucursal_id AND r.rol_codigo='KIOSCO')) THEN
        RAISE EXCEPTION 'La cuenta técnica no está activa o su asignación cambió. Revisá la cuenta antes de habilitarla.' USING ERRCODE='23514'; END IF;
      UPDATE public.sgrh_kioscos SET kio_estado=CASE WHEN p_action='activar' THEN CASE WHEN kio_usuario_id IS NULL THEN 'pendiente' ELSE 'activo' END ELSE 'bloqueado' END,
        kio_version=kio_version+1 WHERE kio_id=p_id;
    ELSE RAISE EXCEPTION 'Acción de kiosco inválida.' USING ERRCODE='23514'; END IF;
    UPDATE public.sgrh_kioscos SET kio_updated_at=now() WHERE kio_id=p_id RETURNING * INTO v_k;
  END IF;
  INSERT INTO public.sgrh_config_auditoria(aud_empresa_id,aud_usuario_id,aud_entidad,aud_referencia,aud_accion)
    VALUES(p_empresa,v_usr,'kiosco',v_k.kio_id::text,p_action);
  RETURN v_k.kio_id;
END $$;

-- ─── 4. Live kiosk context: the session must still exist ────────────────────
-- New optional parameter, so the old two-argument signature is replaced.
DROP FUNCTION public.sgrh_kiosk_context(uuid,int);
CREATE FUNCTION public.sgrh_kiosk_context(p_auth uuid,p_empresa int,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_branches int[]; v_k public.sgrh_kioscos; v_role text; v_operator boolean;
BEGIN
  SELECT usr_id INTO v_usr FROM public.sgrh_usuarios WHERE usr_auth_id=p_auth AND usr_activo;
  IF v_usr IS NULL THEN RETURN jsonb_build_object('error','La cuenta del kiosco no está activa.'); END IF;
  SELECT array_agg(a.uer_sucursal_id ORDER BY a.uer_sucursal_id),min(r.rol_codigo) INTO v_branches,v_role
    FROM public.sgrh_usuarios_empresa_rol a JOIN public.sgrh_cat_roles r ON r.rol_id=a.uer_rol_id
    WHERE a.uer_usuario_id=v_usr AND a.uer_empresa_id=p_empresa AND a.uer_activo;
  SELECT * INTO v_k FROM public.sgrh_kioscos WHERE kio_usuario_id=v_usr;
  v_operator:=v_role IS NOT NULL AND v_role<>'KIOSCO' AND v_k.kio_id IS NULL AND EXISTS (
    SELECT 1 FROM public.sgrh_usuarios_empresa_rol a
    JOIN public.sgrh_rol_permisos rp ON rp.rpe_rol_id=a.uer_rol_id
    JOIN public.sgrh_cat_permisos p ON p.per_id=rp.rpe_permiso_id
    WHERE a.uer_usuario_id=v_usr AND a.uer_empresa_id=p_empresa AND a.uer_activo AND p.per_codigo='ASISTENCIA_WRITE');
  IF v_operator THEN
    IF cardinality(v_branches)>0 AND array_position(v_branches,NULL) IS NULL AND NOT EXISTS (
      SELECT 1 FROM unnest(v_branches) b WHERE NOT EXISTS (
        SELECT 1 FROM public.sgrh_sucursales s WHERE s.suc_id=b AND s.suc_empresa_id=p_empresa AND s.suc_activa)) THEN
      RETURN jsonb_build_object('usr_id',v_usr,'sucursal_ids',v_branches,'kiosk_id',null,
        'kiosk_context',p_empresa||':operator:'||v_usr||':'||array_to_string(v_branches,','));
    END IF;
    RETURN jsonb_build_object('error','El encargado requiere sucursales activas asignadas para abrir el kiosco.');
  END IF;
  IF v_role IS DISTINCT FROM 'KIOSCO' OR cardinality(v_branches) IS DISTINCT FROM 1 OR v_branches[1] IS NULL THEN
    RETURN jsonb_build_object('error','El kiosco requiere una cuenta KIOSCO y una sola sucursal asignada.'); END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sgrh_cat_roles r JOIN public.sgrh_rol_permisos rp ON rp.rpe_rol_id=r.rol_id
    JOIN public.sgrh_cat_permisos p ON p.per_id=rp.rpe_permiso_id WHERE r.rol_codigo='KIOSCO' AND p.per_codigo='ASISTENCIA_KIOSCO') THEN
    RETURN jsonb_build_object('error','La cuenta KIOSCO ya no tiene permiso para marcar.'); END IF;
  PERFORM 1 FROM public.sgrh_sucursales WHERE suc_id=v_branches[1] AND suc_empresa_id=p_empresa AND suc_activa;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','La sucursal del kiosco no está activa.'); END IF;
  IF v_k.kio_id IS NOT NULL AND (v_k.kio_estado<>'activo' OR v_k.kio_empresa_id<>p_empresa OR v_k.kio_sucursal_id<>v_branches[1]) THEN
    RETURN jsonb_build_object('error','El kiosco está bloqueado o su asignación cambió. Avisá al encargado.'); END IF;
  -- A managed kiosk whose session was closed (password change) stops here,
  -- even while its access token has not expired yet. The server always sends
  -- the session of the JWT; NULL only comes from code deployed before SGRH-111.
  IF v_k.kio_id IS NOT NULL AND p_session IS NOT NULL AND NOT sgrh_private.auth_session_exists(p_session) THEN
    RETURN jsonb_build_object('error','La sesión del kiosco se cerró. Iniciá sesión de nuevo.'); END IF;
  IF v_k.kio_id IS NOT NULL THEN
    UPDATE public.sgrh_kioscos SET kio_ultima_actividad=now() WHERE kio_id=v_k.kio_id
      AND (kio_ultima_actividad IS NULL OR kio_ultima_actividad<now()-interval '1 minute');
  END IF;
  RETURN jsonb_build_object('usr_id',v_usr,'sucursal_ids',v_branches,'kiosk_id',v_k.kio_id,
    'kiosk_context',p_empresa||':'||v_branches[1]||':'||coalesce(v_k.kio_id::text,'legacy')||':'||coalesce(v_k.kio_version,0));
END $$;

REVOKE ALL ON FUNCTION public.sgrh_manage_kiosk(uuid,int,text,uuid,jsonb),
  public.sgrh_kiosk_context(uuid,int,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_manage_kiosk(uuid,int,text,uuid,jsonb),
  public.sgrh_kiosk_context(uuid,int,uuid) TO service_role;
COMMIT;
