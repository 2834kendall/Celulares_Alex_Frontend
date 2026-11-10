-- Personalizar un rol para una sucursal.
--
-- Los roles del sistema (y los propios de toda la empresa) no se editan por
-- sucursal directamente: «Personalizar para <sucursal>» crea la versión de
-- esa sucursal — un rol propio con los mismos permisos y `rol_base_id`
-- apuntando al original — y pasa a ella las cuentas de esa sucursal que
-- tenían el rol base. Desde ahí se edita como cualquier rol propio, sin tocar
-- a las demás tiendas.
--
-- Cuentas con varias sucursales (o de toda la empresa) NO se mueven: el hook
-- del JWT asume un solo rol por cuenta y esas cuentas también trabajan en
-- otras tiendas. Se informan como omitidas.
--
-- Al eliminar una versión de sucursal, sus cuentas vuelven al rol base en vez
-- de bloquear la eliminación.
BEGIN;

ALTER TABLE public.sgrh_cat_roles
  ADD COLUMN IF NOT EXISTS rol_base_id int REFERENCES public.sgrh_cat_roles(rol_id);

CREATE INDEX IF NOT EXISTS sgrh_cat_roles_base_idx ON public.sgrh_cat_roles (rol_base_id);

-- Una sola versión vigente por rol base y sucursal.
CREATE UNIQUE INDEX IF NOT EXISTS sgrh_cat_roles_base_sucursal_key
  ON public.sgrh_cat_roles (rol_base_id, rol_sucursal_id)
  WHERE rol_base_id IS NOT NULL AND rol_activo;

