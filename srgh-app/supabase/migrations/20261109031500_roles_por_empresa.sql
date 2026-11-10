-- Roles y permisos administrables desde Configuración.
--
-- Hasta acá `sgrh_cat_roles` y `sgrh_rol_permisos` eran catálogos GLOBALES
-- con las policies genéricas de catálogo: cualquiera con CATALOGOS_WRITE podía
-- escribirlos por la Data API. Eso tenía dos problemas:
--   1. un ADMIN de una empresa le cambiaba los permisos a la gente de TODAS
--      las demás (los roles se comparten);
--   2. quien pudiera editar la matriz se podía dar cualquier permiso a sí
--      mismo: el hook del JWT la lee tal cual.
--
-- Modelo nuevo:
--   - rol_empresa_id NULL  → rol del SISTEMA (ADMIN, GERENTE, EMPLEADO,
--     KIOSCO...): compartido, solo lectura desde la app. Se cambia por
--     migración/seed, igual que antes.
--   - rol_empresa_id = X   → rol PROPIO de la empresa X: se crea, edita y
--     elimina desde Configuración → Roles y permisos.
--   - rol_sucursal_id      → en un rol propio, la sucursal a la que pertenece
--     (NULL = sirve para toda la empresa). Un rol de sucursal solo se asigna
--     a cuentas de esa sucursal, así que editarlo no toca a la otra tienda.
--
-- Escritura: ninguna desde el cliente. Solo las RPC de servidor
-- sgrh_save_role / sgrh_delete_role, que revalidan en vivo ROLES_WRITE del
-- actor (no el JWT, que puede tener hasta una hora) — mismo patrón que
-- sgrh_save_branch.
--
-- El hook (custom_access_token_hook) no cambia: arma los permisos por
-- rol_codigo, y los roles nuevos reciben un código único generado.
BEGIN;

CREATE SCHEMA IF NOT EXISTS sgrh_private;

-- ─── 1. Dueño del rol ────────────────────────────────────────────────────────
ALTER TABLE public.sgrh_cat_roles
  ADD COLUMN IF NOT EXISTS rol_empresa_id int REFERENCES public.sgrh_empresas(org_id),
  ADD COLUMN IF NOT EXISTS rol_sucursal_id int REFERENCES public.sgrh_sucursales(suc_id),
  ADD COLUMN IF NOT EXISTS rol_updated_at timestamptz;

-- Un rol del sistema nunca es de una sucursal.
ALTER TABLE public.sgrh_cat_roles DROP CONSTRAINT IF EXISTS sgrh_cat_roles_sucursal_propia;
ALTER TABLE public.sgrh_cat_roles ADD CONSTRAINT sgrh_cat_roles_sucursal_propia
  CHECK (rol_sucursal_id IS NULL OR rol_empresa_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS sgrh_cat_roles_empresa_idx ON public.sgrh_cat_roles (rol_empresa_id);
CREATE INDEX IF NOT EXISTS sgrh_cat_roles_sucursal_idx ON public.sgrh_cat_roles (rol_sucursal_id);

-- Nombre único dentro de cada empresa (solo entre los vigentes: un rol
-- archivado no le bloquea el nombre a uno nuevo). El choque contra un rol del
-- sistema lo revisa la RPC, que es la única que escribe.
CREATE UNIQUE INDEX IF NOT EXISTS sgrh_cat_roles_empresa_nombre_key
  ON public.sgrh_cat_roles (rol_empresa_id, lower(trim(rol_nombre)))
  WHERE rol_empresa_id IS NOT NULL AND rol_activo;

CREATE INDEX IF NOT EXISTS sgrh_rol_permisos_rol_idx ON public.sgrh_rol_permisos (rpe_rol_id);

-- ─── 2. RLS: lectura acotada, escritura cerrada ──────────────────────────────
-- Las policies genéricas de catálogo (cat_*) dejaban escribir con
-- CATALOGOS_WRITE. Se reemplazan: cada quien lee los roles del sistema y los
-- de su empresa; nadie escribe desde el cliente.
DROP POLICY IF EXISTS "cat_select" ON public.sgrh_cat_roles;
DROP POLICY IF EXISTS "cat_insert" ON public.sgrh_cat_roles;
DROP POLICY IF EXISTS "cat_update" ON public.sgrh_cat_roles;
DROP POLICY IF EXISTS "cat_delete" ON public.sgrh_cat_roles;
DROP POLICY IF EXISTS roles_select ON public.sgrh_cat_roles;
CREATE POLICY roles_select ON public.sgrh_cat_roles
  FOR SELECT TO authenticated
  USING (rol_empresa_id IS NULL OR rol_empresa_id = (SELECT public.get_empresa_id()));
DROP POLICY IF EXISTS roles_service ON public.sgrh_cat_roles;
CREATE POLICY roles_service ON public.sgrh_cat_roles
  TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "cat_select" ON public.sgrh_rol_permisos;
DROP POLICY IF EXISTS "cat_insert" ON public.sgrh_rol_permisos;
DROP POLICY IF EXISTS "cat_update" ON public.sgrh_rol_permisos;
DROP POLICY IF EXISTS "cat_delete" ON public.sgrh_rol_permisos;
DROP POLICY IF EXISTS rol_permisos_select ON public.sgrh_rol_permisos;
CREATE POLICY rol_permisos_select ON public.sgrh_rol_permisos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sgrh_cat_roles r
    WHERE r.rol_id = rpe_rol_id
      AND (r.rol_empresa_id IS NULL OR r.rol_empresa_id = (SELECT public.get_empresa_id()))
  ));
