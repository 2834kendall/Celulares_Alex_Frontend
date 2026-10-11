-- Limpia marcas de aguinaldo "pagado" del botón anterior que no son reales.
--
-- Antes del comprobante de aguinaldo (sgrh_pagos_extraordinarios), pagar el
-- aguinaldo solo prendía sgrh_provisiones_anuales.pra_aguinaldo_pagado con la
-- fecha que se escribiera. Quedaron marcas con fecha FUTURA y sin comprobante
-- (auditoría de nómina, hallazgo 2): el aguinaldo se mostraba como pagado con
-- un monto que cambiaba solo, y las filas de ese ciclo no se podían desmarcar.
--
-- Solo toca marcas con fecha posterior a hoy y sin ningún comprobante de
-- aguinaldo del mismo ciclo para el mismo empleado (en cualquiera de sus
-- contratos, por si hubo un traslado). Las marcas con fecha pasada no se
-- tocan. Se puede correr más de una vez.

DO $$
DECLARE
  v_limpiadas integer;
BEGIN
  UPDATE public.sgrh_provisiones_anuales pra
  SET pra_aguinaldo_pagado = false,
      pra_fecha_pago_aguinaldo = NULL
  WHERE pra.pra_aguinaldo_pagado
    AND pra.pra_fecha_pago_aguinaldo > current_date
    AND NOT EXISTS (
      SELECT 1
      FROM public.sgrh_pagos_extraordinarios pex
      JOIN public.sgrh_historial_laboral h_pex ON h_pex.lab_id = pex.pex_historial_laboral_id
      JOIN public.sgrh_historial_laboral h_pra ON h_pra.lab_id = pra.pra_historial_laboral_id
      WHERE pex.pex_tipo = 'aguinaldo'
        AND pex.pex_anio_aguinaldo = pra.pra_anio
        AND h_pex.lab_empleado_id = h_pra.lab_empleado_id
    );
  GET DIAGNOSTICS v_limpiadas = ROW_COUNT;
  RAISE NOTICE 'Marcas de aguinaldo antiguas con fecha futura limpiadas: %', v_limpiadas;
END $$;
