-- =====================================================================
-- SGRH — Multi-sucursal por usuario
-- =====================================================================
-- Antes: un usuario tenía UNA fila activa en sgrh_usuarios_empresa_rol y
-- el hook la leía con LIMIT 1 (ver comentario en updateUserAssignment.ts
-- y en inviteUser.ts sobre esa limitación conocida). Con esto, un usuario
-- puede tener varias filas activas — misma empresa, mismo rol, distinta
-- sucursal cada una — para cubrir al gerente/supervisor a cargo de más de
-- una sucursal.
--
-- Invariante de negocio: todas las filas ACTIVAS de un mismo
-- (uer_usuario_id, uer_empresa_id) deben compartir uer_rol_id. El rol (y
-- por lo tanto los permisos del JWT) es uno solo por usuario+empresa; lo
-- único que varía fila a fila es la sucursal. Se exige en la aplicación
-- (updateUserAssignment/inviteUser), no con un CHECK — comparar contra
-- "las otras filas del mismo usuario" no es expresable como CHECK simple
-- en Postgres.
--
-- El claim `sucursal_id` (escalar) del JWT se reemplaza por
-- `sucursal_ids` (array). NULL sigue significando "sin restricción de
-- sucursal, ve toda la empresa" (ADMIN, o cualquier fila activa sin
-- sucursal asignada); un array no vacío es la lista de sucursales
-- visibles.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hook de autenticación: agrega TODAS las sucursales activas del
--    usuario en su empresa, en vez de leer una sola fila con LIMIT 1.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  claims            jsonb;
  v_app_metadata    jsonb;
  v_rol             text;
  v_empresa         int;
  v_sucursales      int[];
  v_sin_restriccion boolean;
  v_usr_id          int;
  v_emp_id          int;
  v_permisos        text[];
  v_user_id_raw     text;
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

    -- Rol y empresa: se toman de cualquier fila activa (todas comparten
    -- rol y empresa, ver invariante arriba). Sucursales: se agregan TODAS
    -- las filas activas; si CUALQUIERA es NULL (nivel empresa), la
    -- restricción desaparece por completo, igual que antes con una sola
    -- fila NULL — así el ADMIN sigue viendo toda la empresa aunque además
    -- tenga sucursales puntuales asignadas.
    SELECT
      (ARRAY_AGG(r.rol_codigo))[1],
      (ARRAY_AGG(uer.uer_empresa_id))[1],
      bool_or(uer.uer_sucursal_id IS NULL),
      ARRAY_AGG(uer.uer_sucursal_id) FILTER (WHERE uer.uer_sucursal_id IS NOT NULL)
    INTO v_rol, v_empresa, v_sin_restriccion, v_sucursales
    FROM public.sgrh_usuarios_empresa_rol uer
    JOIN public.sgrh_cat_roles r ON r.rol_id = uer.uer_rol_id
    WHERE uer.uer_usuario_id = v_usr_id
      AND uer.uer_activo = true;

    IF v_sin_restriccion THEN
      v_sucursales := NULL;
    END IF;

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
    -- null = el usuario opera a nivel empresa (no restringido a sucursales
    -- puntuales); array = la lista de sucursales asignadas.
    v_app_metadata := jsonb_set(v_app_metadata, '{sucursal_ids}',
                        coalesce(to_jsonb(v_sucursales), 'null'::jsonb));
    v_app_metadata := v_app_metadata - 'sucursal_id';
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

-- ---------------------------------------------------------------------
-- 2. Helpers de RLS: sucursal_id (escalar) -> sucursal_ids (array)
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_sucursal_id();

-- Sucursales a las que está adscrito el usuario, o NULL si opera a nivel
-- empresa. Reemplaza a get_sucursal_id(): incluso un usuario con una sola
-- sucursal asignada ahora se lee como un array de un elemento.
CREATE OR REPLACE FUNCTION public.get_sucursal_ids()
RETURNS int[] AS $$
  SELECT CASE
    WHEN jsonb_typeof(auth.jwt() -> 'app_metadata' -> 'sucursal_ids') IS DISTINCT FROM 'array'
      THEN NULL
    ELSE ARRAY(
      SELECT jsonb_array_elements_text(auth.jwt() -> 'app_metadata' -> 'sucursal_ids')::int
    )
  END;
$$ LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public;

-- ¿Puede el usuario actual ver registros de esta sucursal?
--
-- Misma idea que antes (empresa + sucursal van siempre juntas), pero la
-- restricción de sucursal ahora es "pertenece al conjunto asignado" en
-- vez de "es exactamente la mía".
CREATE OR REPLACE FUNCTION public.sucursal_visible(p_sucursal_id int)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sgrh_sucursales
    WHERE suc_id = p_sucursal_id
      AND suc_empresa_id = (SELECT public.get_empresa_id())
  )
  AND (
    public.get_sucursal_ids() IS NULL
    OR p_sucursal_id = ANY (public.get_sucursal_ids())
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.get_sucursal_ids ()
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_sucursal_ids ()
TO authenticated;

-- ---------------------------------------------------------------------
-- 3. Único call site que leía get_sucursal_id() directo (no vía
--    sucursal_visible): biometria_select, sobre sgrh_biometria_empleado.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "biometria_select" ON public.sgrh_biometria_empleado;
CREATE POLICY "biometria_select" ON public.sgrh_biometria_empleado
  FOR SELECT TO authenticated
  USING (
    bio_empresa_id = (SELECT public.get_empresa_id())
    AND (
      (SELECT public.tiene_permiso('ASISTENCIA_WRITE'))
      OR (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
    )
    -- Los vectores faciales son el dato más sensible de la tabla: un usuario
    -- adscrito a una o varias sucursales (kiosco, gerente) solo lee los de
    -- SU personal activo. Quien opera a nivel empresa (ADMIN) no queda
    -- restringido.
    AND (
      public.get_sucursal_ids() IS NULL
      OR bio_empleado_id IN (
        SELECT lab_empleado_id
        FROM public.sgrh_historial_laboral
        WHERE lab_empresa_id = (SELECT public.get_empresa_id())
          AND lab_fecha_fin IS NULL
          AND lab_sucursal_id = ANY (public.get_sucursal_ids())
      )
    )
  );
