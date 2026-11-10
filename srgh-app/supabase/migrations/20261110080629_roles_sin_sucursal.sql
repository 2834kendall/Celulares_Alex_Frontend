-- Los roles dejan de atarse a una sucursal.
--
-- Las migraciones anteriores de esta rama permitían limitar un rol a una tienda
-- (rol_sucursal_id) y crear «versiones» de un rol por tienda (rol_base_id y
-- sgrh_customize_role_for_branch). En un negocio donde el personal rota entre
-- tiendas eso no aporta y complica: hasta dónde ve cada cuenta ya lo decide la
-- sucursal de la cuenta (uer_sucursal_id), no el rol.
--
-- Se quitan las dos columnas y la RPC de versiones, y se reescriben sin ellas
-- instanciar_roles_empresa, sgrh_save_role (pierde p_sucursal), sgrh_delete_role
-- y el trigger uer_rol_empresa. Los roles que estuvieran atados a una sucursal
-- NO se borran ni pierden cuentas ni permisos: pasan a ser roles comunes de la
-- empresa, y quien administra decide después si los conserva.
--
-- Va aparte de 20261110050239_roles_por_empresa_copias.sql porque esa ya está
-- aplicada: un archivo aplicado no se edita (db push no lo vuelve a correr).
-- Los datos ya se repartieron ahí; esta no los toca salvo al borrar columnas.
BEGIN;

-- ─── 1. Instanciar los roles de una empresa ──────────────────────────────────
-- Copia cada plantilla que la empresa necesita: las activas, y las inactivas
-- que la empresa ya usa (tiene cuentas con ella). Pasa a la copia TODAS las
-- asignaciones de esa empresa con la plantilla (vigentes e históricas).
-- Re-ejecutable: si la copia ya existe no la vuelve a crear. Devuelve cuántas
-- copias creó.
CREATE OR REPLACE FUNCTION sgrh_private.instanciar_roles_empresa(p_empresa int)
RETURNS int LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_plantilla public.sgrh_cat_roles; v_codigo text; v_nombre text; v_id int; v_creados int := 0;
BEGIN
  FOR v_plantilla IN
    SELECT r.* FROM public.sgrh_cat_roles r
    WHERE r.rol_empresa_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.sgrh_rol_permisos rp
        JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
        WHERE rp.rpe_rol_id = r.rol_id AND p.per_codigo = 'ASISTENCIA_KIOSCO')
      AND (r.rol_activo
        OR EXISTS (SELECT 1 FROM public.sgrh_usuarios_empresa_rol a
                   WHERE a.uer_rol_id = r.rol_id AND a.uer_empresa_id = p_empresa))
    ORDER BY r.rol_id
  LOOP
    v_codigo := 'EMPRESA_' || p_empresa || '_' || v_plantilla.rol_codigo;
    SELECT rol_id INTO v_id FROM public.sgrh_cat_roles WHERE rol_codigo = v_codigo;
    IF NOT FOUND THEN
      -- Un rol propio de la empresa ya podía llamarse como una plantilla
      -- inactiva: la copia lleva una marca para no chocar con el índice único.
      v_nombre := v_plantilla.rol_nombre;
      IF EXISTS (
        SELECT 1 FROM public.sgrh_cat_roles
        WHERE rol_empresa_id = p_empresa AND rol_activo
          AND lower(trim(rol_nombre)) = lower(trim(v_nombre))
      ) THEN
        v_nombre := left(v_plantilla.rol_nombre, 49) || ' (original)';
      END IF;

      INSERT INTO public.sgrh_cat_roles (rol_codigo, rol_nombre, rol_descripcion, rol_activo,
        rol_empresa_id, rol_updated_at)
      VALUES (v_codigo, v_nombre, v_plantilla.rol_descripcion, true, p_empresa, now())
      RETURNING rol_id INTO v_id;

      INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
      SELECT DISTINCT v_id, rp.rpe_permiso_id
      FROM public.sgrh_rol_permisos rp
      WHERE rp.rpe_rol_id = v_plantilla.rol_id;

      v_creados := v_creados + 1;
    END IF;

    UPDATE public.sgrh_usuarios_empresa_rol SET uer_rol_id = v_id
    WHERE uer_empresa_id = p_empresa AND uer_rol_id = v_plantilla.rol_id;
  END LOOP;
  RETURN v_creados;
