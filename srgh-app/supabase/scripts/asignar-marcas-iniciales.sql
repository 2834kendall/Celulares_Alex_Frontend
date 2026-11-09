-- =====================================================================
-- Asignar una marca a cada sucursal que todavía no tiene
-- =====================================================================
-- Se corre UNA vez por proyecto (dev y producción), después de aplicar la
-- migración 20261107153512_marcas_comerciales.sql y ANTES de la fase 2
-- (la que vuelve NOT NULL a suc_marca_id).
--
-- Qué hace: por cada sucursal sin marca crea una marca con el MISMO nombre
-- y los MISMOS colores de la sucursal, y se la asigna. Es lo que pide
-- producción, donde cada sucursal ya es una marca distinta. Si dos
-- sucursales de una empresa se llaman igual (sin distinguir mayúsculas),
-- comparten una sola marca.
--
-- Después de correrlo, desde Configuración → Empresa → Marcas se puede
-- renombrar la marca y subirle el logo; y desde Configuración → Sucursales,
-- moverla a otra marca o renombrarla (p. ej. "Mall") para que se vea
-- "Celulares Alex · Mall".
--
-- Es repetible: solo toca sucursales con suc_marca_id NULL y no duplica una
-- marca que ya exista con ese nombre.
--
-- Cómo correrlo: SQL Editor → New query → pegar TODO → Run.
-- Confirmar ANTES cuál proyecto está abierto (dev ≠ producción).
-- =====================================================================

BEGIN;

-- ── 1. Una marca por nombre de sucursal sin marca ────────────────────
INSERT INTO public.sgrh_marcas_comerciales
  (mco_empresa_id, mco_nombre, mco_color_acento, mco_color_sidebar, mco_activa)
SELECT
  s.suc_empresa_id,
  (array_agg(trim(s.suc_nombre) ORDER BY s.suc_id))[1],
  (array_agg(s.suc_color_acento ORDER BY s.suc_id))[1],
  (array_agg(s.suc_color_sidebar ORDER BY s.suc_id))[1],
  bool_or(s.suc_activa)
FROM public.sgrh_sucursales s
WHERE s.suc_marca_id IS NULL
GROUP BY s.suc_empresa_id, lower(trim(s.suc_nombre))
-- Si ya hay una marca con ese nombre en la empresa, se reutiliza (paso 2).
ON CONFLICT DO NOTHING;

-- ── 2. Asignar cada sucursal a la marca de su mismo nombre ───────────
UPDATE public.sgrh_sucursales s
SET suc_marca_id = m.mco_id
FROM public.sgrh_marcas_comerciales m
WHERE s.suc_marca_id IS NULL
  AND m.mco_empresa_id = s.suc_empresa_id
  AND lower(trim(m.mco_nombre)) = lower(trim(s.suc_nombre));

COMMIT;

-- ── 3. Verificación: tiene que dar 0 antes de la fase 2 ──────────────
SELECT count(*) AS sucursales_sin_marca
FROM public.sgrh_sucursales
WHERE suc_marca_id IS NULL;

-- Y el resultado, para revisarlo a ojo:
SELECT m.mco_nombre AS marca, s.suc_nombre AS sucursal, s.suc_activa,
       m.mco_color_acento, m.mco_color_sidebar
FROM public.sgrh_sucursales s
JOIN public.sgrh_marcas_comerciales m ON m.mco_id = s.suc_marca_id
ORDER BY m.mco_nombre, s.suc_nombre;
