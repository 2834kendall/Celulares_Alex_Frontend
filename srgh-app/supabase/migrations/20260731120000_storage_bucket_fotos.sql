-- Storage de fotos de empleado (SGRH-60, fase 1A): bucket privado + permiso
-- de lectura propio. Primera pieza del modulo de storage desacoplado
-- (src/lib/storage): el codigo de negocio habla con contenedores logicos y
-- este bucket es su implementacion actual en Supabase.
--
-- Decisiones de diseño (espejo del plan SGRH-60):
-- * El bucket es PRIVADO: todo acceso de lectura viaja por URL firmada de
--   corta vida. Una foto de rostro asociada a una persona identificada es
--   dato personal (Ley 8968); un bucket publico no tiene RLS ni aislamiento
--   entre empresas y sus URLs no se pueden revocar.
-- * Aislamiento multi-tenant por PATH: toda ruta empieza con <empresa_id>/
--   (lo construye siempre el servidor desde el JWT, ver lib/storage/paths.ts)
--   y las policies comparan ese primer segmento contra get_empresa_id().
-- * Lectura con permiso NUEVO FOTOS_READ y no con EMPLEADOS_READ, a
--   proposito: el rol KIOSCO (cuenta de dispositivo compartido, fisicamente
--   expuesto, sesion permanente) tiene EMPLEADOS_READ para poblar su buscador
--   y NO debe poder firmar fotos. FOTOS_READ se otorga a los roles humanos
--   que hoy tienen EMPLEADOS_READ — nunca a KIOSCO. Si el kiosco algun dia
--   necesita mostrar la cara junto al nombre, es una decision del modulo de
--   asistencia (agregar FOTOS_READ a KIOSCO en SU migracion).
-- * Escritura (INSERT/UPDATE/DELETE) con EMPLEADOS_WRITE, que ya existe y
--   KIOSCO no tiene. El UPDATE es necesario para el upsert de la fase 2
--   (reemplazar la foto de un empleado).
-- * Los limites del bucket (5 MB, jpeg/png/webp) espejan
--   src/lib/storage/containers.ts: el bucket es el arbitro final, el codigo
--   valida antes (magic bytes) para dar un error util.
--
-- Toda la migracion es convergente: puede re-ejecutarse sin errores.

-- ─── 1. Permiso FOTOS_READ ────────────────────────────────────────────────────

-- per_modulo en minuscula, como el resto del catalogo (empleados, nomina...).
INSERT INTO public.sgrh_cat_permisos (per_codigo, per_nombre, per_modulo)
VALUES ('FOTOS_READ', 'Ver fotos de empleados', 'storage')
ON CONFLICT (per_codigo) DO NOTHING;

-- Roles humanos que hoy tienen EMPLEADOS_READ (verificado contra la base al
-- escribir esta migracion). KIOSCO queda fuera A PROPOSITO — ver cabecera.
SELECT sgrh_private.asignar_permisos('SUPERADMIN',    ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('ADMIN',         ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('RRHH',          ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('GERENTE',       ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('SUPERVISOR',    ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('CONTADOR',      ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('RECLUTADOR',    ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('AUDITOR',       ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('JEFE_SUCURSAL', ARRAY['FOTOS_READ']);
SELECT sgrh_private.asignar_permisos('EVALUADOR',     ARRAY['FOTOS_READ']);

-- ─── 2. Bucket privado de fotos ───────────────────────────────────────────────
-- Limites espejo de containers.ts (FOTOS_EMPLEADO).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos-empleados',
  'fotos-empleados',
  false,
  5 * 1024 * 1024,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 3. Policies RLS sobre storage.objects ────────────────────────────────────
-- (storage.foldername(name))[1] es el primer segmento del path: el empresa_id
-- que el servidor SIEMPRE escribe desde el JWT. get_empresa_id() y
-- tiene_permiso() ya tienen GRANT EXECUTE a authenticated (sgrh_rls_final.sql).

DROP POLICY IF EXISTS "fotos_empleados_select" ON storage.objects;
CREATE POLICY "fotos_empleados_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'fotos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('FOTOS_READ'))
  );

DROP POLICY IF EXISTS "fotos_empleados_insert" ON storage.objects;
CREATE POLICY "fotos_empleados_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'fotos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

DROP POLICY IF EXISTS "fotos_empleados_update" ON storage.objects;
CREATE POLICY "fotos_empleados_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'fotos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  )
  WITH CHECK (
    bucket_id = 'fotos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );

DROP POLICY IF EXISTS "fotos_empleados_delete" ON storage.objects;
CREATE POLICY "fotos_empleados_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'fotos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
  );
