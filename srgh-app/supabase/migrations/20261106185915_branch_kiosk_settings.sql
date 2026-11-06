-- SGRH-103: branch management and revocable logical kiosks.
BEGIN;
CREATE TABLE public.sgrh_kioscos (
  kio_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kio_empresa_id int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  kio_sucursal_id int NOT NULL REFERENCES public.sgrh_sucursales(suc_id),
  kio_nombre text NOT NULL CHECK (length(trim(kio_nombre)) BETWEEN 2 AND 80),
  kio_email text NOT NULL UNIQUE CHECK (kio_email=lower(trim(kio_email))),
  kio_usuario_id int UNIQUE REFERENCES public.sgrh_usuarios(usr_id),
  kio_estado text NOT NULL DEFAULT 'pendiente' CHECK (kio_estado IN ('pendiente','activo','bloqueado')),
  kio_version int NOT NULL DEFAULT 1,
  kio_ultima_actividad timestamptz,
  kio_created_at timestamptz NOT NULL DEFAULT now(),
  kio_updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kio_estado <> 'activo' OR kio_usuario_id IS NOT NULL)
);
CREATE INDEX ON public.sgrh_kioscos(kio_empresa_id,kio_sucursal_id);
CREATE INDEX ON public.sgrh_kioscos(kio_sucursal_id);
CREATE TABLE public.sgrh_config_auditoria (
  aud_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  aud_empresa_id int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  aud_usuario_id int NOT NULL REFERENCES public.sgrh_usuarios(usr_id),
  aud_entidad text NOT NULL,
  aud_referencia text NOT NULL,
  aud_accion text NOT NULL,
  aud_created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.sgrh_config_auditoria(aud_empresa_id,aud_created_at DESC);
CREATE INDEX ON public.sgrh_config_auditoria(aud_usuario_id);
ALTER TABLE public.sgrh_kioscos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sgrh_config_auditoria ENABLE ROW LEVEL SECURITY;
CREATE POLICY kioscos_service ON public.sgrh_kioscos TO service_role USING (true) WITH CHECK (true);
CREATE POLICY config_auditoria_service ON public.sgrh_config_auditoria TO service_role USING (true) WITH CHECK (true);
-- No client writes: each service-only RPC revalidates the acting administrator.
REVOKE ALL ON public.sgrh_kioscos, public.sgrh_config_auditoria FROM anon,authenticated;
GRANT ALL ON public.sgrh_kioscos, public.sgrh_config_auditoria TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.sgrh_config_auditoria_aud_id_seq TO service_role;

CREATE FUNCTION public.sgrh_assert_branch_admin(p_actor uuid,p_empresa int,p_kioscos boolean DEFAULT false)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int;
BEGIN
  SELECT u.usr_id INTO v_usr FROM public.sgrh_usuarios u
  WHERE u.usr_auth_id=p_actor AND u.usr_activo AND EXISTS (
    SELECT 1 FROM public.sgrh_usuarios_empresa_rol a
    JOIN public.sgrh_rol_permisos rp ON rp.rpe_rol_id=a.uer_rol_id
    JOIN public.sgrh_cat_permisos p ON p.per_id=rp.rpe_permiso_id
    WHERE a.uer_usuario_id=u.usr_id AND a.uer_empresa_id=p_empresa AND a.uer_activo
      AND p.per_codigo='EMPRESAS_WRITE'
  ) AND (NOT p_kioscos OR EXISTS (
    SELECT 1 FROM public.sgrh_usuarios_empresa_rol a
    JOIN public.sgrh_rol_permisos rp ON rp.rpe_rol_id=a.uer_rol_id
    JOIN public.sgrh_cat_permisos p ON p.per_id=rp.rpe_permiso_id
    WHERE a.uer_usuario_id=u.usr_id AND a.uer_empresa_id=p_empresa AND a.uer_activo
      AND p.per_codigo='USUARIOS_WRITE'
  ));
  IF v_usr IS NULL THEN RAISE EXCEPTION 'No tenés permiso para administrar esta configuración.' USING ERRCODE='42501'; END IF;
  RETURN v_usr;
END $$;

CREATE FUNCTION public.sgrh_save_branch(p_actor uuid,p_empresa int,p_id int,p_data jsonb,p_direccion jsonb)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_id int; v_dir int; v_activa boolean;
BEGIN
  v_usr:=public.sgrh_assert_branch_admin(p_actor,p_empresa,false);
  -- Serialize duplicate-code checks per company without imposing a constraint
  -- on legacy duplicate codes until administrators have resolved them.
  PERFORM pg_advisory_xact_lock(103,p_empresa);
  IF length(trim(coalesce(p_data->>'suc_nombre',''))) NOT BETWEEN 2 AND 100
    OR coalesce((p_data->>'suc_radio_geocerca_metros')::int,0) NOT BETWEEN 1 AND 10000
    OR ((p_data->>'suc_latitud') IS NULL) <> ((p_data->>'suc_longitud') IS NULL)
    OR (p_data->>'suc_latitud')::numeric NOT BETWEEN -90 AND 90
    OR (p_data->>'suc_longitud')::numeric NOT BETWEEN -180 AND 180
  THEN RAISE EXCEPTION 'Revisá los datos de la sucursal.' USING ERRCODE='23514'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT suc_id,suc_direccion_id,suc_activa INTO v_id,v_dir,v_activa FROM public.sgrh_sucursales
    WHERE suc_id=p_id AND suc_empresa_id=p_empresa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal no encontrada.' USING ERRCODE='42501'; END IF;
  END IF;
  IF nullif(trim(p_data->>'suc_codigo_interno'),'') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sgrh_sucursales WHERE suc_empresa_id=p_empresa
      AND lower(trim(suc_codigo_interno))=lower(trim(p_data->>'suc_codigo_interno'))
      AND suc_id IS DISTINCT FROM p_id
  ) THEN RAISE EXCEPTION 'El código interno ya pertenece a otra sucursal.' USING ERRCODE='23514'; END IF;
  IF v_activa AND NOT coalesce((p_data->>'suc_activa')::boolean,true) THEN
    IF EXISTS (SELECT 1 FROM public.sgrh_historial_laboral WHERE lab_sucursal_id=p_id AND lab_fecha_fin IS NULL)
      OR EXISTS (SELECT 1 FROM public.sgrh_programacion_semanal WHERE prg_sucursal_id=p_id AND prg_fecha >= (now() AT TIME ZONE 'America/Costa_Rica')::date)
      OR EXISTS (SELECT 1 FROM (
        SELECT DISTINCT ON (mar_historial_laboral_id,mar_fecha_hora::date) mar_tipo
        FROM public.sgrh_marcas_asistencia WHERE mar_sucursal_id=p_id
          AND mar_fecha_hora::date >= (now() AT TIME ZONE 'America/Costa_Rica')::date-1
        ORDER BY mar_historial_laboral_id,mar_fecha_hora::date,mar_fecha_hora DESC,mar_id DESC
      ) jornadas WHERE mar_tipo<>'salida')
      OR EXISTS (SELECT 1 FROM public.sgrh_kioscos WHERE kio_sucursal_id=p_id AND kio_estado<>'bloqueado')
    THEN RAISE EXCEPTION 'Antes de desactivar, resolvé contratos vigentes, jornadas abiertas y programación actual/futura; bloqueá sus kioscos.' USING ERRCODE='23514'; END IF;
  END IF;
  IF p_direccion IS NOT NULL AND p_direccion <> 'null'::jsonb THEN
    IF length(trim(coalesce(p_direccion->>'dir_senas_exactas',''))) NOT BETWEEN 10 AND 300 THEN
      RAISE EXCEPTION 'Completá las señas exactas de la dirección.' USING ERRCODE='23514'; END IF;
    -- Copy-on-write: legacy addresses may be referenced by more than one entity.
    IF v_dir IS NULL OR NOT EXISTS (SELECT 1 FROM public.sgrh_direcciones WHERE dir_id=v_dir
      AND dir_distrito_id=(p_direccion->>'dir_distrito_id')::int
      AND dir_senas_exactas=trim(p_direccion->>'dir_senas_exactas')) THEN
      INSERT INTO public.sgrh_direcciones(dir_distrito_id,dir_senas_exactas)
      VALUES ((p_direccion->>'dir_distrito_id')::int,trim(p_direccion->>'dir_senas_exactas')) RETURNING dir_id INTO v_dir;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.sgrh_sucursales(suc_empresa_id,suc_nombre) VALUES(p_empresa,trim(p_data->>'suc_nombre')) RETURNING suc_id INTO v_id;
  END IF;
  UPDATE public.sgrh_sucursales SET suc_nombre=trim(p_data->>'suc_nombre'),
    suc_codigo_interno=nullif(trim(p_data->>'suc_codigo_interno'),''),suc_telefono=nullif(trim(p_data->>'suc_telefono'),''),
    suc_email_sucursal=nullif(trim(p_data->>'suc_email_sucursal'),''),suc_latitud=(p_data->>'suc_latitud')::numeric,
    suc_longitud=(p_data->>'suc_longitud')::numeric,suc_radio_geocerca_metros=(p_data->>'suc_radio_geocerca_metros')::int,
    suc_activa=coalesce((p_data->>'suc_activa')::boolean,true),suc_direccion_id=v_dir WHERE suc_id=v_id;
  INSERT INTO public.sgrh_config_auditoria(aud_empresa_id,aud_usuario_id,aud_entidad,aud_referencia,aud_accion)
    VALUES(p_empresa,v_usr,'sucursal',v_id::text,CASE WHEN p_id IS NULL THEN 'crear' ELSE 'actualizar' END);
  RETURN v_id;
