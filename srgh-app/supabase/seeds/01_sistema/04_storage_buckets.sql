-- =====================================================================
-- Seed de sistema: buckets de storage
-- =====================================================================
-- Las filas de storage.buckets son datos (una fila en una tabla del esquema
-- storage), no estructura, así que viven acá y no en migrations/. Las
-- policies sobre storage.objects sí son DDL y están en
-- migrations/20260101000700_storage_policies.sql.
--
-- Los límites son espejo de containers.ts en lib/storage: si se cambian acá
-- hay que cambiarlos allá, o el cliente aceptará archivos que el servidor
-- rechaza.
--
-- Ambos buckets son PRIVADOS. Nada se sirve por URL pública: el acceso pasa
-- siempre por URLs firmadas de corta duración generadas en el servidor.
--
-- DO UPDATE en vez de DO NOTHING a propósito: si mañana sube el límite de
-- tamaño, el seed debe converger al valor nuevo, no ignorarlo.
-- =====================================================================

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

-- Sin SVG a propósito (puede llevar script embebido) y sin inline: los
-- documentos solo se entregan como descarga forzada.
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
