-- =====================================================================
-- SGRH-61 — Policies de storage para cv-candidatos
-- =====================================================================
-- Mismo patron que documentos_empleados_* en 20260101000700_storage_
-- policies.sql: (storage.foldername(name))[1] es el empresa_id que el
-- servidor SIEMPRE escribe desde el JWT (lib/storage), nunca el cliente.
--
-- Permiso propio de Reclutamiento (RECLUTAMIENTO_READ/WRITE), no
-- DOCUMENTOS_* -- ese permiso es del expediente de empleados, un permiso
-- distinto que no debe habilitar a nadie a subir o leer CVs de
-- candidatos, ni viceversa.
--
-- La fila de storage.buckets ('cv-candidatos') es DATA, vive en
-- seeds/01_sistema/04_storage_buckets.sql -- no hay dependencia de orden
-- entre ambos archivos.
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

DROP POLICY IF EXISTS "cv_candidatos_select" ON storage.objects;
CREATE POLICY "cv_candidatos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'cv-candidatos'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('RECLUTAMIENTO_READ'))
  );

DROP POLICY IF EXISTS "cv_candidatos_insert" ON storage.objects;
CREATE POLICY "cv_candidatos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cv-candidatos'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('RECLUTAMIENTO_WRITE'))
  );

DROP POLICY IF EXISTS "cv_candidatos_update" ON storage.objects;
CREATE POLICY "cv_candidatos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cv-candidatos'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('RECLUTAMIENTO_WRITE'))
  )
  WITH CHECK (
    bucket_id = 'cv-candidatos'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('RECLUTAMIENTO_WRITE'))
  );

DROP POLICY IF EXISTS "cv_candidatos_delete" ON storage.objects;
CREATE POLICY "cv_candidatos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'cv-candidatos'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('RECLUTAMIENTO_WRITE'))
  );
