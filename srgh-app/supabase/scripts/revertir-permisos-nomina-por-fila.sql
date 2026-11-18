-- Revierte SOLO los permisos (RLS) de la migración 20261117130000: las filas
-- de planilla, sus líneas y sus comprobantes vuelven a decidirse por la
-- sucursal del PERIODO, como antes.
--
-- Sirve únicamente mientras los periodos sigan siendo por sucursal (antes de
-- la migración 20261118120000). Con periodos de toda la empresa estas reglas
-- no dejarían ver ninguna fila a las cuentas con sucursal asignada.
--
-- No quita la columna ndt_sucursal_id ni las funciones nuevas: no estorban.
-- Son las definiciones tal como estaban en la base (pg_policies).

BEGIN;

DROP POLICY IF EXISTS comprobantes_delete ON public.sgrh_comprobantes_pago;
CREATE POLICY comprobantes_delete ON public.sgrh_comprobantes_pago FOR DELETE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (com_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS comprobantes_insert ON public.sgrh_comprobantes_pago;
CREATE POLICY comprobantes_insert ON public.sgrh_comprobantes_pago FOR INSERT TO authenticated
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (com_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS comprobantes_select ON public.sgrh_comprobantes_pago;
CREATE POLICY comprobantes_select ON public.sgrh_comprobantes_pago FOR SELECT TO authenticated
  USING (((com_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_historial_laboral_id IN ( SELECT sgrh_historial_laboral.lab_id
           FROM sgrh_historial_laboral
          WHERE (sgrh_historial_laboral.lab_empleado_id = ( SELECT get_emp_id() AS get_emp_id)))))) OR (( SELECT tiene_permiso('NOMINA_READ'::text) AS tiene_permiso) AND (com_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible)))))))));
DROP POLICY IF EXISTS comprobantes_update ON public.sgrh_comprobantes_pago;
CREATE POLICY comprobantes_update ON public.sgrh_comprobantes_pago FOR UPDATE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (com_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))))
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (com_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_detalle_delete ON public.sgrh_nomina_detalle;
CREATE POLICY nomina_detalle_delete ON public.sgrh_nomina_detalle FOR DELETE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
   FROM sgrh_nomina_periodo
  WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))));
DROP POLICY IF EXISTS nomina_detalle_insert ON public.sgrh_nomina_detalle;
CREATE POLICY nomina_detalle_insert ON public.sgrh_nomina_detalle FOR INSERT TO authenticated
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
   FROM sgrh_nomina_periodo
  WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))));
DROP POLICY IF EXISTS nomina_detalle_select ON public.sgrh_nomina_detalle;
CREATE POLICY nomina_detalle_select ON public.sgrh_nomina_detalle FOR SELECT TO authenticated
  USING (((( SELECT tiene_permiso('NOMINA_READ'::text) AS tiene_permiso) AND (ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
   FROM sgrh_nomina_periodo
  WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))) OR (ndt_historial_laboral_id IN ( SELECT sgrh_historial_laboral.lab_id
   FROM sgrh_historial_laboral
  WHERE (sgrh_historial_laboral.lab_empleado_id = ( SELECT get_emp_id() AS get_emp_id))))));
DROP POLICY IF EXISTS nomina_detalle_update ON public.sgrh_nomina_detalle;
CREATE POLICY nomina_detalle_update ON public.sgrh_nomina_detalle FOR UPDATE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
   FROM sgrh_nomina_periodo
  WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
   FROM sgrh_nomina_periodo
  WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))));
DROP POLICY IF EXISTS nomina_lineas_deduccion_delete ON public.sgrh_nomina_linea_deduccion;
CREATE POLICY nomina_lineas_deduccion_delete ON public.sgrh_nomina_linea_deduccion FOR DELETE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ded_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_deduccion_insert ON public.sgrh_nomina_linea_deduccion;
CREATE POLICY nomina_lineas_deduccion_insert ON public.sgrh_nomina_linea_deduccion FOR INSERT TO authenticated
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ded_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_deduccion_select ON public.sgrh_nomina_linea_deduccion;
CREATE POLICY nomina_lineas_deduccion_select ON public.sgrh_nomina_linea_deduccion FOR SELECT TO authenticated
  USING (((ded_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_historial_laboral_id IN ( SELECT sgrh_historial_laboral.lab_id
           FROM sgrh_historial_laboral
          WHERE (sgrh_historial_laboral.lab_empleado_id = ( SELECT get_emp_id() AS get_emp_id)))))) OR (( SELECT tiene_permiso('NOMINA_READ'::text) AS tiene_permiso) AND (ded_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible)))))))));