DROP POLICY IF EXISTS rol_permisos_service ON public.sgrh_rol_permisos;
CREATE POLICY rol_permisos_service ON public.sgrh_rol_permisos
  TO service_role USING (true) WITH CHECK (true);

-- Defensa en profundidad: aunque una policy futura se abriera por error, el
-- rol `authenticated` no tiene privilegio de escritura sobre estas tablas.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.sgrh_cat_roles, public.sgrh_rol_permisos
  FROM anon, authenticated;
GRANT SELECT ON public.sgrh_cat_roles, public.sgrh_rol_permisos TO authenticated;
GRANT ALL ON public.sgrh_cat_roles, public.sgrh_rol_permisos TO service_role;

-- ─── 3. Dependencias entre permisos ──────────────────────────────────────────
-- Un permiso de escritura/aprobación sin el de lectura deja a la persona
-- creando registros que después no puede abrir. Espejo de
-- src/modules/settings/roles/permissions.ts (REQUISITOS): si se cambia uno,
-- se cambia el otro (lo cubre un test que lee este archivo).
CREATE OR REPLACE FUNCTION sgrh_private.permiso_requisitos()
RETURNS TABLE (permiso text, requiere text)
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  VALUES
    ('EMPLEADOS_WRITE',     'EMPLEADOS_READ'),
    ('FOTOS_READ',          'EMPLEADOS_READ'),
    ('DOCUMENTOS_READ',     'EMPLEADOS_READ'),
    ('DOCUMENTOS_WRITE',    'DOCUMENTOS_READ'),
    ('BIOMETRIA_WRITE',     'EMPLEADOS_READ'),
    ('HISTORIAL_READ',      'EMPLEADOS_READ'),
    ('HISTORIAL_WRITE',     'HISTORIAL_READ'),
    ('ASISTENCIA_WRITE',    'ASISTENCIA_READ'),
    ('AUSENCIAS_WRITE',     'AUSENCIAS_READ'),
    ('AUSENCIAS_APPROVE',   'AUSENCIAS_READ'),
    ('HORARIOS_WRITE',      'HORARIOS_READ'),
    ('NOMINA_WRITE',        'NOMINA_READ'),
    ('NOMINA_APPROVE',      'NOMINA_READ'),
    ('RECLUTAMIENTO_WRITE', 'RECLUTAMIENTO_READ'),
    ('EVALUACIONES_WRITE',  'EVALUACIONES_READ')
$$;
REVOKE ALL ON FUNCTION sgrh_private.permiso_requisitos() FROM PUBLIC, anon, authenticated;

-- ─── 4. Permisos vivos del actor ─────────────────────────────────────────────
-- Usuario de negocio + códigos de permiso de su rol ACTIVO en la empresa,
-- leídos de la base (no del JWT).
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
  WHERE u.usr_auth_id = p_actor AND u.usr_activo
  ORDER BY a.uer_id
  LIMIT 1
$$;
REVOKE ALL ON FUNCTION sgrh_private.permisos_actor(uuid, int) FROM PUBLIC, anon, authenticated;

-- Revalida en vivo que el actor administre roles en esa empresa. La usa el
-- servidor antes de leer con el cliente admin (ver roles/access.ts).
CREATE OR REPLACE FUNCTION public.sgrh_assert_roles_admin(p_actor uuid, p_empresa int)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_usr int; v_perms text[];
BEGIN
  SELECT x.usr_id, x.permisos INTO v_usr, v_perms FROM sgrh_private.permisos_actor(p_actor, p_empresa) x;
  IF v_usr IS NULL OR NOT ('ROLES_WRITE' = ANY (v_perms)) THEN
    RAISE EXCEPTION 'No tenés permiso para administrar roles.' USING ERRCODE = '42501';
  END IF;
  RETURN v_usr;
END $$;

