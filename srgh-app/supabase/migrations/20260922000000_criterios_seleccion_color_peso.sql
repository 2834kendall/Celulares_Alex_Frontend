-- =====================================================================
-- SGRH-61 — Color y peso en los criterios de selección
-- =====================================================================
-- Dos pedidos del usuario sobre el catálogo que administra RRHH:
--
--   1. Color propio por criterio, "como en horarios". Mismo patrón que
--      sgrh_cat_horarios.hor_color (20260912000000): texto hex validado por
--      CHECK, NULL = sin color propio. Es solo presentación — sirve para
--      distinguir el criterio de un vistazo en el formulario de puntaje.
--
--   2. Peso: un criterio puede valer más que otro (la experiencia puede
--      pesar el doble que los certificados). Esto SÍ cambia el cálculo:
--      pos_puntaje_promedio pasa de promedio simple a promedio PONDERADO
--      (ver recruitment/lib/scoring.ts). Por eso el default es 1 — con
--      todos los pesos en 1, el ponderado da exactamente lo mismo que el
--      simple, así que los puntajes ya cargados no cambian de valor.
--
-- Ambas columnas van en sgrh_cat_areas_seleccion y no en
-- sgrh_cat_criterios_seleccion porque en este modelo el "rubro" es la
-- dupla área + criterio y se administra como una sola unidad (mismo
-- criterio que evaluations: ver deleteRubro, que desactiva las dos juntas).
--
-- Archivo idempotente: se puede re-ejecutar sin efectos.
-- =====================================================================

ALTER TABLE public.sgrh_cat_areas_seleccion
  ADD COLUMN IF NOT EXISTS are_color text,
  ADD COLUMN IF NOT EXISTS are_peso numeric NOT NULL DEFAULT 1;

ALTER TABLE public.sgrh_cat_areas_seleccion
  DROP CONSTRAINT IF EXISTS sgrh_cat_areas_seleccion_color_hex;
ALTER TABLE public.sgrh_cat_areas_seleccion
  ADD CONSTRAINT sgrh_cat_areas_seleccion_color_hex
  CHECK (are_color IS NULL OR are_color ~ '^#[0-9a-fA-F]{6}$');

-- Tope en 10 para que el peso siga siendo legible como "vale N veces". Sin
-- tope, un 9999 accidental haría que un solo criterio decida el promedio
-- entero y el resto quedara sin efecto visible.
ALTER TABLE public.sgrh_cat_areas_seleccion
  DROP CONSTRAINT IF EXISTS sgrh_cat_areas_seleccion_peso_rango;
ALTER TABLE public.sgrh_cat_areas_seleccion
  ADD CONSTRAINT sgrh_cat_areas_seleccion_peso_rango
  CHECK (are_peso > 0 AND are_peso <= 10);

COMMENT ON COLUMN public.sgrh_cat_areas_seleccion.are_color IS
  'Color hex del criterio en el formulario de puntaje. NULL = sin color propio. Solo presentación.';
COMMENT ON COLUMN public.sgrh_cat_areas_seleccion.are_peso IS
  'Cuánto pesa este criterio en pos_puntaje_promedio. 1 = igual que los demás; 2 = vale el doble. Con todos en 1 el promedio ponderado equivale al simple.';
