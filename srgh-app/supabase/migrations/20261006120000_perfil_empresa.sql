-- =====================================================================
-- SGRH-92 — Perfil de la empresa (Configuración → Empresa → Datos)
-- =====================================================================
--
-- 1. actualizar_perfil_empresa: datos de identidad/contacto + dirección en
--    una sola transacción.
-- 2. Policies del bucket logos-empresa (la fila del bucket es un dato: vive
--    en seeds/01_sistema/04_storage_buckets.sql).
-- 3. Comentario de org_logo_url: guarda una RUTA, no una URL.
--
-- La cédula jurídica no se edita desde la app a propósito: es el
-- identificador legal (CCSS, Hacienda); cambiarla es un trámite, no un ajuste.
-- =====================================================================


-- ─── 1. actualizar_perfil_empresa ────────────────────────────────────────────
--
-- Por qué SECURITY DEFINER (y no un UPDATE directo con RLS):
-- la dirección vive en sgrh_direcciones y la RLS no deja editar la de la
-- empresa: direcciones_update solo cubre direcciones de empleados, y crearla
-- por PostgREST choca con la trampa de INSERT ... RETURNING (la policy de
-- SELECT exige que alguien ya la referencie, y recién se enlaza después).
-- Es el mismo grafo que obligó a crear_empleado_completo a ser DEFINER.
--
-- Consecuencia: como se salta la RLS, los chequeos de abajo son la ÚNICA
-- capa. La empresa sale SIEMPRE del JWT (get_empresa_id), nunca del payload,
-- y se exige EMPRESAS_WRITE: lo mismo que pide empresas_update.
CREATE OR REPLACE FUNCTION public.actualizar_perfil_empresa(
  p_datos jsonb,
  p_direccion jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa       int := public.get_empresa_id();
  v_nombre_social text := nullif(trim(p_datos->>'org_nombre_social'), '');
  v_distrito      int := nullif(p_direccion->>'dir_distrito_id', '')::int;
  v_direccion     int;
BEGIN
  IF v_empresa IS NULL OR NOT public.tiene_permiso('EMPRESAS_WRITE') THEN
    RAISE EXCEPTION 'No tenés permiso para editar los datos de la empresa.'
      USING ERRCODE = '42501';
  END IF;

  IF v_nombre_social IS NULL THEN
    RAISE EXCEPTION 'La razón social es obligatoria.' USING ERRCODE = '23514';
  END IF;

  IF v_distrito IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.sgrh_cat_distritos WHERE dis_id = v_distrito
  ) THEN
    RAISE EXCEPTION 'El distrito no existe.' USING ERRCODE = '23503';
  END IF;

  SELECT org_direccion_id INTO v_direccion
  FROM public.sgrh_empresas
  WHERE org_id = v_empresa
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No se encontró la empresa.' USING ERRCODE = '23503';
  END IF;

  -- sgrh_direcciones es compartida con empleados y sucursales: si la fila de
  -- la empresa también la usa alguien más (datos viejos o de demo), editarla
  -- le cambiaría la dirección a esa otra entidad. En ese caso se crea una
  -- nueva para la empresa.
  IF v_direccion IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.sgrh_sucursales WHERE suc_direccion_id = v_direccion)
    OR EXISTS (SELECT 1 FROM public.sgrh_empleados WHERE emp_direccion_id = v_direccion)
  ) THEN
    v_direccion := NULL;
  END IF;

  -- dir_codigo_postal lo calcula el trigger desde el distrito (también en
  -- UPDATE OF dir_distrito_id).
  IF v_direccion IS NULL THEN
    INSERT INTO public.sgrh_direcciones (dir_distrito_id, dir_senas_exactas)
    VALUES (v_distrito, nullif(trim(p_direccion->>'dir_senas_exactas'), ''))
    RETURNING dir_id INTO v_direccion;
  ELSE
    UPDATE public.sgrh_direcciones
    SET dir_distrito_id   = v_distrito,
        dir_senas_exactas = nullif(trim(p_direccion->>'dir_senas_exactas'), '')
    WHERE dir_id = v_direccion;
  END IF;

  UPDATE public.sgrh_empresas
  SET org_nombre_social            = v_nombre_social,
      org_nombre_fantasia          = nullif(trim(p_datos->>'org_nombre_fantasia'), ''),
      org_email_corporativo        = nullif(trim(p_datos->>'org_email_corporativo'), ''),
      org_telefono                 = nullif(trim(p_datos->>'org_telefono'), ''),
      org_representante_legal      = nullif(trim(p_datos->>'org_representante_legal'), ''),
      org_actividad_economica_ciiu = nullif(trim(p_datos->>'org_actividad_economica_ciiu'), ''),
      org_direccion_id             = v_direccion
  WHERE org_id = v_empresa;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.actualizar_perfil_empresa(jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.actualizar_perfil_empresa(jsonb, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION public.actualizar_perfil_empresa(jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.actualizar_perfil_empresa(jsonb, jsonb) IS
  'Actualiza identidad, contacto y dirección de la empresa del JWT (exige EMPRESAS_WRITE). SECURITY DEFINER: la RLS de sgrh_direcciones no cubre la dirección de la empresa. La cédula jurídica no se toca.';


-- ─── 2. Bucket logos-empresa ─────────────────────────────────────────────────
--
-- Mismo esquema que fotos-empleados: el primer segmento de la ruta es el
-- empresa_id del JWT. La LECTURA no pide permiso extra: el logo se muestra en
-- el menú a todo usuario de la empresa (igual que empresas_select). Escribir
-- exige EMPRESAS_WRITE, como el resto del perfil.

DROP POLICY IF EXISTS "logos_empresa_select" ON storage.objects;
CREATE POLICY "logos_empresa_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'logos-empresa'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
  );

DROP POLICY IF EXISTS "logos_empresa_insert" ON storage.objects;
CREATE POLICY "logos_empresa_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos-empresa'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPRESAS_WRITE'))
  );

DROP POLICY IF EXISTS "logos_empresa_update" ON storage.objects;
CREATE POLICY "logos_empresa_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos-empresa'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPRESAS_WRITE'))
  )
  WITH CHECK (
    bucket_id = 'logos-empresa'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPRESAS_WRITE'))
  );

DROP POLICY IF EXISTS "logos_empresa_delete" ON storage.objects;
CREATE POLICY "logos_empresa_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos-empresa'
    AND (storage.foldername(name))[1] = (SELECT public.get_empresa_id())::text
    AND (SELECT public.tiene_permiso('EMPRESAS_WRITE'))
  );


-- ─── 3. Documentación ────────────────────────────────────────────────────────

COMMENT ON COLUMN public.sgrh_empresas.org_logo_url IS
  'RUTA del logo en el bucket privado logos-empresa (<empresa_id>/logo/<uuid>.<ext>), no una URL: la URL firmada se genera en el servidor en cada carga. El nombre de la columna es anterior a esa decisión.';

NOTIFY pgrst, 'reload schema';
