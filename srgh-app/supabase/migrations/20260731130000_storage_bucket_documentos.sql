-- Storage de documentos del expediente (SGRH-60, fase 1B): bucket privado +
-- permisos propios DOCUMENTOS_READ / DOCUMENTOS_WRITE. Segunda pieza del
-- modulo de storage desacoplado (src/lib/storage); complementa el bucket de
-- fotos de 20260731120000.
--
-- Decisiones de diseño (espejo del plan SGRH-60):
-- * Los documentos del expediente (CCSS, contratos, incapacidades) son MAS
--   sensibles que la ficha del empleado: permisos propios, sembrados SOLO a
--   ADMIN, SUPERADMIN y RRHH (los mismos que hoy tienen EMPLEADOS_WRITE).
--   KIOSCO y los roles de solo-lectura de empleados (GERENTE, AUDITOR, etc.)
--   quedan fuera a proposito; si el negocio quiere ampliarlo, es una fila mas
--   de asignar_permisos aqui.
-- * El bucket es PRIVADO y los documentos NUNCA se sirven inline: la unica
--   salida es una URL firmada de 60 s con ?download= (Content-Disposition:
--   attachment) — un PDF con contenido activo jamas corre en nuestro origen.
-- * Aislamiento multi-tenant por PATH, igual que fotos: primer segmento
--   <empresa_id>/ comparado contra get_empresa_id().
-- * Limites espejo de src/lib/storage/containers.ts (DOCUMENTOS_EMPLEADO):
--   10 MB, application/pdf + image/jpeg + image/png (una incapacidad
--   fotografiada es un caso real). SVG excluido en todos los contenedores
--   (documento ejecutable: XSS almacenado).
--
-- Toda la migracion es convergente: puede re-ejecutarse sin errores.

-- ─── 1. Permisos DOCUMENTOS_READ / DOCUMENTOS_WRITE ──────────────────────────

INSERT INTO public.sgrh_cat_permisos (per_codigo, per_nombre, per_modulo)
VALUES
  ('DOCUMENTOS_READ',  'Ver documentos de empleados',      'storage'),
  ('DOCUMENTOS_WRITE', 'Gestionar documentos de empleados', 'storage')
ON CONFLICT (per_codigo) DO NOTHING;

SELECT sgrh_private.asignar_permisos('SUPERADMIN', ARRAY['DOCUMENTOS_READ', 'DOCUMENTOS_WRITE']);
SELECT sgrh_private.asignar_permisos('ADMIN',      ARRAY['DOCUMENTOS_READ', 'DOCUMENTOS_WRITE']);
SELECT sgrh_private.asignar_permisos('RRHH',       ARRAY['DOCUMENTOS_READ', 'DOCUMENTOS_WRITE']);

-- ─── 2. Bucket privado de documentos ─────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-empleados',
  'documentos-empleados',
  false,
  10 * 1024 * 1024,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ─── 3. Policies RLS sobre storage.objects ────────────────────────────────────

DROP POLICY IF EXISTS "documentos_empleados_select" ON storage.objects;
CREATE POLICY "documentos_empleados_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documentos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('DOCUMENTOS_READ'))
  );

DROP POLICY IF EXISTS "documentos_empleados_insert" ON storage.objects;
CREATE POLICY "documentos_empleados_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documentos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

DROP POLICY IF EXISTS "documentos_empleados_update" ON storage.objects;
CREATE POLICY "documentos_empleados_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'documentos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  )
  WITH CHECK (
    bucket_id = 'documentos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

DROP POLICY IF EXISTS "documentos_empleados_delete" ON storage.objects;
CREATE POLICY "documentos_empleados_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documentos-empleados'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );
