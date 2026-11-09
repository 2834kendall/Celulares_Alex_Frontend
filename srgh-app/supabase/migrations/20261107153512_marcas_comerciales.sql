-- Marcas comerciales: Empresa → Marca → Sucursal.
--
-- Una empresa puede operar varias marcas con identidad propia, y cada marca
-- agrupa varias tiendas físicas. La marca es SOLO agrupación + identidad
-- visual (nombre, colores, logo): no entra al JWT ni a ninguna policy de
-- alcance, y no cambia ninguna relación existente con la sucursal
-- (historial laboral, marcas de asistencia, programación, planilla, kioscos).
--
-- Fase 1 de 2. Esta migración deja `suc_marca_id` NULLABLE. El orden es:
--   1. esta migración
--   2. supabase/scripts/asignar-marcas-iniciales.sql (a mano, en cada proyecto)
--   3. verificar que ninguna sucursal quede sin marca
--   4. deploy del frontend
--   5. la migración de fase 2 (NOT NULL y retiro de suc_color_*), en un PR
--      aparte: si viajara en este, un `db push` la aplicaría junto con esta,
--      antes de que corra el script.
--
-- Nombre: `sgrh_marcas_asistencia` ya usa el prefijo `mar_` y en todo el
-- código "marca" es la marca de reloj; de ahí `marcas_comerciales` / `mco_`.
BEGIN;