-- ─── 5. RPC: crear / editar rol ──────────────────────────────────────────────
-- p_id NULL = crear. p_sucursal NULL = rol de toda la empresa. Reemplaza el
-- conjunto completo de permisos.
CREATE OR REPLACE FUNCTION public.sgrh_save_role(
  p_actor uuid, p_empresa int, p_id int, p_nombre text, p_descripcion text,
  p_sucursal int, p_permisos text[]
) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_usr int; v_rol_actor int; v_perms_actor text[];
  v_id int; v_sucursal_actual int; v_nombre text; v_desc text; v_permisos text[]; v_faltan text;
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
    SELECT rol_id, rol_sucursal_id INTO v_id, v_sucursal_actual FROM public.sgrh_cat_roles
    WHERE rol_id = p_id AND rol_empresa_id = p_empresa AND rol_activo FOR UPDATE;
    IF NOT FOUND THEN
      IF EXISTS (SELECT 1 FROM public.sgrh_cat_roles WHERE rol_id = p_id AND rol_empresa_id IS NULL) THEN
        RAISE EXCEPTION 'Los roles del sistema no se editan. Duplicalo y editá la copia.' USING ERRCODE = '42501';
      END IF;
      RAISE EXCEPTION 'Rol no encontrado.' USING ERRCODE = '42501';
    END IF;
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
  SELECT string_agg(c, ', ') INTO v_faltan FROM unnest(v_permisos) c
  WHERE c <> 'MI_HORARIO_READ' AND NOT (c = ANY (v_perms_actor));
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

-- ─── 6. RPC: eliminar rol ────────────────────────────────────────────────────
-- Con usuarios activos no se elimina: hay que reasignarlos primero. Con solo
-- asignaciones viejas (inactivas), la FK impide borrar la fila: se archiva
-- (rol_activo = false), deja de listarse y de poder asignarse. Devuelve
-- 'eliminado' o 'archivado'.
CREATE OR REPLACE FUNCTION public.sgrh_delete_role(p_actor uuid, p_empresa int, p_id int)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_usr int; v_activos int; v_resultado text;
BEGIN
  v_usr := public.sgrh_assert_roles_admin(p_actor, p_empresa);
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_rol'), p_empresa);

  PERFORM 1 FROM public.sgrh_cat_roles
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

REVOKE ALL ON FUNCTION public.sgrh_assert_roles_admin(uuid, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sgrh_delete_role(uuid, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_assert_roles_admin(uuid, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.sgrh_delete_role(uuid, int, int) TO service_role;
GRANT USAGE ON SCHEMA sgrh_private TO service_role;
GRANT EXECUTE ON FUNCTION sgrh_private.permiso_requisitos(), sgrh_private.permisos_actor(uuid, int) TO service_role;

-- ─── 7. Un usuario solo recibe roles de SU empresa ───────────────────────────
-- Vale para cualquier camino (invitar, editar asignación, scripts): un rol
-- propio de otra empresa, o uno archivado, no se asigna. Los roles del
-- sistema no se miran acá (KIOSCO está inactivo a propósito y se asigna).
CREATE OR REPLACE FUNCTION sgrh_private.check_rol_empresa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_empresa int; v_sucursal int; v_activo boolean;
BEGIN
  SELECT rol_empresa_id, rol_sucursal_id, rol_activo INTO v_empresa, v_sucursal, v_activo
  FROM public.sgrh_cat_roles WHERE rol_id = NEW.uer_rol_id;
  IF v_empresa IS NULL THEN RETURN NEW; END IF;
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
DROP TRIGGER IF EXISTS uer_rol_empresa ON public.sgrh_usuarios_empresa_rol;
CREATE TRIGGER uer_rol_empresa
  BEFORE INSERT OR UPDATE OF uer_rol_id, uer_empresa_id, uer_sucursal_id, uer_activo ON public.sgrh_usuarios_empresa_rol
  FOR EACH ROW EXECUTE FUNCTION sgrh_private.check_rol_empresa();

-- ─── 8. Documentación ────────────────────────────────────────────────────────
COMMENT ON COLUMN public.sgrh_cat_roles.rol_empresa_id IS
  'NULL = rol del sistema (compartido, solo lectura desde la app). Con valor = rol propio de esa empresa, administrado desde Configuración por sgrh_save_role / sgrh_delete_role.';
COMMENT ON COLUMN public.sgrh_cat_roles.rol_sucursal_id IS
  'Solo en roles propios: la sucursal a la que pertenece el rol. NULL = toda la empresa. Un rol de sucursal solo se asigna a cuentas de esa sucursal (trigger uer_rol_empresa).';
COMMENT ON COLUMN public.sgrh_cat_roles.rol_activo IS
  'false = no asignable. En los roles propios significa archivado (se eliminó con asignaciones históricas).';
COMMENT ON FUNCTION public.sgrh_save_role(uuid, int, int, text, text, int, text[]) IS
  'Crea (p_id NULL) o edita un rol propio de la empresa y reemplaza sus permisos. Revalida ROLES_WRITE en vivo, dependencias, que el actor tenga lo que otorga y que no se quite ROLES_WRITE a sí mismo.';
COMMENT ON FUNCTION public.sgrh_delete_role(uuid, int, int) IS
  'Elimina un rol propio sin usuarios activos; si tiene asignaciones históricas lo archiva. Devuelve eliminado|archivado.';

COMMIT;
