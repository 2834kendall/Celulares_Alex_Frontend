-- =====================================================================
-- SGRH — Baseline: policies de storage
-- =====================================================================
-- Solo las policies sobre storage.objects. Las FILAS de storage.buckets son
-- datos, no estructura, así que viven en seeds/01_sistema/04_storage_buckets.sql
-- (regla: migrations/ es 100% DDL). No hay dependencia de orden entre ambos:
-- una policy no necesita que el bucket exista.
--
-- El aislamiento multi-empresa se apoya en (storage.foldername(name))[1] —
-- el primer segmento del path, que es el empresa_id. Ese path lo construye
-- SIEMPRE el servidor desde el JWT (lib/storage), nunca el cliente.
--
-- Los permisos de lectura son propios (FOTOS_READ, DOCUMENTOS_READ) y NO
-- derivados de EMPLEADOS_*, a propósito: el rol KIOSCO es una tablet expuesta
-- con sesión permanente, tiene EMPLEADOS_READ y no debe poder firmar URLs de
-- archivos.
-- =====================================================================

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
