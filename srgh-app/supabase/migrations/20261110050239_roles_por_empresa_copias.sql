-- Cada empresa tiene sus propios roles.
--
-- Los roles nacieron globales (una fila por rol, compartida por todas las
-- empresas y definida por seed). Ahora que se editan desde Configuración, cada
-- empresa recibe SU copia de los roles que usa (Administrador, Gerente,
-- Empleado…), con las mismas cuentas y los mismos permisos que tenía, y la
-- edita como cualquier rol propio sin tocar a las demás.
--
-- Modelo resultante:
--   - rol_empresa_id = X           → rol de la empresa X (copia o creado ahí).
--   - rol_base_id no nulo          → versión de una sucursal de otro rol de X.
--   - rol_empresa_id NULL          → PLANTILLA: sirve para sembrar una empresa
--     nueva (sgrh_private.instanciar_roles_empresa). No se edita ni se muestra
--     desde la app. La excepción es el rol con ASISTENCIA_KIOSCO (la cuenta de
--     la tablet), que sigue siendo del sistema y se asigna tal cual.
--
-- La copia de la plantilla P en la empresa X tiene el código
-- `EMPRESA_<X>_<código de P>`. Es solo identidad (para que instanciar sea
-- idempotente y para que el trigger sepa que la empresa ya tiene la suya),
-- nunca autorización: los permisos salen siempre de sgrh_rol_permisos.
--
-- Esta migración también reparte los datos existentes (instancia los roles de
-- todas las empresas), dentro de la misma transacción que cambia las RPC: las
-- RPC nuevas ya no editan plantillas, así que las cuentas tienen que estar en
-- sus copias en el mismo instante. Mismo criterio forward-only que
-- 20261106181220_biometria_permission_rollout.sql.
BEGIN;

-- ─── 1. Instanciar los roles de una empresa ──────────────────────────────────
-- Copia cada plantilla que la empresa necesita: las activas, y las inactivas
-- que la empresa ya usa (tiene cuentas con ella o versiones de sucursal que
-- salieron de ella). Pasa a la copia TODAS las asignaciones de esa empresa con
-- la plantilla (vigentes e históricas) y repunta sus versiones de sucursal.
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
                   WHERE a.uer_rol_id = r.rol_id AND a.uer_empresa_id = p_empresa)
        OR EXISTS (SELECT 1 FROM public.sgrh_cat_roles v
                   WHERE v.rol_base_id = r.rol_id AND v.rol_empresa_id = p_empresa))
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
        rol_empresa_id, rol_sucursal_id, rol_base_id, rol_updated_at)
      VALUES (v_codigo, v_nombre, v_plantilla.rol_descripcion, true, p_empresa, NULL, NULL, now())
      RETURNING rol_id INTO v_id;

      INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
      SELECT DISTINCT v_id, rp.rpe_permiso_id
      FROM public.sgrh_rol_permisos rp
      WHERE rp.rpe_rol_id = v_plantilla.rol_id;

      v_creados := v_creados + 1;
    END IF;

    UPDATE public.sgrh_usuarios_empresa_rol SET uer_rol_id = v_id
    WHERE uer_empresa_id = p_empresa AND uer_rol_id = v_plantilla.rol_id;

    UPDATE public.sgrh_cat_roles SET rol_base_id = v_id
    WHERE rol_empresa_id = p_empresa AND rol_base_id = v_plantilla.rol_id;
  END LOOP;
  RETURN v_creados;
END $$;
REVOKE ALL ON FUNCTION sgrh_private.instanciar_roles_empresa(int) FROM PUBLIC, anon, authenticated;