END $$;
REVOKE ALL ON FUNCTION sgrh_private.instanciar_roles_empresa(int) FROM PUBLIC, anon, authenticated;

-- ─── 2. RPC: crear / editar rol (solo roles de la empresa) ───────────────────
-- La firma pierde p_sucursal: se elimina la anterior para que no queden dos.
DROP FUNCTION IF EXISTS public.sgrh_save_role(uuid, int, int, text, text, int, text[]);
CREATE OR REPLACE FUNCTION public.sgrh_save_role(
  p_actor uuid, p_empresa int, p_id int, p_nombre text, p_descripcion text, p_permisos text[]
) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_rol_actor int; v_perms_actor text[];
  v_id int; v_previos text[] := '{}';
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
    -- Solo roles vigentes de esta empresa. Las plantillas y el rol del kiosco
    -- no son de ninguna empresa y no se editan desde la app.
    SELECT rol_id INTO v_id
    FROM public.sgrh_cat_roles
    WHERE rol_id = p_id AND rol_empresa_id = p_empresa AND rol_activo
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Rol no encontrado.' USING ERRCODE = '42501';
    END IF;
    SELECT coalesce(array_agg(p.per_codigo), '{}') INTO v_previos
    FROM public.sgrh_rol_permisos rp JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
    WHERE rp.rpe_rol_id = v_id;
  END IF;

  -- Nombre único dentro de la empresa (las copias se llaman igual que su
  -- plantilla, así que las plantillas no cuentan).
  IF EXISTS (
    SELECT 1 FROM public.sgrh_cat_roles
    WHERE lower(trim(rol_nombre)) = lower(v_nombre)
      AND rol_id IS DISTINCT FROM p_id
      AND rol_empresa_id = p_empresa AND rol_activo
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

  -- El permiso del kiosco es exclusivo del rol del kiosco (cuenta de tablet).
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

  -- Nadie reparte lo que no tiene. MI_HORARIO_READ es la excepción: no amplía
  -- ninguna policy (solo muestra la pantalla "Mi horario"). Solo cuenta lo que
  -- se AGREGA: lo que el rol ya tenía se puede conservar o quitar.
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
      rol_empresa_id, rol_updated_at)
    VALUES ('EMPRESA_' || p_empresa || '_' || md5(random()::text || clock_timestamp()::text),
            v_nombre, v_desc, true, p_empresa, now())
    RETURNING rol_id INTO v_id;
    UPDATE public.sgrh_cat_roles SET rol_codigo = 'EMPRESA_' || p_empresa || '_' || v_id WHERE rol_id = v_id;
  ELSE
    UPDATE public.sgrh_cat_roles
    SET rol_nombre = v_nombre, rol_descripcion = v_desc, rol_updated_at = now()
    WHERE rol_id = v_id;
  END IF;

  DELETE FROM public.sgrh_rol_permisos WHERE rpe_rol_id = v_id;
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT v_id, p.per_id FROM public.sgrh_cat_permisos p WHERE p.per_codigo = ANY (v_permisos);

  INSERT INTO public.sgrh_config_auditoria (aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'rol', v_id::text, CASE WHEN p_id IS NULL THEN 'crear' ELSE 'actualizar' END);
  RETURN v_id;
END $$;

-- ─── 3. Ya no hay versiones de un rol por sucursal ───────────────────────────
DROP FUNCTION IF EXISTS public.sgrh_customize_role_for_branch(uuid, int, int, int);

-- ─── 4. RPC: eliminar rol ────────────────────────────────────────────────────
-- Con usuarios activos se bloquea. Con asignaciones históricas se archiva (la
-- FK de esas filas impide borrarlo). Devuelve 'eliminado' o 'archivado'.
CREATE OR REPLACE FUNCTION public.sgrh_delete_role(p_actor uuid, p_empresa int, p_id int)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_activos int; v_resultado text;
BEGIN
  v_usr := public.sgrh_assert_roles_admin(p_actor, p_empresa);
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  PERFORM 1 FROM public.sgrh_cat_roles
  WHERE rol_id = p_id AND rol_empresa_id = p_empresa AND rol_activo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rol no encontrado.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO v_activos FROM public.sgrh_usuarios_empresa_rol
  WHERE uer_rol_id = p_id AND uer_activo;
  IF v_activos > 0 THEN
    RAISE EXCEPTION 'El rol tiene % usuario(s) activo(s). Asignales otro rol antes de eliminarlo.', v_activos
      USING ERRCODE = '23514';
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

