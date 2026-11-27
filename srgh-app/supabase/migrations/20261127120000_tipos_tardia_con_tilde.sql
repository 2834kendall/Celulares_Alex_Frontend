-- SGRH-123: los tipos de tardía por defecto se crearon sin tilde
-- ('Tardia leve', 'Tardia', 'Tardia grave') y así se ven en Asistencia y en
-- Configuración.
--
-- 1. Les pone la tilde solo a los que siguen con el nombre de fábrica. Si una
--    empresa ya les cambió el nombre, se respeta.
-- 2. La función que los crea para cada empresa nueva los crea con tilde.
--    CREATE OR REPLACE conserva los permisos: sigue sin poder ejecutarla
--    nadie por la API (20261124202800_revoke_trigger_function_execute.sql).
--
-- Idempotente: correrla dos veces no cambia nada.

UPDATE public.sgrh_cat_tipos_tardia
SET tta_nombre = CASE tta_nombre
  WHEN 'Tardia leve' THEN 'Tardía leve'
  WHEN 'Tardia' THEN 'Tardía'
  WHEN 'Tardia grave' THEN 'Tardía grave'
END
WHERE tta_nombre IN ('Tardia leve', 'Tardia', 'Tardia grave');

CREATE OR REPLACE FUNCTION public.sgrh_crear_tipos_tardia_por_defecto()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.sgrh_cat_tipos_tardia
    (tta_empresa_id, tta_nombre, tta_desde_minutos, tta_cuenta_advertencia, tta_color)
  VALUES
    (new.org_id, 'Tardía leve',  1,  true, '#F59E0B'),
    (new.org_id, 'Tardía',       6,  true, '#EA580C'),
    (new.org_id, 'Tardía grave', 11, true, '#E11D48')
  ON CONFLICT (tta_empresa_id, tta_desde_minutos) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