-- ─── 2. RPC: crear / editar rol (solo roles de la empresa) ───────────────────
CREATE OR REPLACE FUNCTION public.sgrh_save_role(
  p_actor uuid, p_empresa int, p_id int, p_nombre text, p_descripcion text,
  p_sucursal int, p_permisos text[]
) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_rol_actor int; v_perms_actor text[];
  v_id int; v_sucursal_actual int; v_base int; v_previos text[] := '{}';
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
    SELECT rol_id, rol_sucursal_id, rol_base_id INTO v_id, v_sucursal_actual, v_base
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

  -- Sucursal: de la empresa y activa (o la que el rol ya tenía).
  IF p_sucursal IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_sucursales
    WHERE suc_id = p_sucursal AND suc_empresa_id = p_empresa
      AND (suc_activa OR suc_id IS NOT DISTINCT FROM v_sucursal_actual)
  ) THEN
    RAISE EXCEPTION 'Elegí una sucursal activa de tu empresa.' USING ERRCODE = '23514';
  END IF;

  -- La versión de una sucursal pertenece a esa sucursal: al eliminarla, sus
  -- cuentas vuelven al rol original, y eso solo funciona en la misma tienda.
  IF v_base IS NOT NULL AND p_sucursal IS DISTINCT FROM v_sucursal_actual THEN
    RAISE EXCEPTION 'La sucursal de una versión no se cambia. Creá la versión de la otra sucursal desde el rol original.'
      USING ERRCODE = '23514';
  END IF;

  -- Un rol con versiones por sucursal sirve a toda la empresa: limitarlo a una
  -- dejaría a las versiones de las otras tiendas sin rol al que volver.
  IF v_id IS NOT NULL AND v_sucursal_actual IS NULL AND p_sucursal IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sgrh_cat_roles WHERE rol_base_id = v_id AND rol_activo
  ) THEN
    RAISE EXCEPTION 'Este rol tiene versiones por sucursal: no se puede limitar a una sola. Eliminá primero esas versiones.'
      USING ERRCODE = '23514';
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
      rol_empresa_id, rol_sucursal_id, rol_updated_at)
    VALUES ('EMPRESA_' || p_empresa || '_' || md5(random()::text || clock_timestamp()::text),
            v_nombre, v_desc, true, p_empresa, p_sucursal, now())
    RETURNING rol_id INTO v_id;
    UPDATE public.sgrh_cat_roles SET rol_codigo = 'EMPRESA_' || p_empresa || '_' || v_id WHERE rol_id = v_id;
  ELSE
    UPDATE public.sgrh_cat_roles
    SET rol_nombre = v_nombre, rol_descripcion = v_desc, rol_sucursal_id = p_sucursal, rol_updated_at = now()
    WHERE rol_id = v_id;
  END IF;

  DELETE FROM public.sgrh_rol_permisos WHERE rpe_rol_id = v_id;
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT v_id, p.per_id FROM public.sgrh_cat_permisos p WHERE p.per_codigo = ANY (v_permisos);

  INSERT INTO public.sgrh_config_auditoria (aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'rol', v_id::text, CASE WHEN p_id IS NULL THEN 'crear' ELSE 'actualizar' END);
  RETURN v_id;
END $$;