REVOKE ALL ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sgrh_delete_role(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sgrh_delete_role(uuid, int, int) TO service_role;

-- ─── 5. Un usuario solo recibe roles de SU empresa ───────────────────────────
-- Igual que antes (otra empresa, archivado) y además: si la
-- empresa ya tiene su copia de una plantilla, la plantilla no se asigna — se
-- elige la copia. Una plantilla sin copia sí (seeds y empresas que todavía no
-- se instanciaron), y el rol del kiosco nunca tiene copia.
CREATE OR REPLACE FUNCTION sgrh_private.check_rol_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_empresa int; v_activo boolean; v_codigo text;
BEGIN
  SELECT rol_empresa_id, rol_activo, rol_codigo
    INTO v_empresa, v_activo, v_codigo
  FROM public.sgrh_cat_roles WHERE rol_id = NEW.uer_rol_id;
  IF v_empresa IS NULL THEN
    IF (TG_OP = 'INSERT' OR NEW.uer_rol_id IS DISTINCT FROM OLD.uer_rol_id
        OR NEW.uer_empresa_id IS DISTINCT FROM OLD.uer_empresa_id)
      AND EXISTS (SELECT 1 FROM public.sgrh_cat_roles
                  WHERE rol_codigo = 'EMPRESA_' || NEW.uer_empresa_id || '_' || v_codigo) THEN
      RAISE EXCEPTION 'Tu empresa tiene su propia copia de ese rol: elegí esa.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF v_empresa IS DISTINCT FROM NEW.uer_empresa_id THEN
    RAISE EXCEPTION 'Ese rol pertenece a otra empresa.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_activo AND NEW.uer_activo
    AND (TG_OP = 'INSERT' OR NEW.uer_rol_id IS DISTINCT FROM OLD.uer_rol_id OR NOT OLD.uer_activo) THEN
    RAISE EXCEPTION 'Ese rol fue eliminado: elegí otro.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sgrh_private.check_rol_empresa() FROM PUBLIC, anon, authenticated;

-- ─── 6. Los roles ya no se atan a una sucursal ───────────────────────────────
-- Sin CASCADE a propósito: con las columnas se van sus índices, sus FK y el
-- CHECK sgrh_cat_roles_sucursal_propia; si algo más dependiera de ellas, la
-- migración tiene que fallar en vez de llevárselo por delante.
ALTER TABLE public.sgrh_cat_roles
  DROP COLUMN IF EXISTS rol_base_id,
  DROP COLUMN IF EXISTS rol_sucursal_id;

-- ─── 7. Documentación ────────────────────────────────────────────────────────
COMMENT ON COLUMN public.sgrh_cat_roles.rol_empresa_id IS
  'Con valor = rol de esa empresa (copia de una plantilla o creado en Configuración), administrado por sgrh_save_role / sgrh_delete_role. NULL = plantilla del sistema: siembra empresas nuevas (sgrh_private.instanciar_roles_empresa) y no se edita desde la app; el rol con ASISTENCIA_KIOSCO es la única plantilla que se asigna tal cual.';
COMMENT ON FUNCTION sgrh_private.instanciar_roles_empresa(int) IS
  'Copia a la empresa las plantillas que necesita (las activas y las que ya usa) y le pasa sus asignaciones. Re-ejecutable. Llamarla al dar de alta una empresa.';
COMMENT ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, text[]) IS
  'Crea (p_id NULL) o edita un rol de la empresa y reemplaza sus permisos. Revalida ROLES_WRITE en vivo, dependencias, que el actor no agregue lo que no tiene y que no se quite ROLES_WRITE a sí mismo.';
COMMENT ON FUNCTION public.sgrh_delete_role(uuid, int, int) IS
  'Elimina un rol de la empresa. Con usuarios activos se bloquea; con asignaciones históricas se archiva. Devuelve eliminado|archivado.';

COMMIT;
