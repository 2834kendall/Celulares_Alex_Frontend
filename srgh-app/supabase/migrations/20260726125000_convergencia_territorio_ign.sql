-- Convergencia del catálogo territorial hacia el IGN.
--
-- La migración anterior (20260726120000) sembró la División Territorial
-- Administrativa del IGN, pero la base ya traía un catálogo territorial parcial
-- cargado a mano fuera de toda migración, con OTRA numeración: códigos de 6
-- dígitos con cero a la izquierda (010101) y nombres propios ("Escazú Centro",
-- "Curridabat Centro"). Los dos conjuntos quedaron conviviendo, así que los
-- selects en cascada mostrarían "Escazú" y "Escazú Centro" como opciones
-- distintas del mismo lugar.
--
-- Ojo: la numeración vieja NO es la del IGN con ceros a la izquierda. El legacy
-- 011001 es "Curridabat Centro", mientras que en el IGN 11001 es Alajuelita
-- (Curridabat es el cantón 118). Por eso el mapeo no puede ser aritmético: se
-- resuelve por nombre dentro del mismo cantón y provincia.
--
-- El JSON del IGN es la fuente de verdad: esta migración deja el catálogo en
-- exactamente 7 provincias / 84 cantones / 492 distritos y repunta cualquier
-- referencia que apuntara a una fila vieja. En un proyecto nuevo no hay filas
-- legacy y todo el archivo es un no-op, así que el par
-- seed + convergencia es replicable tal cual en otros proyectos.
--
-- Criterio de "legacy": el código no tiene el largo del formato IGN
-- (provincia P = 1, cantón PCC = 3, distrito PCCDD = 5).

-- ─── 1. Normalización de nombres para el emparejamiento ───────────────────────
-- Quita acentos, paréntesis desambiguadores ("San José (Alajuela)") y el sufijo
-- " Centro". Verificado contra los 492 distritos del IGN: ninguno termina en
-- "Centro", ninguno lleva paréntesis y la normalización no genera colisiones
-- dentro de un mismo cantón, así que solo puede afectar a los nombres viejos.

CREATE OR REPLACE FUNCTION public.sgrh_norm_territorio(t text)
RETURNS text AS $$
  SELECT btrim(regexp_replace(
    lower(translate(coalesce(t, ''),
                    'áéíóúüñÁÉÍÓÚÜÑ',
                    'aeiouunAEIOUUN')),
    '\s*\(.*\)|\s+centro$', '', 'g'));
$$ LANGUAGE sql IMMUTABLE;

-- ─── 2. Repunte de referencias legacy → IGN ───────────────────────────────────
-- Estrategia por distrito viejo:
--   1º  mismo nombre normalizado, dentro del mismo cantón y provincia;
--   2º  si el nombre no existe en el IGN (p. ej. "Cartago Centro", que en el IGN
--       no es un distrito), el primer distrito del cantón equivalente.
-- El cantón y la provincia siempre coinciden por nombre, así que el destino
-- nunca se va a otra zona del país.
--
-- Se usa SQL dinámico: las columnas *_distrito_id desaparecen en la migración
-- 20260726130000, y plpgsql resuelve los nombres al ejecutar, no al compilar el
-- bloque — de otro modo este archivo dejaría de cargar tras aquella.

DO $$
DECLARE
  v_tabla   text;
  v_columna text;