DROP POLICY IF EXISTS nomina_lineas_deduccion_update ON public.sgrh_nomina_linea_deduccion;
CREATE POLICY nomina_lineas_deduccion_update ON public.sgrh_nomina_linea_deduccion FOR UPDATE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ded_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))))
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ded_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_ingreso_delete ON public.sgrh_nomina_linea_ingreso;
CREATE POLICY nomina_lineas_ingreso_delete ON public.sgrh_nomina_linea_ingreso FOR DELETE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ing_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_ingreso_insert ON public.sgrh_nomina_linea_ingreso;
CREATE POLICY nomina_lineas_ingreso_insert ON public.sgrh_nomina_linea_ingreso FOR INSERT TO authenticated
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ing_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_ingreso_select ON public.sgrh_nomina_linea_ingreso;
CREATE POLICY nomina_lineas_ingreso_select ON public.sgrh_nomina_linea_ingreso FOR SELECT TO authenticated
  USING (((ing_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_historial_laboral_id IN ( SELECT sgrh_historial_laboral.lab_id
           FROM sgrh_historial_laboral
          WHERE (sgrh_historial_laboral.lab_empleado_id = ( SELECT get_emp_id() AS get_emp_id)))))) OR (( SELECT tiene_permiso('NOMINA_READ'::text) AS tiene_permiso) AND (ing_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible)))))))));
DROP POLICY IF EXISTS nomina_lineas_ingreso_update ON public.sgrh_nomina_linea_ingreso;
CREATE POLICY nomina_lineas_ingreso_update ON public.sgrh_nomina_linea_ingreso FOR UPDATE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ing_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))))
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (ing_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_patronal_delete ON public.sgrh_nomina_linea_patronal;
CREATE POLICY nomina_lineas_patronal_delete ON public.sgrh_nomina_linea_patronal FOR DELETE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (pat_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_patronal_insert ON public.sgrh_nomina_linea_patronal;
CREATE POLICY nomina_lineas_patronal_insert ON public.sgrh_nomina_linea_patronal FOR INSERT TO authenticated
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (pat_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));
DROP POLICY IF EXISTS nomina_lineas_patronal_select ON public.sgrh_nomina_linea_patronal;
CREATE POLICY nomina_lineas_patronal_select ON public.sgrh_nomina_linea_patronal FOR SELECT TO authenticated
  USING (((pat_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_historial_laboral_id IN ( SELECT sgrh_historial_laboral.lab_id
           FROM sgrh_historial_laboral
          WHERE (sgrh_historial_laboral.lab_empleado_id = ( SELECT get_emp_id() AS get_emp_id)))))) OR (( SELECT tiene_permiso('NOMINA_READ'::text) AS tiene_permiso) AND (pat_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible)))))))));
DROP POLICY IF EXISTS nomina_lineas_patronal_update ON public.sgrh_nomina_linea_patronal;
CREATE POLICY nomina_lineas_patronal_update ON public.sgrh_nomina_linea_patronal FOR UPDATE TO authenticated
  USING ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (pat_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))))
  WITH CHECK ((( SELECT tiene_permiso('NOMINA_WRITE'::text) AS tiene_permiso) AND (pat_nomina_detalle_id IN ( SELECT sgrh_nomina_detalle.ndt_id
   FROM sgrh_nomina_detalle
  WHERE (sgrh_nomina_detalle.ndt_nomina_periodo_id IN ( SELECT sgrh_nomina_periodo.npe_id
           FROM sgrh_nomina_periodo
          WHERE ((sgrh_nomina_periodo.npe_empresa_id = ( SELECT get_empresa_id() AS get_empresa_id)) AND ( SELECT sucursal_visible(sgrh_nomina_periodo.npe_sucursal_id) AS sucursal_visible))))))));

COMMIT;

NOTIFY pgrst, 'reload schema';
