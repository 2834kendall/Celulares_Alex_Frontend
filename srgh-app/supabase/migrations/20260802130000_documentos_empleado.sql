-- Documentos del expediente (SGRH-67, fase 2B): catálogo global de tipos de
-- documento + tabla de metadata que referencia el bucket privado
-- documentos-empleados (creado en 20260731130000_storage_bucket_documentos).
--
-- Decisiones de diseño:
-- * sgrh_cat_tipos_documento es GLOBAL (como sgrh_cat_bancos): compartido
--   entre empresas, sembrado con un set fijo, escritura vía CATALOGOS_WRITE.
--   Sin UI de administración por ahora — si el negocio pide tipos nuevos, es
--   una fila más de INSERT.
-- * sgrh_documentos denormaliza doc_empresa_id (igual que
--   sgrh_biometria_empleado) porque sgrh_empleados NO tiene columna de
--   empresa propia, y el primer segmento del path del bucket (para la RLS de
--   storage.objects) es justamente <empresa_id>/. Ir por
--   sgrh_historial_laboral como hace sgrh_empleado_datos_pago sería más
--   indirecto sin aportar nada aquí.
-- * doc_path NUNCA se expone al cliente (los Server Actions solo devuelven
--   URLs firmadas de 60s vía downloadAs); se guarda UNIQUE porque cada
--   objeto subido usa un uuid nuevo (build EmployeeDocumentPath).
-- * doc_mime es el MIME real detectado por magic bytes en el servidor
--   (validateUpload), NUNCA el file.type que manda el cliente — se persiste
--   para poder elegir el ícono correcto en la UI sin volver a inspeccionar
--   el archivo.
-- * Borrado definitivo (no hay doc_activo/soft delete): un documento
--   eliminado no es un evento de negocio como el despido de un usuario, así
--   que no hace falta conservar el registro. La fila se borra PRIMERO y el
--   objeto del bucket se limpia best-effort después (mismo criterio que
--   removeEmployeePhoto): un huérfano en un bucket privado es inofensivo,
--   una fila con un path que ya no existe no lo es.
-- * Sin doc_updated_at: el repo no tiene un trigger de mantenimiento de
--   updated_at (ver sgrh_biometria_empleado) y "editar metadata" no necesita
--   ese historial — created_at basta para ordenar la lista.
--
-- Toda la migración es convergente: puede re-ejecutarse sin errores.

-- ─── 1. Catálogo global de tipos de documento ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_cat_tipos_documento (
  tdo_id     serial PRIMARY KEY,
  tdo_codigo varchar(30) NOT NULL UNIQUE,
  tdo_nombre varchar(80) NOT NULL,
  tdo_activo boolean NOT NULL DEFAULT true
);

ALTER TABLE public.sgrh_cat_tipos_documento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cat_select" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_select" ON public.sgrh_cat_tipos_documento
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "cat_insert" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_insert" ON public.sgrh_cat_tipos_documento
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_update" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_update" ON public.sgrh_cat_tipos_documento
  FOR UPDATE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')))
  WITH CHECK ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

DROP POLICY IF EXISTS "cat_delete" ON public.sgrh_cat_tipos_documento;
CREATE POLICY "cat_delete" ON public.sgrh_cat_tipos_documento
  FOR DELETE TO authenticated
  USING ((SELECT public.tiene_permiso('CATALOGOS_WRITE')));

-- Orden del seed = orden de despliegue en la UI (tdo_id ascendente); "Otro"
-- va al final a propósito, no se ordena alfabético en las consultas.
INSERT INTO public.sgrh_cat_tipos_documento (tdo_codigo, tdo_nombre) VALUES
  ('CONTRATO',          'Contrato'),
  ('IDENTIFICACION',    'Identificación'),
  ('CURRICULUM',        'Currículum'),
  ('TITULO_ACADEMICO',  'Título académico'),
  ('CERTIFICACION',     'Certificación'),
  ('INCAPACIDAD',       'Incapacidad'),
  ('HOJA_DELINCUENCIA', 'Hoja de delincuencia'),
  ('CARTA',             'Carta'),
  ('OTRO',              'Otro')
ON CONFLICT (tdo_codigo) DO NOTHING;

-- ─── 2. Metadatos de documentos del expediente ──────────────────────────────

CREATE TABLE IF NOT EXISTS public.sgrh_documentos (
  doc_id                serial PRIMARY KEY,
  doc_empresa_id        int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  doc_empleado_id       int NOT NULL REFERENCES public.sgrh_empleados(emp_id) ON DELETE CASCADE,
  doc_tipo_id           int NOT NULL REFERENCES public.sgrh_cat_tipos_documento(tdo_id),
  doc_nombre            varchar(150) NOT NULL,
  doc_descripcion       varchar(300),
  doc_fecha_vencimiento date,
  -- Ruta en el bucket documentos-empleados: <empresa_id>/empleados/<emp_id>/<uuid>.<ext>.
  doc_path              text NOT NULL UNIQUE,
  -- MIME real detectado por magic bytes en el servidor (validateUpload);
  -- nunca el file.type que declara el cliente.
  doc_mime              varchar(100) NOT NULL,
  doc_creado_por        int REFERENCES public.sgrh_usuarios(usr_id),
  doc_created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documentos_empleado ON public.sgrh_documentos (doc_empleado_id);
CREATE INDEX IF NOT EXISTS idx_documentos_empresa  ON public.sgrh_documentos (doc_empresa_id);

ALTER TABLE public.sgrh_documentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documentos_select" ON public.sgrh_documentos;
CREATE POLICY "documentos_select" ON public.sgrh_documentos
  FOR SELECT TO authenticated
  USING (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_READ'))
  );

DROP POLICY IF EXISTS "documentos_insert" ON public.sgrh_documentos;
CREATE POLICY "documentos_insert" ON public.sgrh_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

DROP POLICY IF EXISTS "documentos_update" ON public.sgrh_documentos;
CREATE POLICY "documentos_update" ON public.sgrh_documentos
  FOR UPDATE TO authenticated
  USING (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  )
  WITH CHECK (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );

DROP POLICY IF EXISTS "documentos_delete" ON public.sgrh_documentos;
CREATE POLICY "documentos_delete" ON public.sgrh_documentos
  FOR DELETE TO authenticated
  USING (
    doc_empresa_id = (SELECT public.get_empresa_id())
    AND (SELECT public.tiene_permiso('DOCUMENTOS_WRITE'))
  );
