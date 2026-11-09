-- Roles del sistema editables.
--
-- Hasta acá los roles del sistema (ADMIN, GERENTE, EMPLEADO y los demás sin
-- empresa) eran de solo lectura desde la app: se cambiaban por migración.
-- Ahora quien tiene ROLES_WRITE también los edita (nombre, descripción y
-- permisos) desde Configuración → Roles y permisos.
--
-- OJO: un rol del sistema lo comparten TODAS las empresas. Editarlo cambia
-- los permisos de su gente en todas ellas (la pantalla lo avisa). Para un
-- cambio solo en una sucursal está sgrh_customize_role_for_branch.
--
-- Se mantiene:
--   - KIOSCO no se edita (cuenta de tablet con su permiso especial);
--   - los del sistema no se eliminan ni se limitan a una sucursal (el código
--     los busca por rol_codigo);
--   - dependencias, que nadie se quite ROLES_WRITE a sí mismo, y que nadie
--     AGREGUE permisos que su propio rol no tiene (lo que el rol ya traía se
--     puede conservar o quitar).
BEGIN;

CREATE OR REPLACE FUNCTION public.sgrh_save_role(
  p_actor uuid, p_empresa int, p_id int, p_nombre text, p_descripcion text,
  p_sucursal int, p_permisos text[]
) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_rol_actor int; v_perms_actor text[];
  v_id int; v_sucursal_actual int; v_sistema boolean := false; v_previos text[] := '{}';
  v_nombre text; v_desc text; v_permisos text[]; v_faltan text;
