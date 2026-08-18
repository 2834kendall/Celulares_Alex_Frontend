-- =====================================================================
-- Catálogo de etapas de selección
-- =====================================================================
-- eta_orden define la secuencia del embudo de reclutamiento. No todas las
-- etapas aplican a todas las vacantes: la postulación registra solo por las
-- que pasa, en sgrh_postulacion_etapas.
-- =====================================================================

INSERT INTO public.sgrh_cat_etapas_seleccion (eta_id, eta_nombre, eta_orden, eta_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'Recepción de CV',                 1,  true),
  (2,  'Filtro Curricular',               2,  true),
  (3,  'Entrevista Telefónica',           3,  true),
  (4,  'Prueba Técnica',                  4,  true),
  (5,  'Prueba Psicométrica',             5,  true),
  (6,  'Entrevista con RRHH',             6,  true),
  (7,  'Entrevista con Jefatura',         7,  true),
  (8,  'Verificación de Referencias',     8,  true),
  (9,  'Estudio de Antecedentes',         9,  true),
  (10, 'Examen Médico Pre-empleo',        10, true),
  (11, 'Oferta Laboral',                  11, true),
  (12, 'Negociación de Condiciones',      12, true),
  (13, 'Firma de Contrato',               13, true),
  (14, 'Inducción General',               14, true),
  (15, 'Inducción al Puesto',             15, true),
  (16, 'Período de Prueba',               16, true),
  (17, 'Evaluación de Período de Prueba', 17, true),
  (18, 'Contratación Definitiva',         18, true),
  (19, 'Segunda Entrevista Técnica',      19, true),
  (20, 'Assessment Center',               20, true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_etapas_seleccion', 'eta_id'),
              COALESCE((SELECT MAX(eta_id) FROM public.sgrh_cat_etapas_seleccion), 1), true);
