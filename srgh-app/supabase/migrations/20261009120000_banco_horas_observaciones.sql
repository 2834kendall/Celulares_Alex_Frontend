-- Nota al resolver un movimiento del banco de horas.
--
-- Antes del arreglo de la auditoría (hallazgo 4, 20261008130000), liquidar a
-- alguien dejaba sus horas pendientes del banco fuera del finiquito. Esas
-- horas ya no se pueden pagar por planilla: la persona no tiene quincenas
-- abiertas. Lo único que queda es registrar qué se hizo con ellas (por
-- ejemplo, que se le pagaron por fuera) al marcarlas como compensadas, y eso
-- necesita dónde escribirlo.
--
-- Solo agrega una columna opcional: no cambia datos ni permisos. IF NOT
-- EXISTS permite correrla otra vez sin error.

ALTER TABLE public.sgrh_banco_horas_movimientos
  ADD COLUMN IF NOT EXISTS bhm_observaciones text;

COMMENT ON COLUMN public.sgrh_banco_horas_movimientos.bhm_observaciones IS
  'Nota de quien resolvió el movimiento. Obligatoria al compensar horas de alguien ya liquidado (que quedaron fuera de su liquidación).';

NOTIFY pgrst, 'reload schema';