BEGIN
  SELECT x.usr_id, x.rol_id, x.permisos INTO v_usr, v_rol_actor, v_perms_actor
  FROM sgrh_private.permisos_actor(p_actor, p_empresa) x;
  IF v_usr IS NULL OR NOT ('ROLES_WRITE' = ANY (v_perms_actor)) THEN
    RAISE EXCEPTION 'No tenés permiso para administrar roles.' USING ERRCODE = '42501';
  END IF;

  -- Serializa el chequeo de nombre duplicado dentro de la empresa.
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  v_nombre := trim(coalesce(p_nombre, ''));
  IF length(v_nombre) NOT BETWEEN 2 AND 60 THEN
    RAISE EXCEPTION 'El nombre del rol debe tener entre 2 y 60 caracteres.' USING ERRCODE = '23514';
  END IF;
  v_desc := nullif(trim(coalesce(p_descripcion, '')), '');
  IF length(v_desc) > 200 THEN
    RAISE EXCEPTION 'La descripción no puede pasar de 200 caracteres.' USING ERRCODE = '23514';
  END IF;

  IF p_id IS NOT NULL THEN
    -- Propios de la empresa, o del sistema (salvo KIOSCO, que es la cuenta
    -- de la tablet y depende de su permiso especial).
    SELECT rol_id, rol_sucursal_id, rol_empresa_id IS NULL
      INTO v_id, v_sucursal_actual, v_sistema
    FROM public.sgrh_cat_roles
    WHERE rol_id = p_id
      AND ((rol_empresa_id = p_empresa AND rol_activo)
        OR (rol_empresa_id IS NULL AND rol_codigo <> 'KIOSCO'))
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rol no encontrado.' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(array_agg(p.per_codigo), '{}') INTO v_previos
    FROM public.sgrh_rol_permisos rp JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
    WHERE rp.rpe_rol_id = v_id;
  END IF;

  -- Un rol del sistema es de todas las empresas: no se limita a una sucursal
  -- (para eso está «Personalizar para esta sucursal»).
  IF v_sistema AND p_sucursal IS NOT NULL THEN
    RAISE EXCEPTION 'Un rol del sistema no se limita a una sucursal. Personalizalo para esa sucursal.'
      USING ERRCODE = '23514';
  END IF;

  -- Sucursal: de la empresa y activa (o la que el rol ya tenía).
  IF p_sucursal IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = p_sucursal AND suc_empresa_id = p_empresa
      AND (suc_activa OR suc_id IS NOT DISTINCT FROM v_sucursal_actual)
  ) THEN
    RAISE EXCEPTION 'Elegí una sucursal activa de tu empresa.' USING ERRCODE = '23514';
  END IF;

  -- Cambiar la sucursal de un rol en uso dejaría cuentas de otra tienda con
  -- un rol que ya no les corresponde.
  IF v_id IS NOT NULL AND p_sucursal IS NOT NULL
    AND p_sucursal IS DISTINCT FROM v_sucursal_actual AND EXISTS (
      SELECT 1 FROM public.sgrh_usuarios_empresa_rol
      WHERE uer_rol_id = v_id AND uer_activo AND uer_sucursal_id IS DISTINCT FROM p_sucursal
  ) THEN
    RAISE EXCEPTION 'Hay usuarios de otra sucursal con este rol. Reasignalos antes de limitarlo a una sucursal.'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.sgrh_cat_roles
    WHERE lower(trim(rol_nombre)) = lower(v_nombre)
      AND rol_id IS DISTINCT FROM p_id
      AND ((rol_empresa_id = p_empresa AND rol_activo) OR (rol_empresa_id IS NULL AND rol_activo))
  ) THEN
    RAISE EXCEPTION 'Ya existe un rol con ese nombre.' USING ERRCODE = '23514';
  END IF;

  SELECT coalesce(array_agg(DISTINCT c), '{}') INTO v_permisos
  FROM unnest(coalesce(p_permisos, '{}')) c;

  -- Códigos que existen en el catálogo.
  SELECT string_agg(c, ', ') INTO v_faltan FROM unnest(v_permisos) c
  WHERE NOT EXISTS (SELECT 1 FROM public.sgrh_cat_permisos WHERE per_codigo = c);
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Permisos desconocidos: %.', v_faltan USING ERRCODE = '23514';
  END IF;

  -- El permiso del kiosco es exclusivo del rol KIOSCO (cuenta de tablet).
  IF 'ASISTENCIA_KIOSCO' = ANY (v_permisos) THEN
    RAISE EXCEPTION 'El permiso del kiosco no se asigna a otros roles.' USING ERRCODE = '23514';
  END IF;

  -- Dependencias: escribir/aprobar exige poder ver.
  SELECT string_agg(DISTINCT r.permiso || ' requiere ' || r.requiere, '; ') INTO v_faltan
  FROM sgrh_private.permiso_requisitos() r
  WHERE r.permiso = ANY (v_permisos) AND NOT (r.requiere = ANY (v_permisos));
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'Faltan permisos requeridos: %.', v_faltan USING ERRCODE = '23514';
  END IF;

  -- Nadie reparte lo que no tiene: sin esto, un ROLES_WRITE se fabricaba un
  -- rol con todo y se lo asignaba. MI_HORARIO_READ es la excepción: no amplía
  -- ninguna policy (solo muestra la pantalla "Mi horario").
  -- Solo cuenta lo que se AGREGA: lo que el rol ya tenía no es una escalada.
  SELECT string_agg(c, ', ') INTO v_faltan FROM unnest(v_permisos) c
  WHERE c <> 'MI_HORARIO_READ' AND NOT (c = ANY (v_perms_actor)) AND NOT (c = ANY (v_previos));
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'No podés otorgar permisos que tu propio rol no tiene: %.', v_faltan USING ERRCODE = '42501';
  END IF;

  -- No dejarse afuera: quien edita su propio rol no puede quitarle ROLES_WRITE.
  IF p_id IS NOT NULL AND p_id = v_rol_actor AND NOT ('ROLES_WRITE' = ANY (v_permisos)) THEN
    RAISE EXCEPTION 'No podés quitarle «Administrar roles y permisos» a tu propio rol.' USING ERRCODE = '23514';
  END IF;

  IF v_id IS NULL THEN
    -- Código provisional único; se fija con el id recién generado.
    INSERT INTO public.sgrh_cat_roles (rol_codigo, rol_nombre, rol_descripcion, rol_activo,
      rol_empresa_id, rol_sucursal_id, rol_updated_at)
    VALUES ('EMPRESA_' || p_empresa || '_' || md5(random()::text || clock_timestamp()::text),
            v_nombre, v_desc, true, p_empresa, p_sucursal, now())
    RETURNING rol_id INTO v_id;
    UPDATE public.sgrh_cat_roles SET rol_codigo = 'EMPRESA_' || p_empresa || '_' || v_id WHERE rol_id = v_id;
  ELSE
    UPDATE public.sgrh_cat_roles
    SET rol_nombre = v_nombre, rol_descripcion = v_desc,
        rol_sucursal_id = CASE WHEN v_sistema THEN NULL ELSE p_sucursal END,
        rol_updated_at = now()
    WHERE rol_id = v_id;
  END IF;

  DELETE FROM public.sgrh_rol_permisos WHERE rpe_rol_id = v_id;
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT v_id, p.per_id FROM public.sgrh_cat_permisos p WHERE p.per_codigo = ANY (v_permisos);

  INSERT INTO public.sgrh_config_auditoria (aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'rol', v_id::text,
          CASE WHEN p_id IS NULL THEN 'crear' WHEN v_sistema THEN 'actualizar_sistema' ELSE 'actualizar' END);
  RETURN v_id;
END $$;

COMMENT ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) IS
  'Crea (p_id NULL) o edita un rol propio de la empresa o uno del sistema (salvo KIOSCO) y reemplaza sus permisos. Un rol del sistema afecta a todas las empresas. Revalida ROLES_WRITE en vivo, dependencias, que el actor no agregue lo que no tiene y que no se quite ROLES_WRITE a sí mismo.';

COMMIT;