-- ─── 1. Tabla ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sgrh_marcas_comerciales (
  mco_id            int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mco_empresa_id    int NOT NULL REFERENCES public.sgrh_empresas(org_id),
  mco_nombre        text NOT NULL CHECK (length(trim(mco_nombre)) BETWEEN 2 AND 80),
  mco_activa        boolean NOT NULL DEFAULT true,
  mco_color_acento  text CHECK (mco_color_acento IS NULL OR mco_color_acento ~ '^#[0-9a-fA-F]{6}$'),
  mco_color_sidebar text CHECK (mco_color_sidebar IS NULL OR mco_color_sidebar ~ '^#[0-9a-fA-F]{6}$'),
  -- La ruta siempre cuelga de la carpeta de SU empresa: la policy del bucket
  -- compara el primer segmento contra get_empresa_id().
  mco_logo_path     text CHECK (mco_logo_path IS NULL OR mco_logo_path LIKE mco_empresa_id::text || '/marcas/%'),
  mco_created_at    timestamptz NOT NULL DEFAULT now(),
  mco_updated_at    timestamptz NOT NULL DEFAULT now(),
  -- Destino de la FK compuesta de sgrh_sucursales: garantiza en la base que
  -- una sucursal nunca apunte a la marca de otra empresa, venga la escritura
  -- por la RPC o por un UPDATE directo (sucursales_update lo permite).
  CONSTRAINT sgrh_marcas_comerciales_id_empresa_key UNIQUE (mco_id, mco_empresa_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS sgrh_marcas_comerciales_nombre_key
  ON public.sgrh_marcas_comerciales (mco_empresa_id, lower(trim(mco_nombre)));

-- ─── 2. Sucursal → marca ─────────────────────────────────────────────────────
ALTER TABLE public.sgrh_sucursales ADD COLUMN IF NOT EXISTS suc_marca_id int;
ALTER TABLE public.sgrh_sucursales DROP CONSTRAINT IF EXISTS sgrh_sucursales_marca_fkey;
ALTER TABLE public.sgrh_sucursales ADD CONSTRAINT sgrh_sucursales_marca_fkey
  FOREIGN KEY (suc_marca_id, suc_empresa_id)
  REFERENCES public.sgrh_marcas_comerciales (mco_id, mco_empresa_id);
CREATE INDEX IF NOT EXISTS sgrh_sucursales_marca_idx ON public.sgrh_sucursales (suc_marca_id);

-- ─── 3. Tema por defecto de la empresa (vista "Todas") ───────────────────────
ALTER TABLE public.sgrh_empresas
  ADD COLUMN IF NOT EXISTS org_color_acento text
    CONSTRAINT sgrh_empresas_color_acento_hex CHECK (
      org_color_acento IS NULL OR org_color_acento ~ '^#[0-9a-fA-F]{6}$'),
  ADD COLUMN IF NOT EXISTS org_color_sidebar text
    CONSTRAINT sgrh_empresas_color_sidebar_hex CHECK (
      org_color_sidebar IS NULL OR org_color_sidebar ~ '^#[0-9a-fA-F]{6}$');

-- ─── 4. RLS y grants ─────────────────────────────────────────────────────────
-- Lectura: cualquier usuario de la empresa (el shell pinta la marca a todos,
-- EMPLEADO incluido). Escritura: NINGUNA desde el cliente; solo la RPC de
-- servidor, que revalida en vivo al administrador (igual que sgrh_kioscos).
ALTER TABLE public.sgrh_marcas_comerciales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marcas_comerciales_select ON public.sgrh_marcas_comerciales;
CREATE POLICY marcas_comerciales_select ON public.sgrh_marcas_comerciales
  FOR SELECT TO authenticated
  USING (mco_empresa_id = (SELECT public.get_empresa_id()));
DROP POLICY IF EXISTS marcas_comerciales_service ON public.sgrh_marcas_comerciales;
CREATE POLICY marcas_comerciales_service ON public.sgrh_marcas_comerciales
  TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.sgrh_marcas_comerciales FROM anon, authenticated;
GRANT SELECT ON public.sgrh_marcas_comerciales TO authenticated;
GRANT ALL ON public.sgrh_marcas_comerciales TO service_role;

-- ─── 5. RPC: guardar marca ───────────────────────────────────────────────────
-- Cada campo solo se toca si su clave viene en p_data: el formulario de
-- datos, el de apariencia y la subida del logo guardan por separado sin
-- pisarse. Al crear, el nombre es obligatorio.
CREATE OR REPLACE FUNCTION public.sgrh_save_brand(p_actor uuid, p_empresa int, p_id int, p_data jsonb)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_id int; v_activa boolean; v_nombre text;
BEGIN
  v_usr := public.sgrh_assert_branch_admin(p_actor, p_empresa, false);
  -- Serializa el chequeo de nombre duplicado dentro de la empresa.
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_marca'), p_empresa);
  IF p_id IS NULL OR p_data ? 'mco_nombre' THEN
    v_nombre := trim(coalesce(p_data->>'mco_nombre', ''));
    IF length(v_nombre) NOT BETWEEN 2 AND 80 THEN
      RAISE EXCEPTION 'El nombre de la marca debe tener entre 2 y 80 caracteres.' USING ERRCODE='23514';
    END IF;
  END IF;
  IF (p_data ? 'mco_color_acento' AND (p_data->>'mco_color_acento') !~ '^#[0-9a-fA-F]{6}$')
    OR (p_data ? 'mco_color_sidebar' AND (p_data->>'mco_color_sidebar') !~ '^#[0-9a-fA-F]{6}$')
  THEN RAISE EXCEPTION 'Los colores deben ser hex válidos (ej. #0891B2).' USING ERRCODE='23514'; END IF;
  IF p_data ? 'mco_logo_path' AND (p_data->>'mco_logo_path') IS NOT NULL
    AND (p_data->>'mco_logo_path') NOT LIKE p_empresa::text || '/marcas/%'
  THEN RAISE EXCEPTION 'Ruta de logo inválida.' USING ERRCODE='42501'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT mco_id, mco_activa INTO v_id, v_activa FROM public.sgrh_marcas_comerciales
    WHERE mco_id=p_id AND mco_empresa_id=p_empresa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Marca no encontrada.' USING ERRCODE='42501'; END IF;
  END IF;
  IF v_nombre IS NOT NULL AND EXISTS (SELECT 1 FROM public.sgrh_marcas_comerciales WHERE mco_empresa_id=p_empresa
      AND lower(trim(mco_nombre))=lower(v_nombre) AND mco_id IS DISTINCT FROM p_id)
  THEN RAISE EXCEPTION 'Ya existe una marca con ese nombre.' USING ERRCODE='23514'; END IF;
  IF v_activa AND p_data ? 'mco_activa' AND NOT coalesce((p_data->>'mco_activa')::boolean, true) AND EXISTS (
    SELECT 1 FROM public.sgrh_sucursales WHERE suc_marca_id=p_id AND suc_activa)
  THEN RAISE EXCEPTION 'Antes de desactivar la marca, desactivá o mové sus sucursales activas.' USING ERRCODE='23514'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.sgrh_marcas_comerciales(mco_empresa_id, mco_nombre)
    VALUES (p_empresa, v_nombre) RETURNING mco_id INTO v_id;
  END IF;
  UPDATE public.sgrh_marcas_comerciales SET
    mco_nombre = coalesce(v_nombre, mco_nombre),
    mco_activa = CASE WHEN p_data ? 'mco_activa' THEN coalesce((p_data->>'mco_activa')::boolean, true) ELSE mco_activa END,
    mco_color_acento  = CASE WHEN p_data ? 'mco_color_acento'  THEN p_data->>'mco_color_acento'  ELSE mco_color_acento  END,
    mco_color_sidebar = CASE WHEN p_data ? 'mco_color_sidebar' THEN p_data->>'mco_color_sidebar' ELSE mco_color_sidebar END,
    mco_logo_path     = CASE WHEN p_data ? 'mco_logo_path'     THEN p_data->>'mco_logo_path'     ELSE mco_logo_path     END,
    mco_updated_at = now()
  WHERE mco_id = v_id;
  INSERT INTO public.sgrh_config_auditoria(aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'marca', v_id::text, CASE WHEN p_id IS NULL THEN 'crear' ELSE 'actualizar' END);
  RETURN v_id;
END $$;

-- ─── 6. RPC: guardar sucursal, ahora con marca ───────────────────────────────
-- Misma firma y mismo cuerpo que en 20261106185915, más `suc_marca_id`:
-- - si la clave NO viene en p_data (frontend anterior), la marca no cambia;
-- - si viene, es obligatoria y tiene que ser una marca de la misma empresa,
--   activa (o la que la sucursal ya tenía).
-- La obligatoriedad absoluta la pone la fase 2 (NOT NULL).
CREATE OR REPLACE FUNCTION public.sgrh_save_branch(p_actor uuid,p_empresa int,p_id int,p_data jsonb,p_direccion jsonb)
RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_id int; v_dir int; v_activa boolean; v_marca int; v_marca_actual int;
BEGIN
  v_usr:=public.sgrh_assert_branch_admin(p_actor,p_empresa,false);
  -- Serialize duplicate-code checks per company without imposing a constraint
  -- on legacy duplicate codes until administrators have resolved them.
  PERFORM pg_advisory_xact_lock(103,p_empresa);
  IF length(trim(coalesce(p_data->>'suc_nombre',''))) NOT BETWEEN 2 AND 100
    OR coalesce((p_data->>'suc_radio_geocerca_metros')::int,0) NOT BETWEEN 1 AND 10000
    OR ((p_data->>'suc_latitud') IS NULL) <> ((p_data->>'suc_longitud') IS NULL)
    OR (p_data->>'suc_latitud')::numeric NOT BETWEEN -90 AND 90
    OR (p_data->>'suc_longitud')::numeric NOT BETWEEN -180 AND 180
  THEN RAISE EXCEPTION 'Revisá los datos de la sucursal.' USING ERRCODE='23514'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT suc_id,suc_direccion_id,suc_activa,suc_marca_id INTO v_id,v_dir,v_activa,v_marca_actual FROM public.sgrh_sucursales
    WHERE suc_id=p_id AND suc_empresa_id=p_empresa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sucursal no encontrada.' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_data ? 'suc_marca_id' THEN
    v_marca := (p_data->>'suc_marca_id')::int;
    IF v_marca IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.sgrh_marcas_comerciales WHERE mco_id=v_marca AND mco_empresa_id=p_empresa
        AND (mco_activa OR mco_id IS NOT DISTINCT FROM v_marca_actual)
    ) THEN RAISE EXCEPTION 'Elegí una marca activa de tu empresa.' USING ERRCODE='23514'; END IF;
  ELSE
    v_marca := v_marca_actual;
  END IF;
  IF nullif(trim(p_data->>'suc_codigo_interno'),'') IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.sgrh_sucursales WHERE suc_empresa_id=p_empresa
      AND lower(trim(suc_codigo_interno))=lower(trim(p_data->>'suc_codigo_interno'))
      AND suc_id IS DISTINCT FROM p_id
  ) THEN RAISE EXCEPTION 'El código interno ya pertenece a otra sucursal.' USING ERRCODE='23514'; END IF;
  IF v_activa AND NOT coalesce((p_data->>'suc_activa')::boolean,true) THEN
    IF EXISTS (SELECT 1 FROM public.sgrh_historial_laboral WHERE lab_sucursal_id=p_id AND lab_fecha_fin IS NULL)
      OR EXISTS (SELECT 1 FROM public.sgrh_programacion_semanal WHERE prg_sucursal_id=p_id AND prg_fecha >= (now() AT TIME ZONE 'America/Costa_Rica')::date)
      OR EXISTS (SELECT 1 FROM (
        SELECT DISTINCT ON (mar_historial_laboral_id,mar_fecha_hora::date) mar_tipo
        FROM public.sgrh_marcas_asistencia WHERE mar_sucursal_id=p_id
          AND mar_fecha_hora::date >= (now() AT TIME ZONE 'America/Costa_Rica')::date-1
        ORDER BY mar_historial_laboral_id,mar_fecha_hora::date,mar_fecha_hora DESC,mar_id DESC
      ) jornadas WHERE mar_tipo<>'salida')
      OR EXISTS (SELECT 1 FROM public.sgrh_kioscos WHERE kio_sucursal_id=p_id AND kio_estado<>'bloqueado')
    THEN RAISE EXCEPTION 'Antes de desactivar, resolvé contratos vigentes, jornadas abiertas y programación actual/futura; bloqueá sus kioscos.' USING ERRCODE='23514'; END IF;
  END IF;
  IF p_direccion IS NOT NULL AND p_direccion <> 'null'::jsonb THEN
    IF length(trim(coalesce(p_direccion->>'dir_senas_exactas',''))) NOT BETWEEN 10 AND 300 THEN
      RAISE EXCEPTION 'Completá las señas exactas de la dirección.' USING ERRCODE='23514'; END IF;
    -- Copy-on-write: legacy addresses may be referenced by more than one entity.
    IF v_dir IS NULL OR NOT EXISTS (SELECT 1 FROM public.sgrh_direcciones WHERE dir_id=v_dir
      AND dir_distrito_id=(p_direccion->>'dir_distrito_id')::int
      AND dir_senas_exactas=trim(p_direccion->>'dir_senas_exactas')) THEN
      INSERT INTO public.sgrh_direcciones(dir_distrito_id,dir_senas_exactas)
      VALUES ((p_direccion->>'dir_distrito_id')::int,trim(p_direccion->>'dir_senas_exactas')) RETURNING dir_id INTO v_dir;
    END IF;
  END IF;
  IF v_id IS NULL THEN
    -- La marca va ya en el INSERT: con la fase 2 (NOT NULL) un INSERT sin
    -- ella fallaría antes de llegar al UPDATE.
    INSERT INTO public.sgrh_sucursales(suc_empresa_id,suc_nombre,suc_marca_id) VALUES(p_empresa,trim(p_data->>'suc_nombre'),v_marca) RETURNING suc_id INTO v_id;
  END IF;
  UPDATE public.sgrh_sucursales SET suc_nombre=trim(p_data->>'suc_nombre'),
    suc_codigo_interno=nullif(trim(p_data->>'suc_codigo_interno'),''),suc_telefono=nullif(trim(p_data->>'suc_telefono'),''),
    suc_email_sucursal=nullif(trim(p_data->>'suc_email_sucursal'),''),suc_latitud=(p_data->>'suc_latitud')::numeric,
    suc_longitud=(p_data->>'suc_longitud')::numeric,suc_radio_geocerca_metros=(p_data->>'suc_radio_geocerca_metros')::int,
    suc_activa=coalesce((p_data->>'suc_activa')::boolean,true),suc_direccion_id=v_dir,suc_marca_id=v_marca WHERE suc_id=v_id;
  INSERT INTO public.sgrh_config_auditoria(aud_empresa_id,aud_usuario_id,aud_entidad,aud_referencia,aud_accion)
    VALUES(p_empresa,v_usr,'sucursal',v_id::text,CASE WHEN p_id IS NULL THEN 'crear' ELSE 'actualizar' END);
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.sgrh_save_brand(uuid,int,int,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_save_brand(uuid,int,int,jsonb) TO service_role;
-- CREATE OR REPLACE conserva los grants de sgrh_save_branch; se repiten por
-- si alguien aplicó a mano una versión sin ellos.
REVOKE ALL ON FUNCTION public.sgrh_save_branch(uuid,int,int,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_save_branch(uuid,int,int,jsonb,jsonb) TO service_role;

-- ─── 7. Documentación ────────────────────────────────────────────────────────
COMMENT ON TABLE public.sgrh_marcas_comerciales IS
  'Marcas comerciales de una empresa: agrupan sucursales (tiendas físicas) y llevan su identidad visual. No es un límite de alcance: la RLS operativa sigue siendo por sucursal. Se escribe solo por la RPC sgrh_save_brand.';
COMMENT ON COLUMN public.sgrh_marcas_comerciales.mco_activa IS
  'false = no se ofrece al crear o mover sucursales. No se puede desactivar con sucursales activas.';
COMMENT ON COLUMN public.sgrh_marcas_comerciales.mco_color_acento IS
  'Hex #RRGGBB del acento del shell para las sucursales de la marca. NULL = cae al tema de la empresa.';
COMMENT ON COLUMN public.sgrh_marcas_comerciales.mco_color_sidebar IS
  'Hex #RRGGBB de la barra lateral para las sucursales de la marca. NULL = cae al tema de la empresa.';
COMMENT ON COLUMN public.sgrh_marcas_comerciales.mco_logo_path IS
  'RUTA (no URL) del logo en el bucket privado logos-empresa (<empresa_id>/marcas/<mco_id>/<uuid>.<ext>). NULL = se muestra el logo de la empresa.';
COMMENT ON COLUMN public.sgrh_sucursales.suc_marca_id IS
  'Marca comercial a la que pertenece la tienda (misma empresa, FK compuesta). NULL solo mientras dura la migración de marcas; la fase 2 la vuelve NOT NULL.';
COMMENT ON COLUMN public.sgrh_empresas.org_color_acento IS
  'Hex del acento del shell cuando no hay marca en contexto (vista de toda la empresa). NULL = color por defecto del sistema.';
COMMENT ON COLUMN public.sgrh_empresas.org_color_sidebar IS
  'Hex de la barra lateral cuando no hay marca en contexto. NULL = color por defecto del sistema.';
COMMIT;
