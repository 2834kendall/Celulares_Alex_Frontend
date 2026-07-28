-- Solo la lactancia (Codigo de Trabajo art. 97) es un permiso intradia: la
-- persona trabaja su jornada completa y sigue pagada, solo se reduce una
-- hora diaria para lactar. El resto de incapacidades y licencias (CCSS,
-- INS, maternidad, paternidad, permisos sindicales, etc.) son dias
-- completos sin labores. Antes esto se adivinaba por texto en el nombre del
-- tipo ("contiene LACTANCIA"), lo cual fallaba con catalogos propios de cada
-- empresa que ya tenian sus propios tipos con nombres/codigos distintos.
-- Se vuelve un dato explicito del catalogo para que sea correcto sin
-- importar como cada empresa nombre o codifique sus tipos de ausencia.
ALTER TABLE public.sgrh_cat_tipos_ausencia
  ADD COLUMN IF NOT EXISTS tau_es_intradia boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sgrh_cat_tipos_ausencia.tau_es_intradia IS
  'true = permiso intradia (ej. lactancia): no reemplaza el dia en la matriz de horarios, solo se marca con una insignia y no resta horas. false (default) = incapacidad/licencia de dia completo: reemplaza el dia y no cuenta horas trabajadas.';

-- Backfill: marca como intradia cualquier tipo ya sembrado que sea de
-- lactancia, sin importar el codigo exacto que use cada empresa.
UPDATE public.sgrh_cat_tipos_ausencia
SET tau_es_intradia = true
WHERE tau_codigo = 'PERM_LACTANCIA'
   OR tau_nombre ILIKE '%lactancia%';
