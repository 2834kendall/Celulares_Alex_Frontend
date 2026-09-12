-- =====================================================================
-- Índice único de provisiones anuales por empleado y ciclo
-- =====================================================================
-- Misma clase de agujero que arreglaron los índices de nómina
-- (20260912120000): la tabla se escribe con un "buscá la fila, y si no
-- está insertala", y sin índice único nada impide que dos ejecuciones
-- simultáneas encuentren las dos que no está y las dos inserten.
--
-- Acá pasa al marcar un pago: acumularProvisionAguinaldo (ver
-- marcarDetallePagado.ts) busca la provisión del empleado para el ciclo y
-- la crea si no existe. Dos pagos marcados a la vez dejan dos filas del
-- mismo ciclo, y la pantalla de aguinaldo lee una sola con maybeSingle:
-- el empleado aparece con la mitad de lo que lleva acumulado.
--
-- El ciclo va de diciembre a noviembre, así que pra_anio ya es el año del
-- CICLO y no el del periodo (ver anioCicloAguinaldo en lib/liquidacion.ts).
--
-- Si la base ya tiene duplicados, esta migración falla — y está bien que
-- falle: cuál de las dos filas es la buena no lo puede decidir una
-- migración. El bloque 4 de supabase/scripts/recalcular-bruto-y-aguinaldo.sql
-- los lista para resolverlos antes.
-- =====================================================================

CREATE UNIQUE INDEX IF NOT EXISTS sgrh_provision_anual_unica
  ON public.sgrh_provisiones_anuales (pra_historial_laboral_id, pra_anio);
