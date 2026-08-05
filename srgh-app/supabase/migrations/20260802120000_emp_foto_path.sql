-- Fase 2A del módulo de storage (SGRH-67): conecta el bucket privado
-- fotos-empleados (creado en 20260731120000) con el expediente del empleado.
--
-- emp_foto_path guarda la RUTA del objeto en el bucket, nunca una URL: las
-- URLs firmadas se generan al leer (getSignedUrl/getSignedUrls en
-- lib/storage) y expiran — persistir una URL sería persistir un token
-- vencido. NULL significa "sin foto"; la UI cae a las iniciales del nombre.
--
-- Sin policy nueva: sgrh_empleados ya tiene RLS por empresa (empleados_select
-- / empleados_update en sgrh_rls_final.sql), y esa misma policy cubre
-- cualquier columna de la tabla, incluida esta.
--
-- Convergente: puede re-ejecutarse sin errores.

ALTER TABLE public.sgrh_empleados
  ADD COLUMN IF NOT EXISTS emp_foto_path text;

COMMENT ON COLUMN public.sgrh_empleados.emp_foto_path IS
  'Ruta del objeto en el bucket fotos-empleados (<empresa_id>/empleados/<emp_id>/<uuid>.<ext>). '
  'NULL = sin foto. La URL se firma al leer (TTL_FOTO); nunca se persiste una URL.';
