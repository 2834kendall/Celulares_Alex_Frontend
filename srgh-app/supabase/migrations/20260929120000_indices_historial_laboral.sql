-- =====================================================================
-- Índices de sgrh_historial_laboral para las policies RLS
-- =====================================================================
--
-- Preventivo: con decenas de filas Postgres prefiere un seq scan y el plan no
-- cambia hoy. Importa cuando la tabla crezca, porque no es una tabla más:
-- varias policies de OTRAS tablas la recorren en subconsultas, así que cada
-- verificación de RLS sobre ellas paga su costo.
--
--   edp_empleado_id IN (SELECT lab_empleado_id FROM sgrh_historial_laboral
--                       WHERE lab_empresa_id = (SELECT get_empresa_id()))
--   ... WHERE lab_empleado_id = (SELECT get_emp_id())
--
-- Hasta ahora el único índice sobre lab_empleado_id era el parcial
-- ux_historial_un_contrato_vigente (solo contratos abiertos), que no sirve a
-- las consultas que miran el historial completo. El viejo
-- idx_sgrh_his_lab_empleado se eliminó en 20260101000400 como duplicado de un
-- constraint que ya no existe.
--
-- Solo estos tres: un índice cuesta en cada escritura. El resto de las FKs
-- sin índice se agregan cuando una consulta real lo pida
-- (.context/SGRH_Mejoras_Rendimiento.md §3.5).
-- =====================================================================

CREATE INDEX IF NOT EXISTS sgrh_his_lab_empresa_idx
  ON public.sgrh_historial_laboral (lab_empresa_id);

CREATE INDEX IF NOT EXISTS sgrh_his_lab_empleado_idx
  ON public.sgrh_historial_laboral (lab_empleado_id);

CREATE INDEX IF NOT EXISTS sgrh_his_lab_sucursal_idx
  ON public.sgrh_historial_laboral (lab_sucursal_id);