-- ─── RPC: personalizar ───────────────────────────────────────────────────────
-- Devuelve {id, creado, movidos, omitidos}. Si la versión de esa sucursal ya
-- existe, no crea nada: devuelve su id (creado = false) para abrirla.
CREATE OR REPLACE FUNCTION public.sgrh_customize_role_for_branch(
  p_actor uuid, p_empresa int, p_rol_base int, p_sucursal int
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_base public.sgrh_cat_roles; v_suc_nombre text; v_id int;
  v_nombre text; v_movidos int := 0; v_omitidos int := 0;
BEGIN
  v_usr := public.sgrh_assert_roles_admin(p_actor, p_empresa);
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  SELECT * INTO v_base FROM public.sgrh_cat_roles
  WHERE rol_id = p_rol_base
    AND rol_codigo <> 'KIOSCO'
    AND ((rol_empresa_id IS NULL)
      OR (rol_empresa_id = p_empresa AND rol_sucursal_id IS NULL AND rol_activo));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese rol no se puede personalizar por sucursal.' USING ERRCODE = '23514';
  END IF;

  SELECT suc_nombre INTO v_suc_nombre FROM public.sgrh_sucursales
  WHERE suc_id = p_sucursal AND suc_empresa_id = p_empresa AND suc_activa;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Elegí una sucursal activa de tu empresa.' USING ERRCODE = '23514';
  END IF;

  SELECT rol_id INTO v_id FROM public.sgrh_cat_roles
  WHERE rol_base_id = p_rol_base AND rol_sucursal_id = p_sucursal
    AND rol_empresa_id = p_empresa AND rol_activo;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_id, 'creado', false, 'movidos', 0, 'omitidos', 0);
  END IF;

  v_nombre := left(v_base.rol_nombre || ' · ' || v_suc_nombre, 60);
  IF EXISTS (
    SELECT 1 FROM public.sgrh_cat_roles
    WHERE lower(trim(rol_nombre)) = lower(trim(v_nombre)) AND rol_activo
      AND (rol_empresa_id = p_empresa OR rol_empresa_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Ya existe un rol llamado «%». Renombralo antes de personalizar.', v_nombre
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.sgrh_cat_roles (rol_codigo, rol_nombre, rol_descripcion, rol_activo,
    rol_empresa_id, rol_sucursal_id, rol_base_id, rol_updated_at)
  VALUES ('EMPRESA_' || p_empresa || '_' || md5(random()::text || clock_timestamp()::text),
          v_nombre, v_base.rol_descripcion, true, p_empresa, p_sucursal, p_rol_base, now())
  RETURNING rol_id INTO v_id;
  UPDATE public.sgrh_cat_roles SET rol_codigo = 'EMPRESA_' || p_empresa || '_' || v_id WHERE rol_id = v_id;

  -- Mismos permisos que el base. No es una escalada: las cuentas que pasan a
  -- la copia ya los tenían con el rol base. El del kiosco nunca se copia.
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT DISTINCT v_id, rp.rpe_permiso_id
  FROM public.sgrh_rol_permisos rp
  JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
  WHERE rp.rpe_rol_id = p_rol_base AND p.per_codigo <> 'ASISTENCIA_KIOSCO';

  -- Cuentas que trabajan SOLO en esa sucursal con el rol base.
  WITH candidatas AS (
    SELECT a.uer_usuario_id,
      bool_and(a.uer_sucursal_id IS NOT DISTINCT FROM p_sucursal) AS solo_esta
    FROM public.sgrh_usuarios_empresa_rol a
    WHERE a.uer_empresa_id = p_empresa AND a.uer_activo AND a.uer_rol_id = p_rol_base
      AND a.uer_usuario_id IN (
        SELECT uer_usuario_id FROM public.sgrh_usuarios_empresa_rol
        WHERE uer_empresa_id = p_empresa AND uer_activo AND uer_rol_id = p_rol_base
          AND uer_sucursal_id = p_sucursal)
    GROUP BY a.uer_usuario_id
  ), movidas AS (
    UPDATE public.sgrh_usuarios_empresa_rol a SET uer_rol_id = v_id
    FROM candidatas c
    WHERE c.solo_esta AND a.uer_usuario_id = c.uer_usuario_id
      AND a.uer_empresa_id = p_empresa AND a.uer_activo AND a.uer_rol_id = p_rol_base
    RETURNING a.uer_usuario_id
  )
  SELECT (SELECT count(DISTINCT uer_usuario_id) FROM movidas),
         (SELECT count(*) FROM candidatas WHERE NOT solo_esta)
  INTO v_movidos, v_omitidos;

  INSERT INTO public.sgrh_config_auditoria (aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'rol', v_id::text, 'personalizar_sucursal');

  RETURN jsonb_build_object('id', v_id, 'creado', true, 'movidos', v_movidos, 'omitidos', v_omitidos);
END $$;

-- ─── Eliminar: una versión de sucursal devuelve sus cuentas al rol base ───────
CREATE OR REPLACE FUNCTION public.sgrh_delete_role(p_actor uuid, p_empresa int, p_id int)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_usr int; v_activos int; v_base int; v_base_ok boolean; v_resultado text;
BEGIN
  v_usr := public.sgrh_assert_roles_admin(p_actor, p_empresa);
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  SELECT rol_base_id INTO v_base FROM public.sgrh_cat_roles
  WHERE rol_id = p_id AND rol_empresa_id = p_empresa AND rol_activo FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM public.sgrh_cat_roles WHERE rol_id = p_id AND rol_empresa_id IS NULL) THEN
      RAISE EXCEPTION 'Los roles del sistema no se eliminan.' USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Rol no encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_activos FROM public.sgrh_usuarios_empresa_rol
  WHERE uer_rol_id = p_id AND uer_activo;

  IF v_activos > 0 THEN
    -- El base sigue sirviendo si es del sistema, o propio y vigente.
    SELECT (rol_empresa_id IS NULL OR rol_activo) INTO v_base_ok
    FROM public.sgrh_cat_roles WHERE rol_id = v_base;
    IF v_base IS NULL OR NOT coalesce(v_base_ok, false) THEN
      RAISE EXCEPTION 'El rol tiene % usuario(s) activo(s). Asignales otro rol antes de eliminarlo.', v_activos
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sgrh_usuarios_empresa_rol SET uer_rol_id = v_base
    WHERE uer_rol_id = p_id AND uer_activo;
  END IF;

  IF EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol WHERE uer_rol_id = p_id) THEN
    UPDATE public.sgrh_cat_roles SET rol_activo = false, rol_updated_at = now() WHERE rol_id = p_id;
    v_resultado := 'archivado';
  ELSE
    DELETE FROM public.sgrh_rol_permisos WHERE rpe_rol_id = p_id;
    DELETE FROM public.sgrh_cat_roles WHERE rol_id = p_id;
    v_resultado := 'eliminado';
  END IF;

  INSERT INTO public.sgrh_config_auditoria (aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'rol', p_id::text, 'eliminar');
  RETURN v_resultado;
END $$;

REVOKE ALL ON FUNCTION public.sgrh_customize_role_for_branch(uuid, int, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_customize_role_for_branch(uuid, int, int, int) TO service_role;
REVOKE ALL ON FUNCTION public.sgrh_delete_role(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_delete_role(uuid, int, int) TO service_role;

COMMENT ON COLUMN public.sgrh_cat_roles.rol_base_id IS
  'En la versión de sucursal de un rol (creada con sgrh_customize_role_for_branch): el rol del que salió. Al eliminarla, sus cuentas vuelven a él.';
COMMENT ON FUNCTION public.sgrh_customize_role_for_branch(uuid, int, int, int) IS
  'Crea la versión de una sucursal de un rol (mismos permisos) y le pasa las cuentas que trabajan solo en esa sucursal con el rol base. Idempotente: si ya existe, devuelve su id.';
COMMENT ON FUNCTION public.sgrh_delete_role(uuid, int, int) IS
  'Elimina un rol propio. Una versión de sucursal devuelve sus cuentas al rol base; otro rol con usuarios activos se bloquea. Con asignaciones históricas se archiva. Devuelve eliminado|archivado.';

COMMIT;
