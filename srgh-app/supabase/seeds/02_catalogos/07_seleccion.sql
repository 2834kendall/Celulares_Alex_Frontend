-- =====================================================================
-- Catálogo de criterios de selección (SGRH-61)
-- =====================================================================
-- Puntaje con el que RRHH compara candidatos de una misma postulación.
-- Mismo patrón "área + criterio" que sgrh_cat_areas_evaluacion /
-- sgrh_cat_criterios_evaluacion, pero en tablas propias de Reclutamiento
-- (sgrh_cat_areas_seleccion / sgrh_cat_criterios_seleccion): editable
-- desde la misma pantalla de catálogos (permiso CATALOGOS_WRITE), para
-- que RRHH pueda agregar o modificar criterios sin tocar código.
-- =====================================================================

INSERT INTO public.sgrh_cat_areas_seleccion (are_id, are_nombre, are_tipo_aplicacion, are_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'Perfil del Candidato', 'ambos', true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_areas_seleccion', 'are_id'),
              COALESCE((SELECT MAX(are_id) FROM public.sgrh_cat_areas_seleccion), 1), true);

INSERT INTO public.sgrh_cat_criterios_seleccion (cri_id, cri_area_id, cri_descripcion, cri_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Entregó todos los documentos solicitados',        true),
  (2, 1, 'Disponibilidad de horario',                        true),
  (3, 1, 'Formación académica',                               true),
  (4, 1, 'Experiencia',                                       true),
  (5, 1, 'Certificados',                                      true),
  (6, 1, 'Conocimientos técnicos',                            true),
  (7, 1, 'Habilidades blandas',                                true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_criterios_seleccion', 'cri_id'),
              COALESCE((SELECT MAX(cri_id) FROM public.sgrh_cat_criterios_seleccion), 1), true);
