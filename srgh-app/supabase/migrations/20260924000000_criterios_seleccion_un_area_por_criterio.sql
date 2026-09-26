-- =====================================================================
-- SGRH-61 — Un criterio de selección por área (arreglo de datos)
-- =====================================================================
-- El problema: la pantalla Configuración → Criterios de selección trata
-- cada criterio como un "rubro" = UN área con UN criterio (mismo patrón
-- que evaluaciones). Por eso el color y el peso viven en el área
-- (are_color / are_peso, migración 20260922000000): cada criterio tiene
-- los suyos.
--
-- Pero el seed original colgó los 7 criterios de UNA sola área ("Perfil
-- del Candidato"). Resultado en la base real:
--   - Configuración mostraba 1 criterio; la ficha del candidato, 7.
--   - Los 7 compartían color y peso: no había forma de que "Experiencia"
--     pesara el doble sin cambiar también los otros seis.
--   - Borrar ese único rubro desactivaba los 7 de golpe.
--
-- El arreglo: cada criterio activo que comparte área con otro pasa a tener
-- su PROPIA área, con el mismo color, peso y tipo de aplicación que tenía
-- (así ningún promedio ya guardado cambia). Se mueve el criterio (UPDATE
-- de cri_area_id), no se recrea: su cri_id sigue igual y los puntajes ya
-- cargados en sgrh_postulacion_puntajes siguen apuntando a él.
--
-- Nombre del área nueva = nombre corto del criterio. Para los 7 del seed
-- se usa un nombre corto conocido; para cualquier otro, su descripción.
-- La descripción del criterio NO se toca.
--
-- Idempotente: si ya no quedan áreas con más de un criterio activo, no
-- hace nada. Tampoco depende de ids (los catálogos sembrados con
-- ON CONFLICT DO NOTHING pueden tener ids distintos entre entornos).
-- =====================================================================

DO $$
DECLARE
  r        record;
  base     text;
  nombre   text;
  intento  integer;
  nueva_id integer;
  movidos  integer := 0;
BEGIN
  -- Todos los criterios activos menos el primero (menor cri_id) de cada
  -- área compartida. El conjunto se calcula antes de empezar a mover.
  FOR r IN
    SELECT c.cri_id, c.cri_descripcion, a.are_tipo_aplicacion, a.are_color, a.are_peso
    FROM public.sgrh_cat_criterios_seleccion c
    JOIN public.sgrh_cat_areas_seleccion a ON a.are_id = c.cri_area_id
    WHERE c.cri_activo
      AND EXISTS (
        SELECT 1
        FROM public.sgrh_cat_criterios_seleccion o
        WHERE o.cri_area_id = c.cri_area_id
          AND o.cri_activo
          AND o.cri_id < c.cri_id
      )
    ORDER BY c.cri_id
  LOOP
    base := CASE r.cri_descripcion
      WHEN 'Entregó todos los documentos solicitados' THEN 'Documentos'
      WHEN 'Disponibilidad de horario' THEN 'Disponibilidad de horario'
      ELSE left(trim(r.cri_descripcion), 80)
    END;

    -- are_nombre es UNIQUE: si ya existe un área con ese nombre, se numera.
    nombre := base;
    intento := 1;
    WHILE EXISTS (SELECT 1 FROM public.sgrh_cat_areas_seleccion WHERE are_nombre = nombre) LOOP
      intento := intento + 1;
      nombre := left(base, 74) || ' (' || intento || ')';
    END LOOP;

    INSERT INTO public.sgrh_cat_areas_seleccion
      (are_nombre, are_tipo_aplicacion, are_activo, are_color, are_peso)
    VALUES
      (nombre, r.are_tipo_aplicacion, true, r.are_color, r.are_peso)
    RETURNING are_id INTO nueva_id;

    UPDATE public.sgrh_cat_criterios_seleccion
    SET cri_area_id = nueva_id
    WHERE cri_id = r.cri_id;

    movidos := movidos + 1;
  END LOOP;

  -- El área sembrada quedó solo con "Entregó todos los documentos
  -- solicitados": su nombre genérico ya no describe al criterio.
  UPDATE public.sgrh_cat_areas_seleccion a
  SET are_nombre = 'Documentos'
  WHERE a.are_nombre = 'Perfil del Candidato'
    AND NOT EXISTS (
      SELECT 1 FROM public.sgrh_cat_areas_seleccion WHERE are_nombre = 'Documentos'
    )
    AND (
      SELECT count(*)
      FROM public.sgrh_cat_criterios_seleccion c
      WHERE c.cri_area_id = a.are_id AND c.cri_activo
    ) = 1
    AND EXISTS (
      SELECT 1
      FROM public.sgrh_cat_criterios_seleccion c
      WHERE c.cri_area_id = a.are_id
        AND c.cri_activo
        AND c.cri_descripcion = 'Entregó todos los documentos solicitados'
    );

  RAISE NOTICE 'Criterios de selección movidos a su propia área: %', movidos;
END $$;