BEGIN
  CREATE TEMP TABLE tmp_mapa_territorio ON COMMIT DROP AS
  WITH ubicados AS (
    SELECT d.dis_id, d.dis_codigo, d.dis_nombre,
           c.can_nombre, p.prv_nombre
    FROM public.sgrh_cat_distritos d
    JOIN public.sgrh_cat_cantones   c ON c.can_id = d.dis_canton_id
    JOIN public.sgrh_cat_provincias p ON p.prv_id = c.can_provincia_id
  ),
  legacy AS (SELECT * FROM ubicados WHERE length(dis_codigo) <> 5),
  ign    AS (SELECT * FROM ubicados WHERE length(dis_codigo)  = 5)
  SELECT l.dis_id AS legacy_id,
         l.dis_nombre AS legacy_nombre,
         COALESCE(
           (SELECT i.dis_id FROM ign i
             WHERE public.sgrh_norm_territorio(i.dis_nombre) = public.sgrh_norm_territorio(l.dis_nombre)
               AND public.sgrh_norm_territorio(i.can_nombre) = public.sgrh_norm_territorio(l.can_nombre)
               AND public.sgrh_norm_territorio(i.prv_nombre) = public.sgrh_norm_territorio(l.prv_nombre)
             ORDER BY i.dis_codigo
             LIMIT 1),
           (SELECT i.dis_id FROM ign i
             WHERE public.sgrh_norm_territorio(i.can_nombre) = public.sgrh_norm_territorio(l.can_nombre)
               AND public.sgrh_norm_territorio(i.prv_nombre) = public.sgrh_norm_territorio(l.prv_nombre)
             ORDER BY i.dis_codigo
             LIMIT 1)
         ) AS ign_id
  FROM legacy l;

  -- Sin destino no se puede repuntar ni borrar: mejor abortar que dejar el
  -- catálogo a medio converger.
  IF EXISTS (SELECT 1 FROM tmp_mapa_territorio WHERE ign_id IS NULL) THEN
    RAISE EXCEPTION 'Distritos legacy sin equivalente IGN: %',
      (SELECT string_agg(legacy_nombre, ', ') FROM tmp_mapa_territorio WHERE ign_id IS NULL)
      USING ERRCODE = '23503';
  END IF;

  FOREACH v_tabla IN ARRAY ARRAY['sgrh_empresas', 'sgrh_sucursales', 'sgrh_direcciones'] LOOP
    v_columna := CASE v_tabla
                   WHEN 'sgrh_empresas'    THEN 'org_distrito_id'
                   WHEN 'sgrh_sucursales'  THEN 'suc_distrito_id'
                   ELSE 'dir_distrito_id'
                 END;

    -- La tabla o la columna pueden no existir todavía (proyecto nuevo) o ya no
    -- existir (re-ejecución después de 20260726130000).
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = v_tabla AND column_name = v_columna
    ) THEN
      EXECUTE format(
        'UPDATE public.%I t SET %I = m.ign_id
         FROM tmp_mapa_territorio m
         WHERE t.%I = m.legacy_id', v_tabla, v_columna, v_columna);
    END IF;
  END LOOP;
END;
$$;

-- ─── 3. Retiro de las filas que no son del IGN ────────────────────────────────
-- En este orden por las FKs: distritos → cantones → provincias. Si algo siguiera
-- referenciando una fila vieja, el FK aborta la migración en vez de dejar el
-- catálogo inconsistente.

DELETE FROM public.sgrh_cat_distritos   WHERE length(dis_codigo) <> 5;
DELETE FROM public.sgrh_cat_cantones    WHERE length(can_codigo) <> 3;
DELETE FROM public.sgrh_cat_provincias  WHERE length(prv_codigo) <> 1;

DROP FUNCTION IF EXISTS public.sgrh_norm_territorio(text);

-- ─── 4. Verificación ──────────────────────────────────────────────────────────
-- El catálogo tiene que quedar idéntico al JSON del IGN en cualquier proyecto
-- donde se aplique. Si no cuadra, la migración falla en vez de dejar pasar un
-- catálogo incompleto.

DO $$
DECLARE
  v_prv int; v_can int; v_dis int;
BEGIN
  SELECT count(*) INTO v_prv FROM public.sgrh_cat_provincias;
  SELECT count(*) INTO v_can FROM public.sgrh_cat_cantones;
  SELECT count(*) INTO v_dis FROM public.sgrh_cat_distritos;

  IF (v_prv, v_can, v_dis) <> (7, 84, 492) THEN
    RAISE EXCEPTION
      'El catalogo territorial no converge al IGN: % provincias, % cantones, % distritos (esperado 7/84/492)',
      v_prv, v_can, v_dis;
  END IF;
END;
$$;
