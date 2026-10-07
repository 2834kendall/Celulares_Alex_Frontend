-- Índices para las consultas de nómina y asistencia más frecuentes.
--
-- Postgres no indexa solo las llaves foráneas. Sin estos índices, cada
-- lectura de un periodo (nomina_asistencia_periodo), cada recálculo y cada
-- borrado de una fila de planilla recorría las tablas completas, y esas
-- tablas crecen todos los años: la programación suma una fila por persona
-- por día, y las líneas de planilla varias por persona por quincena.
--
-- Solo crea índices: no cambia datos, columnas ni permisos. IF NOT EXISTS
-- permite correrla otra vez sin error.

-- Programación por contrato y fecha: la RPC nomina_asistencia_periodo filtra
-- prg_historial_laboral_id = ANY (...) AND prg_fecha BETWEEN ...
CREATE INDEX IF NOT EXISTS idx_programacion_contrato_fecha
  ON public.sgrh_programacion_semanal (prg_historial_laboral_id, prg_fecha);

-- Programación por sucursal y fecha: la matriz de horarios y la asistencia
-- diaria filtran por prg_sucursal_id y un rango de fechas.
CREATE INDEX IF NOT EXISTS idx_programacion_sucursal_fecha
  ON public.sgrh_programacion_semanal (prg_sucursal_id, prg_fecha);

-- Ausencias por contrato (planilla, aguinaldo, liquidación, vacaciones).
CREATE INDEX IF NOT EXISTS idx_ausencias_contrato_inicio
  ON public.sgrh_ausencias (aus_historial_laboral_id, aus_fecha_inicio);

-- Líneas de planilla por fila: se leen, reemplazan y borran por
-- *_nomina_detalle_id en cada guardado y en cada vista del periodo.
CREATE INDEX IF NOT EXISTS idx_linea_ingreso_detalle
  ON public.sgrh_nomina_linea_ingreso (ing_nomina_detalle_id);
CREATE INDEX IF NOT EXISTS idx_linea_deduccion_detalle
  ON public.sgrh_nomina_linea_deduccion (ded_nomina_detalle_id);
CREATE INDEX IF NOT EXISTS idx_linea_patronal_detalle
  ON public.sgrh_nomina_linea_patronal (pat_nomina_detalle_id);

-- Filas de planilla por contrato, sin periodo: aguinaldo, liquidación, banco
-- de horas. El índice único existente empieza por el periodo y no sirve acá.
CREATE INDEX IF NOT EXISTS idx_nomina_detalle_contrato
  ON public.sgrh_nomina_detalle (ndt_historial_laboral_id);

-- Llaves foráneas hacia sgrh_nomina_detalle sin índice: al borrar una fila,
-- Postgres revisa cada una recorriendo la tabla.
CREATE INDEX IF NOT EXISTS idx_banco_horas_detalle_pago
  ON public.sgrh_banco_horas_movimientos (bhm_nomina_detalle_pago_id);
CREATE INDEX IF NOT EXISTS idx_comisiones_detalle
  ON public.sgrh_comisiones_calculadas (cal_nomina_detalle_id);
