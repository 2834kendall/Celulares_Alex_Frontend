-- =====================================================================
-- Catálogo de criterios de selección (SGRH-61)
-- =====================================================================
-- Puntaje con el que RRHH compara candidatos de una misma postulación.
-- Mismo patrón "área + criterio" que sgrh_cat_areas_evaluacion /
-- sgrh_cat_criterios_evaluacion, pero en tablas propias de Reclutamiento
-- (sgrh_cat_areas_seleccion / sgrh_cat_criterios_seleccion): editable
-- desde Configuración → Criterios de selección (permiso CATALOGOS_WRITE),
-- para que RRHH pueda agregar o modificar criterios sin tocar código.
--
-- UN área por criterio: la pantalla de Configuración edita cada criterio
-- como un rubro (nombre + descripción + color + peso), y el color y el peso
-- viven en el área. Si varios criterios compartieran área, compartirían
-- también color y peso, y Configuración mostraría uno solo (ver
-- 20260924000000_criterios_seleccion_un_area_por_criterio.sql).
-- =====================================================================

INSERT INTO public.sgrh_cat_areas_seleccion (are_id, are_nombre, are_tipo_aplicacion, are_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 'Documentos',                'ambos', true),
  (2, 'Disponibilidad de horario', 'ambos', true),
  (3, 'Formación académica',       'ambos', true),
  (4, 'Experiencia',               'ambos', true),
  (5, 'Certificados',              'ambos', true),
  (6, 'Conocimientos técnicos',    'ambos', true),
  (7, 'Habilidades blandas',       'ambos', true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_areas_seleccion', 'are_id'),
              COALESCE((SELECT MAX(are_id) FROM public.sgrh_cat_areas_seleccion), 1), true);

INSERT INTO public.sgrh_cat_criterios_seleccion (cri_id, cri_area_id, cri_descripcion, cri_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1, 1, 'Entregó todos los documentos solicitados', true),
  (2, 2, 'Disponibilidad de horario',                true),
  (3, 3, 'Formación académica',                      true),
  (4, 4, 'Experiencia',                              true),
  (5, 5, 'Certificados',                             true),
  (6, 6, 'Conocimientos técnicos',                   true),
  (7, 7, 'Habilidades blandas',                      true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_criterios_seleccion', 'cri_id'),
              COALESCE((SELECT MAX(cri_id) FROM public.sgrh_cat_criterios_seleccion), 1), true);
