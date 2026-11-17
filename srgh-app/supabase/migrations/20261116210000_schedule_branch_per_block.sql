-- SGRH-110: cada bloque de una plantilla partida puede llevar su sucursal.
--
-- La plantilla con segundo bloque (20261116200000) no decía dónde se trabaja
-- cada bloque: la sucursal era siempre la de la asignación. Ahora la plantilla
-- puede fijarla, con hor_sucursal_id (primer bloque) y hor_sucursal_id_2
-- (segundo): «empieza en Infinity y termina en Alex».
--
-- Al asignar la plantilla a un día, si las dos sucursales son distintas el día
-- se guarda como DOS tramos (uno por bloque, cada uno en su sucursal); si son la
-- misma, o no se definieron, es un solo tramo en la sucursal de la asignación.
-- La sucursal de la plantilla no restringe nada por sí sola: solo dice dónde se
-- asigna.
--
-- Esta migración se puede aplicar sobre cualquier estado intermedio de
-- 20261116200000: cada paso comprueba antes de crear, y las restricciones se
-- vuelven a poner desde cero.
BEGIN;

-- ─── 1. Columnas ─────────────────────────────────────────────────────────────
ALTER TABLE public.sgrh_cat_horarios
  ADD COLUMN IF NOT EXISTS hor_sucursal_id   integer,
  ADD COLUMN IF NOT EXISTS hor_sucursal_id_2 integer;

-- Sin ON DELETE SET NULL a propósito: pondría en NULL una sola de las dos
-- columnas y rompería la regla de «las dos o ninguna». Una sucursal usada por
-- una plantilla no se puede borrar (se desactiva, como ya se hace). Se sueltan
-- y se vuelven a crear para no depender de cómo se hubieran creado antes.
ALTER TABLE public.sgrh_cat_horarios
  DROP CONSTRAINT IF EXISTS sgrh_cat_horarios_hor_sucursal_id_fkey,
  DROP CONSTRAINT IF EXISTS sgrh_cat_horarios_hor_sucursal_id_2_fkey;

ALTER TABLE public.sgrh_cat_horarios
  ADD CONSTRAINT sgrh_cat_horarios_hor_sucursal_id_fkey
    FOREIGN KEY (hor_sucursal_id) REFERENCES public.sgrh_sucursales (suc_id),
  ADD CONSTRAINT sgrh_cat_horarios_hor_sucursal_id_2_fkey
    FOREIGN KEY (hor_sucursal_id_2) REFERENCES public.sgrh_sucursales (suc_id);

-- ─── 2. Reglas ───────────────────────────────────────────────────────────────
-- Las dos sucursales o ninguna, y solo si hay segundo bloque.
ALTER TABLE public.sgrh_cat_horarios
  DROP CONSTRAINT IF EXISTS sgrh_cat_hor_sucursales_bloques;
ALTER TABLE public.sgrh_cat_horarios
  ADD CONSTRAINT sgrh_cat_hor_sucursales_bloques
  CHECK (
    (hor_sucursal_id IS NULL) = (hor_sucursal_id_2 IS NULL)
    AND (hor_sucursal_id IS NULL OR hor_hora_entrada_2 IS NOT NULL)
  );

-- Con segundo bloque, ninguno de los dos bloques cruza la medianoche y el
-- segundo va después del primero. La versión inicial de 20261116200000 no
-- exigía que el primero no cruzara la medianoche; se deja igual en todas las
-- bases. (Falla si ya hay una plantilla que lo incumple: ninguna debería, la
-- aplicación no la dejaba guardar.)
ALTER TABLE public.sgrh_cat_horarios
  DROP CONSTRAINT IF EXISTS sgrh_cat_hor_bloque2_orden;
ALTER TABLE public.sgrh_cat_horarios
  ADD CONSTRAINT sgrh_cat_hor_bloque2_orden
  CHECK (
    hor_hora_entrada_2 IS NULL
    OR (
      hor_hora_salida > hor_hora_entrada
      AND hor_hora_salida_2 > hor_hora_entrada_2
      AND hor_hora_entrada_2 >= hor_hora_salida
    )
  );

COMMENT ON COLUMN public.sgrh_cat_horarios.hor_sucursal_id IS
  'Sucursal del primer bloque de una jornada partida. NULL = la sucursal de la asignación. Va junto a hor_sucursal_id_2: las dos o ninguna.';
COMMENT ON COLUMN public.sgrh_cat_horarios.hor_sucursal_id_2 IS
  'Sucursal del segundo bloque de una jornada partida. Si difiere de hor_sucursal_id, la asignación se guarda como dos tramos, uno por sucursal.';

COMMIT;
