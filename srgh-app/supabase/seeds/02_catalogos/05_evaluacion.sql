-- =====================================================================
-- Catálogos de evaluación de desempeño
-- =====================================================================
-- ATENCIÓN — este seed corrige un error de datos del proyecto original.
--
-- En la base actual, 18 de los 21 criterios están colgados del área
-- equivocada: el área "Trabajo en Equipo" tenía el criterio "Se presenta
-- puntualmente", el área "Orden y Limpieza" tenía "Utiliza herramientas
-- tecnológicas", etc. Los criterios se insertaron asumiendo un orden de
-- áreas distinto al que quedó. Acá se siembra el mapeo correcto.
--
-- Para arreglar el proyecto que YA tiene los datos cruzados, ver
-- supabase/scripts/fix-mapeo-criterios-evaluacion.sql.
--
-- Dos consecuencias de la corrección, dejadas a la vista a propósito:
--   * el área 4 "Calidad del Trabajo" queda sin criterio (ninguna de las
--     descripciones existentes le corresponde);
--   * el área 11 "Manejo de Caja" queda con dos (cri 11 y cri 18), que sí
--     hablan las dos de caja.
-- Agregar o fusionar criterios es decisión del dueño del módulo, no de una
-- migración de infraestructura.
--
-- No se siembra el área 21 "procrastina" ni su criterio: son datos de prueba.
-- =====================================================================

-- ─── 1. Áreas de evaluación ─────────────────────────────────────────────────

INSERT INTO public.sgrh_cat_areas_evaluacion (are_id, are_nombre, are_tipo_aplicacion, are_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  'Desempeño General',                'ambos',          true),
  (2,  'Puntualidad y Asistencia',         'ambos',          true),
  (3,  'Trabajo en Equipo',                'ambos',          true),
  (4,  'Calidad del Trabajo',              'operativo',      true),
  (5,  'Servicio al Cliente',              'operativo',      true),
  (6,  'Liderazgo',                        'administrativo', true),
  (7,  'Comunicación',                     'ambos',          true),
  (8,  'Iniciativa y Proactividad',        'ambos',          true),
  (9,  'Cumplimiento de Metas',            'administrativo', true),
  (10, 'Conocimiento Técnico',             'operativo',      true),
  (11, 'Manejo de Caja',                   'operativo',      true),
  (12, 'Orden y Limpieza',                 'operativo',      true),
  (13, 'Adaptabilidad al Cambio',          'ambos',          true),
  (14, 'Resolución de Problemas',          'ambos',          true),
  (15, 'Gestión del Tiempo',               'administrativo', true),
  (16, 'Ética y Valores',                  'ambos',          true),
  (17, 'Uso de Herramientas Tecnológicas', 'administrativo', true),
  (18, 'Seguridad Ocupacional',            'operativo',      true),
  (19, 'Relaciones Interpersonales',       'ambos',          true),
  (20, 'Capacidad de Aprendizaje',         'ambos',          true)
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_areas_evaluacion', 'are_id'),
              COALESCE((SELECT MAX(are_id) FROM public.sgrh_cat_areas_evaluacion), 1), true);

-- ─── 2. Criterios de evaluación (mapeo corregido) ───────────────────────────
-- El comentario al lado de cada fila es el área a la que estaba asignada en
-- la base original, para poder auditar la corrección.

INSERT INTO public.sgrh_cat_criterios_evaluacion (cri_id, cri_area_id, cri_descripcion, cri_activo)
OVERRIDING SYSTEM VALUE
VALUES
  (1,  1,  'Se comporta adecuada al puesto',                              true), -- ya estaba correcto
  (2,  10, 'Demuestra dominio técnico de sus funciones',                  true), -- estaba en 2
  (3,  2,  'Se presenta puntualmente a su jornada laboral',               true), -- estaba en 3
  (4,  3,  'Colabora activamente con sus compañeros de equipo',           true), -- estaba en 4
  (5,  7,  'Comunica de forma clara y oportuna',                          true), -- estaba en 5
  (6,  8,  'Propone mejoras e ideas nuevas',                              true), -- estaba en 6
  (7,  9,  'Cumple las metas cuantitativas asignadas',                    true), -- estaba en 7
  (8,  13, 'Mantiene actitud positiva ante los cambios',                  true), -- estaba en 8
  (9,  14, 'Resuelve problemas de forma autónoma',                        true), -- estaba en 9
  (10, 15, 'Administra su tiempo de forma eficiente',                     true), -- estaba en 10
  (11, 11, 'cierra caja y el monto da bien',                              true), -- ya estaba correcto
  (12, 17, 'Utiliza correctamente las herramientas tecnológicas asignadas', true), -- estaba en 12
  (13, 18, 'Aplica los protocolos de seguridad ocupacional',              true), -- estaba en 13
  (14, 19, 'Mantiene buenas relaciones interpersonales',                  true), -- estaba en 14
  (15, 20, 'Muestra disposición a aprender y capacitarse',                true), -- estaba en 15
  (16, 5,  'Brinda atención de calidad al cliente interno/externo',       true), -- estaba en 16
  (17, 12, 'Mantiene el orden y limpieza en su puesto de trabajo',        true), -- estaba en 17
  (18, 11, 'Maneja correctamente los recursos de caja asignados',         true), -- estaba en 18
  (19, 6,  'Ejerce liderazgo positivo sobre su equipo',                   true), -- estaba en 19
  (20, 16, 'Cumple con las políticas internas de la empresa',             true)  -- estaba en 20
ON CONFLICT DO NOTHING;

SELECT setval(pg_get_serial_sequence('public.sgrh_cat_criterios_evaluacion', 'cri_id'),
              COALESCE((SELECT MAX(cri_id) FROM public.sgrh_cat_criterios_evaluacion), 1), true);
