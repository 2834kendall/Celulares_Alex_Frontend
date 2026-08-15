-- =====================================================================
-- SCRIPT ONE-OFF — corregir el mapeo criterio → área de evaluación
-- =====================================================================
-- ⚠️  NO es una migración. Se corre A MANO, una sola vez, contra un proyecto
-- que ya tenga los datos cruzados (el proyecto original,
-- paupjapsxvufinozlhss). Un proyecto nuevo nace correcto desde
-- seeds/02_catalogos/05_evaluacion.sql y NO necesita este script.
--
-- Por qué no es migración: las migraciones describen la forma de la base,
-- nunca mutan su contenido. Un UPDATE sobre datos existentes es una decisión
-- operativa que alguien tiene que tomar mirando su propia base.
--
-- ── El problema ─────────────────────────────────────────────────────────
-- 18 de los 21 criterios están asociados al área equivocada: los criterios
-- se insertaron asumiendo un orden de áreas distinto al que quedó. El área
-- "Trabajo en Equipo" tiene el criterio "Se presenta puntualmente"; el área
-- "Orden y Limpieza" tiene "Utiliza herramientas tecnológicas"; y así.
-- Los tres agregados a mano después (cri_id 1, 11, 21) sí están bien.
--
-- ── Antes de correrlo ───────────────────────────────────────────────────
-- Revisar qué evaluaciones ya usan estos criterios. Las respuestas ya
-- guardadas (sgrh_evaluacion_resultados) NO se mueven: siguen apuntando al
-- mismo criterio, que ahora cuelga del área correcta. O sea, una evaluación
-- vieja pasa a mostrarse bajo otra área. Es lo correcto, pero conviene
-- avisarle a quien mantiene el módulo de evaluaciones antes de aplicarlo.
--
--   SELECT c.cri_id, c.cri_descripcion, count(r.evr_id) AS respuestas
--   FROM public.sgrh_cat_criterios_evaluacion c
--   LEFT JOIN public.sgrh_evaluacion_resultados r ON r.evr_criterio_id = c.cri_id
--   GROUP BY c.cri_id, c.cri_descripcion ORDER BY c.cri_id;
--
-- Idempotente: filtra por la descripción esperada, así que re-correrlo no
-- hace nada y no pisa criterios que alguien haya editado a mano.
-- =====================================================================

BEGIN;

UPDATE public.sgrh_cat_criterios_evaluacion AS c
SET cri_area_id = m.area_correcta
FROM (VALUES
  (2,  10, 'Demuestra dominio técnico de sus funciones'),
  (3,  2,  'Se presenta puntualmente a su jornada laboral'),
  (4,  3,  'Colabora activamente con sus compañeros de equipo'),
  (5,  7,  'Comunica de forma clara y oportuna'),
  (6,  8,  'Propone mejoras e ideas nuevas'),
  (7,  9,  'Cumple las metas cuantitativas asignadas'),
  (8,  13, 'Mantiene actitud positiva ante los cambios'),
  (9,  14, 'Resuelve problemas de forma autónoma'),
  (10, 15, 'Administra su tiempo de forma eficiente'),
  (12, 17, 'Utiliza correctamente las herramientas tecnológicas asignadas'),
  (13, 18, 'Aplica los protocolos de seguridad ocupacional'),
  (14, 19, 'Mantiene buenas relaciones interpersonales'),
  (15, 20, 'Muestra disposición a aprender y capacitarse'),
  (16, 5,  'Brinda atención de calidad al cliente interno/externo'),
  (17, 12, 'Mantiene el orden y limpieza en su puesto de trabajo'),
  (18, 11, 'Maneja correctamente los recursos de caja asignados'),
  (19, 6,  'Ejerce liderazgo positivo sobre su equipo'),
  (20, 16, 'Cumple con las políticas internas de la empresa')
) AS m(cri_id, area_correcta, descripcion_esperada)
WHERE c.cri_id = m.cri_id
  -- Solo toca la fila si sigue siendo la que este script espera encontrar.
  AND c.cri_descripcion = m.descripcion_esperada
  AND c.cri_area_id <> m.area_correcta;

-- Verificación: debe listar cada criterio bajo un área coherente.
-- Revisar la salida ANTES de hacer COMMIT.
SELECT c.cri_id, a.are_nombre AS area, c.cri_descripcion
FROM public.sgrh_cat_criterios_evaluacion c
JOIN public.sgrh_cat_areas_evaluacion a ON a.are_id = c.cri_area_id
ORDER BY c.cri_id;

COMMIT;