-- ─── 3. RPC: personalizar un rol para una sucursal ───────────────────────────
CREATE OR REPLACE FUNCTION public.sgrh_customize_role_for_branch(
  p_actor uuid, p_empresa int, p_rol_base int, p_sucursal int
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_perms_actor text[]; v_base public.sgrh_cat_roles; v_suc_nombre text; v_id int;
  v_nombre text; v_faltan text; v_movidos int := 0; v_omitidos int := 0;
BEGIN
  SELECT x.usr_id, x.permisos INTO v_usr, v_perms_actor
  FROM sgrh_private.permisos_actor(p_actor, p_empresa) x;
  IF v_usr IS NULL OR NOT ('ROLES_WRITE' = ANY (v_perms_actor)) THEN
    RAISE EXCEPTION 'No tenés permiso para administrar roles.' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  -- Solo un rol vigente de la empresa que sirva a toda ella (no una versión
  -- ni un rol ya limitado a una sucursal).
  SELECT * INTO v_base FROM public.sgrh_cat_roles
  WHERE rol_id = p_rol_base AND rol_empresa_id = p_empresa AND rol_activo
    AND rol_sucursal_id IS NULL AND rol_base_id IS NULL;
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

  -- Nadie reparte lo que no tiene: la versión nace con todos los permisos del
  -- rol original y queda en manos de quien la crea.
  SELECT string_agg(p.per_codigo, ', ' ORDER BY p.per_codigo) INTO v_faltan
  FROM public.sgrh_rol_permisos rp
  JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
  WHERE rp.rpe_rol_id = p_rol_base
    AND p.per_codigo <> 'MI_HORARIO_READ'
    AND NOT (p.per_codigo = ANY (v_perms_actor));
  IF v_faltan IS NOT NULL THEN
    RAISE EXCEPTION 'No podés personalizar un rol con permisos que tu propio rol no tiene: %.', v_faltan
      USING ERRCODE = '42501';
  END IF;

  v_nombre := left(v_base.rol_nombre || ' · ' || v_suc_nombre, 60);
  IF EXISTS (
    SELECT 1 FROM public.sgrh_cat_roles
    WHERE lower(trim(rol_nombre)) = lower(trim(v_nombre)) AND rol_activo
      AND rol_empresa_id = p_empresa
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

  -- Mismos permisos que el original (el del kiosco nunca se copia).
  INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
  SELECT DISTINCT v_id, rp.rpe_permiso_id
  FROM public.sgrh_rol_permisos rp
  JOIN public.sgrh_cat_permisos p ON p.per_id = rp.rpe_permiso_id
  WHERE rp.rpe_rol_id = p_rol_base AND p.per_codigo <> 'ASISTENCIA_KIOSCO';

  -- Cuentas que trabajan SOLO en esa sucursal con el rol original. El hook del
  -- JWT asume un solo rol por cuenta: las de varias sucursales se quedan.
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

-- ─── 4. RPC: eliminar rol ────────────────────────────────────────────────────
-- Una versión de sucursal devuelve sus cuentas al rol original. Un rol con
-- versiones vigentes no se elimina (primero las versiones). Con asignaciones
-- históricas se archiva. Devuelve 'eliminado' o 'archivado'.
CREATE OR REPLACE FUNCTION public.sgrh_delete_role(p_actor uuid, p_empresa int, p_id int)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_activos int; v_base int; v_sucursal int; v_base_ok boolean; v_resultado text;
BEGIN
  v_usr := public.sgrh_assert_roles_admin(p_actor, p_empresa);
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  SELECT rol_base_id, rol_sucursal_id INTO v_base, v_sucursal FROM public.sgrh_cat_roles
  WHERE rol_id = p_id AND rol_empresa_id = p_empresa AND rol_activo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Rol no encontrado.' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sgrh_cat_roles WHERE rol_base_id = p_id AND rol_activo) THEN
    RAISE EXCEPTION 'Este rol tiene versiones por sucursal. Eliminá primero esas versiones.'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*) INTO v_activos FROM public.sgrh_usuarios_empresa_rol
  WHERE uer_rol_id = p_id AND uer_activo;

  IF v_activos > 0 THEN
    -- Las cuentas vuelven al original si sigue vigente y sirve en esa sucursal.
    SELECT rol_activo AND (rol_sucursal_id IS NULL OR rol_sucursal_id IS NOT DISTINCT FROM v_sucursal)
      INTO v_base_ok
    FROM public.sgrh_cat_roles WHERE rol_id = v_base AND rol_empresa_id = p_empresa;
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
    -- Las versiones archivadas conservaban el vínculo: se suelta para poder borrar.
    UPDATE public.sgrh_cat_roles SET rol_base_id = NULL WHERE rol_base_id = p_id AND NOT rol_activo;
    DELETE FROM public.sgrh_rol_permisos WHERE rpe_rol_id = p_id;
    DELETE FROM public.sgrh_cat_roles WHERE rol_id = p_id;
    v_resultado := 'eliminado';
  END IF;

  INSERT INTO public.sgrh_config_auditoria (aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'rol', p_id::text, 'eliminar');
  RETURN v_resultado;
END $$;

REVOKE ALL ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sgrh_customize_role_for_branch(uuid, int, int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sgrh_delete_role(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sgrh_customize_role_for_branch(uuid, int, int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.sgrh_delete_role(uuid, int, int) TO service_role;

-- ─── 5. Un usuario solo recibe roles de SU empresa ───────────────────────────
-- Igual que antes (otra empresa, otra sucursal, archivado) y además: si la
-- empresa ya tiene su copia de una plantilla, la plantilla no se asigna — se
-- elige la copia. Una plantilla sin copia sí (seeds y empresas que todavía no
-- se instanciaron), y el rol del kiosco nunca tiene copia.
CREATE OR REPLACE FUNCTION sgrh_private.check_rol_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_empresa int; v_sucursal int; v_activo boolean; v_codigo text;
BEGIN
  SELECT rol_empresa_id, rol_sucursal_id, rol_activo, rol_codigo
    INTO v_empresa, v_sucursal, v_activo, v_codigo
  FROM public.sgrh_cat_roles WHERE rol_id = NEW.uer_rol_id;
  IF v_empresa IS NULL THEN
    IF (TG_OP = 'INSERT' OR NEW.uer_rol_id IS DISTINCT FROM OLD.uer_rol_id
        OR NEW.uer_empresa_id IS DISTINCT FROM OLD.uer_empresa_id)
      AND EXISTS (SELECT 1 FROM public.sgrh_cat_roles
                  WHERE rol_codigo = 'EMPRESA_' || NEW.uer_empresa_id || '_' || v_codigo) THEN
      RAISE EXCEPTION 'Tu empresa tiene su propia versión de ese rol: elegí esa.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  IF v_empresa IS DISTINCT FROM NEW.uer_empresa_id THEN
    RAISE EXCEPTION 'Ese rol pertenece a otra empresa.' USING ERRCODE = '23514';
  END IF;
  -- Un rol de sucursal solo para cuentas de ESA sucursal (NULL en la cuenta =
  -- toda la empresa, que es más de lo que el rol cubre).
  IF v_sucursal IS NOT NULL AND NEW.uer_sucursal_id IS DISTINCT FROM v_sucursal THEN
    RAISE EXCEPTION 'Ese rol es de otra sucursal: solo se asigna a cuentas de esa sucursal.' USING ERRCODE = '23514';
  END IF;
  IF NOT v_activo AND NEW.uer_activo
    AND (TG_OP = 'INSERT' OR NEW.uer_rol_id IS DISTINCT FROM OLD.uer_rol_id OR NOT OLD.uer_activo) THEN
    RAISE EXCEPTION 'Ese rol fue eliminado: elegí otro.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION sgrh_private.check_rol_empresa() FROM PUBLIC, anon, authenticated;

-- ─── 6. Repartir los datos existentes ────────────────────────────────────────
SELECT sgrh_private.instanciar_roles_empresa(org_id) FROM public.sgrh_empresas ORDER BY org_id;

-- ─── 7. Documentación ────────────────────────────────────────────────────────
COMMENT ON COLUMN public.sgrh_cat_roles.rol_empresa_id IS
  'Con valor = rol de esa empresa (copia de una plantilla o creado en Configuración), administrado por sgrh_save_role / sgrh_delete_role. NULL = plantilla del sistema: siembra empresas nuevas (sgrh_private.instanciar_roles_empresa) y no se edita desde la app; el rol con ASISTENCIA_KIOSCO es la única plantilla que se asigna tal cual.';
COMMENT ON COLUMN public.sgrh_cat_roles.rol_base_id IS
  'En la versión de sucursal de un rol (sgrh_customize_role_for_branch): el rol de la misma empresa del que salió. Al eliminarla, sus cuentas vuelven a él. NULL = no es una versión.';
COMMENT ON FUNCTION sgrh_private.instanciar_roles_empresa(int) IS
  'Copia a la empresa las plantillas que necesita (las activas y las que ya usa), le pasa sus asignaciones y repunta sus versiones de sucursal. Re-ejecutable. Llamarla al dar de alta una empresa.';
COMMENT ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) IS
  'Crea (p_id NULL) o edita un rol de la empresa y reemplaza sus permisos. Revalida ROLES_WRITE en vivo, dependencias, que el actor no agregue lo que no tiene, que no se quite ROLES_WRITE a sí mismo y las reglas de sucursal de las versiones.';
COMMENT ON FUNCTION public.sgrh_customize_role_for_branch(uuid, int, int, int) IS
  'Crea la versión de una sucursal de un rol de la empresa (mismos permisos, que el actor debe tener) y le pasa las cuentas que trabajan solo en esa sucursal. Idempotente: si ya existe, devuelve su id.';
COMMENT ON FUNCTION public.sgrh_delete_role(uuid, int, int) IS
  'Elimina un rol de la empresa. Una versión de sucursal devuelve sus cuentas al rol original; un rol con versiones vigentes o con usuarios activos se bloquea. Con asignaciones históricas se archiva. Devuelve eliminado|archivado.';

COMMIT;
