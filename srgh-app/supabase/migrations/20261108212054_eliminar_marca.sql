-- Borrar una marca creada por error.
--
-- Solo se puede si no tiene ninguna sucursal, ni activa ni inactiva: una marca
-- con historia se desactiva. Lo único que apunta a la marca es la FK de
-- sgrh_sucursales, así que borrarla no arrastra datos, y esa misma FK rechaza
-- una sucursal asignada justo después del chequeo. La auditoría guarda el id
-- como texto: sobrevive al borrado.
--
-- Devuelve la ruta del logo para que el servidor borre el objeto del bucket,
-- que no se puede hacer desde SQL.
BEGIN;

CREATE OR REPLACE FUNCTION public.sgrh_delete_brand(p_actor uuid, p_empresa int, p_id int)
RETURNS text LANGUAGE plpgsql SECURITY INVOKER SET search_path=public AS $$
DECLARE v_usr int; v_logo text;
BEGIN
  v_usr := public.sgrh_assert_branch_admin(p_actor, p_empresa, false);
  -- La misma llave que sgrh_save_brand: serializa contra un guardado de nombre.
  PERFORM pg_advisory_xact_lock(hashtext('sgrh_marca'), p_empresa);
  SELECT mco_logo_path INTO v_logo FROM public.sgrh_marcas_comerciales
  WHERE mco_id=p_id AND mco_empresa_id=p_empresa FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marca no encontrada.' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.sgrh_sucursales WHERE suc_marca_id=p_id)
  THEN RAISE EXCEPTION 'No se puede eliminar una marca con sucursales. Si ya no se usa, desactivala.' USING ERRCODE='23514'; END IF;
  DELETE FROM public.sgrh_marcas_comerciales WHERE mco_id=p_id AND mco_empresa_id=p_empresa;
  INSERT INTO public.sgrh_config_auditoria(aud_empresa_id, aud_usuario_id, aud_entidad, aud_referencia, aud_accion)
  VALUES (p_empresa, v_usr, 'marca', p_id::text, 'eliminar');
  RETURN v_logo;
END $$;

REVOKE ALL ON FUNCTION public.sgrh_delete_brand(uuid,int,int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sgrh_delete_brand(uuid,int,int) TO service_role;

COMMENT ON FUNCTION public.sgrh_delete_brand(uuid,int,int) IS
  'Borra una marca sin sucursales y audita. Devuelve la ruta del logo (o NULL) para limpiar el bucket.';
COMMENT ON TABLE public.sgrh_marcas_comerciales IS
  'Marcas comerciales de una empresa: agrupan sucursales (tiendas físicas) y llevan su identidad visual. No es un límite de alcance: la RLS operativa sigue siendo por sucursal. Se escribe solo por las RPC sgrh_save_brand y sgrh_delete_brand.';

COMMIT;