END $$;

CREATE FUNCTION public.sgrh_manage_kiosk(p_actor uuid,p_empresa int,p_action text,p_id uuid,p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_k public.sgrh_kioscos; v_branch int; v_target int; v_email text; v_role int;
BEGIN
  v_usr:=public.sgrh_assert_branch_admin(p_actor,p_empresa,true);
  PERFORM pg_advisory_xact_lock(103,p_empresa);
  IF p_action='crear' THEN
    v_branch:=(p_data->>'sucursal_id')::int;
    PERFORM 1 FROM public.sgrh_sucursales WHERE suc_id=v_branch AND suc_empresa_id=p_empresa AND suc_activa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Elegí una sucursal activa de tu empresa.' USING ERRCODE='23514'; END IF;
    IF length(trim(coalesce(p_data->>'nombre',''))) NOT BETWEEN 2 AND 80
      OR coalesce(p_data->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    THEN RAISE EXCEPTION 'Revisá el nombre y correo del kiosco.' USING ERRCODE='23514'; END IF;
    INSERT INTO public.sgrh_kioscos(kio_empresa_id,kio_sucursal_id,kio_nombre,kio_email)
      VALUES(p_empresa,v_branch,trim(p_data->>'nombre'),lower(trim(p_data->>'email'))) RETURNING * INTO v_k;
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

CREATE FUNCTION public.sgrh_kiosk_context(p_auth uuid,p_empresa int)
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
  IF v_k.kio_id IS NOT NULL THEN
    UPDATE public.sgrh_kioscos SET kio_ultima_actividad=now() WHERE kio_id=v_k.kio_id
      AND (kio_ultima_actividad IS NULL OR kio_ultima_actividad<now()-interval '1 minute');
  END IF;
  RETURN jsonb_build_object('usr_id',v_usr,'sucursal_ids',v_branches,'kiosk_id',v_k.kio_id,
    'kiosk_context',p_empresa||':'||v_branches[1]||':'||coalesce(v_k.kio_id::text,'legacy')||':'||coalesce(v_k.kio_version,0));
END $$;

REVOKE ALL ON FUNCTION public.sgrh_assert_branch_admin(uuid,int,boolean),public.sgrh_save_branch(uuid,int,int,jsonb,jsonb),
  public.sgrh_manage_kiosk(uuid,int,text,uuid,jsonb),public.sgrh_kiosk_context(uuid,int) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_assert_branch_admin(uuid,int,boolean),public.sgrh_save_branch(uuid,int,int,jsonb,jsonb),
  public.sgrh_manage_kiosk(uuid,int,text,uuid,jsonb),public.sgrh_kiosk_context(uuid,int) TO service_role;
COMMIT;
