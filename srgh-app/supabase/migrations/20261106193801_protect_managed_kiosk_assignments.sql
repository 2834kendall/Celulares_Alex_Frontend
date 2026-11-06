-- SGRH-103: enforce the managed-account invariant even through generic
-- assignment endpoints and concurrent transactions, not just application UI.
BEGIN;
CREATE SCHEMA IF NOT EXISTS sgrh_private;
CREATE FUNCTION sgrh_private.check_managed_kiosk_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_old int; v_new int; v_usr int; v_k public.sgrh_kioscos;
BEGIN
  IF TG_TABLE_NAME='sgrh_kioscos' THEN
    IF TG_OP<>'INSERT' THEN v_old:=OLD.kio_usuario_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new:=NEW.kio_usuario_id; END IF;
  ELSIF TG_TABLE_NAME='sgrh_usuarios_empresa_rol' THEN
    IF TG_OP<>'INSERT' THEN v_old:=OLD.uer_usuario_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new:=NEW.uer_usuario_id; END IF;
  ELSE
    IF TG_OP<>'INSERT' THEN v_old:=OLD.usr_id; END IF;
    IF TG_OP<>'DELETE' THEN v_new:=NEW.usr_id; END IF;
  END IF;
  FOR v_usr IN SELECT DISTINCT x FROM unnest(ARRAY[v_old,v_new]) x WHERE x IS NOT NULL ORDER BY x LOOP
    -- Serialize all changes for the same identity. Re-read after obtaining
    -- the lock so a concurrently completed registration is not overlooked.
    PERFORM 1 FROM public.sgrh_usuarios WHERE usr_id=v_usr FOR UPDATE;
    SELECT * INTO v_k FROM public.sgrh_kioscos WHERE kio_usuario_id=v_usr;
    IF NOT FOUND THEN CONTINUE; END IF;
    IF EXISTS(SELECT 1 FROM public.sgrh_usuarios WHERE usr_id=v_usr AND usr_empleado_id IS NOT NULL)
      OR (SELECT count(*) FROM public.sgrh_usuarios_empresa_rol WHERE uer_usuario_id=v_usr AND uer_activo)<>1
      OR NOT EXISTS (
        SELECT 1 FROM public.sgrh_usuarios_empresa_rol a
        JOIN public.sgrh_cat_roles r ON r.rol_id=a.uer_rol_id
        WHERE a.uer_usuario_id=v_usr AND a.uer_activo AND a.uer_empresa_id=v_k.kio_empresa_id
          AND a.uer_sucursal_id=v_k.kio_sucursal_id AND r.rol_codigo='KIOSCO'
      ) THEN
      RAISE EXCEPTION 'La cuenta pertenece a un kiosco: debe conservar rol KIOSCO, una sucursal y ningún empleado. Usá Configuración → Sucursales y kioscos.' USING ERRCODE='23514';
    END IF;
  END LOOP;
  RETURN NULL;
END $$;
-- This private trigger needs owner-level reads across RLS boundaries to enforce
-- a global integrity constraint. It returns no records and is not a callable API.
REVOKE ALL ON FUNCTION sgrh_private.check_managed_kiosk_assignment() FROM PUBLIC,anon,authenticated;
CREATE CONSTRAINT TRIGGER managed_kiosk_account
  AFTER INSERT OR UPDATE OR DELETE ON public.sgrh_kioscos
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sgrh_private.check_managed_kiosk_assignment();
CREATE CONSTRAINT TRIGGER managed_kiosk_assignment
  AFTER INSERT OR UPDATE OR DELETE ON public.sgrh_usuarios_empresa_rol
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sgrh_private.check_managed_kiosk_assignment();
CREATE CONSTRAINT TRIGGER managed_kiosk_employee_link
  AFTER UPDATE ON public.sgrh_usuarios
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION sgrh_private.check_managed_kiosk_assignment();
COMMIT;
