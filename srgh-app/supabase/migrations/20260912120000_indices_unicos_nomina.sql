-- =====================================================================
-- SGRH — Índices únicos que faltaban en nómina
-- =====================================================================
-- Dos invariantes que la aplicación respeta pero la base no exigía. Ambos
-- son baratos de agregar y caros de descubrir en producción.
--
-- 1. Un empleado no puede aparecer dos veces en la misma quincena.
--
--    sgrh_nomina_periodo ya tiene su índice único (sgrh_nomina_periodo_unico,
--    migración 20260101000300) con un comentario que explica justo este
--    razonamiento: sin él, dos operaciones concurrentes crean dos filas que
--    la aplicación creía imposibles. Al detalle se le olvidó el equivalente.
--
--    uploadPlanilla resuelve cada cédula contra los contratos activos y
--    decide insertar o actualizar según lo que ya exista. Dos subidas
--    simultáneas de la misma planilla leen ambas "no existe" y ambas
--    insertan: el empleado queda con dos detalles en el mismo periodo y
--    cobra dos veces.
--
-- 2. Un pago no puede tener dos comprobantes.
--
--    marcarDetallePagado consulta si ya existe antes de emitir uno, misma
--    carrera: dos clics rápidos y salen dos códigos de verificación válidos
--    para el mismo pago.
--
-- ⚠️ Si la base YA tiene duplicados, la creación del índice falla. Antes de
--    aplicar esta migración conviene revisarlos con
--    supabase/scripts/revisar-duplicados-nomina.sql y resolverlos a mano —
--    cuál de las dos filas es la buena no lo puede decidir una migración.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS sgrh_nomina_detalle_unico
  ON public.sgrh_nomina_detalle (ndt_nomina_periodo_id, ndt_historial_laboral_id);

COMMENT ON INDEX public.sgrh_nomina_detalle_unico IS
  'Un empleado, una fila por periodo. Ver createPeriodo/uploadPlanilla.';

CREATE UNIQUE INDEX IF NOT EXISTS sgrh_comprobante_por_detalle
  ON public.sgrh_comprobantes_pago (com_nomina_detalle_id);

COMMENT ON INDEX public.sgrh_comprobante_por_detalle IS
  'Un comprobante por pago. Ver sincronizarComprobante en marcarDetallePagado.';
