-- =====================================================================
-- Catálogo de tipos de documento del expediente
-- =====================================================================
-- Catálogo global, sin UI de administración: si el negocio pide un tipo
-- nuevo, es una fila más acá.
--
-- El orden de los ids es el orden de despliegue en la UI. "Otro" va al final
-- a propósito — las consultas ordenan por tdo_id, no alfabéticamente.
-- =====================================================================

INSERT INTO public.sgrh_cat_tipos_documento (tdo_codigo, tdo_nombre) VALUES
  ('CONTRATO',          'Contrato'),
  ('IDENTIFICACION',    'Identificación'),
  ('CURRICULUM',        'Currículum'),
  ('TITULO_ACADEMICO',  'Título académico'),
  ('CERTIFICACION',     'Certificación'),
  ('INCAPACIDAD',       'Incapacidad'),
  ('HOJA_DELINCUENCIA', 'Hoja de delincuencia'),
  ('CARTA',             'Carta'),
  ('OTRO',              'Otro')
ON CONFLICT (tdo_codigo) DO NOTHING;
