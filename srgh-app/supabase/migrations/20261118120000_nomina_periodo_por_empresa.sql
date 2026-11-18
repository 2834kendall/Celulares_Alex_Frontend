-- =====================================================================
-- Nómina por empresa, fase 4: un solo periodo por quincena
-- =====================================================================
-- APLICAR SOLO CON EL CÓDIGO DE LA FASE 3 YA DESPLEGADO, con respaldo de la
-- base y sin nadie trabajando en nómina. El código anterior no sabe crear ni
-- mostrar un periodo sin sucursal.
--
-- Qué hace, todo en una transacción (o pasa todo, o no pasa nada):
--
--   0. Se niega si algún contrato tiene dos filas en la misma quincena (un
--      pago doble después de un traslado): eso lo tiene que resolver una
--      persona, no una migración. La consulta para revisarlo antes está en
--      supabase/scripts/revisar-duplicados-quincena.sql.
--   1. Anota en la bitácora cómo era cada periodo y en cuál queda.
--   2. Pasa las filas al periodo que queda (el de menor id de la quincena).
--      Las filas conservan su id y su sucursal, así que comprobantes,
--      códigos de verificación y banco de horas no cambian, y cada cuenta
--      sigue viendo exactamente las mismas filas.
--   3. El periodo que queda toma el estado del conjunto ('pagado' solo si
--      todos los que tenían filas lo estaban) y pierde la sucursal. Los
--      demás se borran. La sucursal del periodo no se puede volver a llenar.
--   4. Índice único por (empresa, año, mes, quincena).
--   5. Reglas del periodo: lo ve y lo edita quien tenga permiso de nómina en
--      la empresa; borrarlo, solo una cuenta sin sucursal asignada.
--   6. org_nomina_por_empresa = true.
--
-- Después de aplicarla: Nómina → "Recalcular estado de los periodos".
--
-- Idempotente (una segunda corrida no encuentra nada que fusionar).
-- =====================================================================

BEGIN;

-- ─── 0. Pre-chequeo ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_duplicados text;
BEGIN
  SELECT string_agg(format('contrato %s en %s-%s q%s', lab, anio, mes, q), '; ')
  INTO v_duplicados
  FROM (
    SELECT d.ndt_historial_laboral_id AS lab,
           p.npe_periodo_anio AS anio,
           p.npe_periodo_mes AS mes,
           p.npe_quincena AS q
    FROM public.sgrh_nomina_detalle d
    JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
    GROUP BY p.npe_empresa_id, d.ndt_historial_laboral_id,
             p.npe_periodo_anio, p.npe_periodo_mes, p.npe_quincena
    HAVING count(*) > 1
  ) x;

  IF v_duplicados IS NOT NULL THEN
    RAISE EXCEPTION 'Hay contratos con dos filas en la misma quincena: %. Resolvelos antes de fusionar.',
      v_duplicados;
  END IF;
END
$$;

-- ─── 1. Bitácora ────────────────────────────────────────────────────────
-- Solo periodos que todavía tienen sucursal: en una segunda corrida no hay.
INSERT INTO sgrh_private.nomina_periodo_fusion (
  npf_periodo_viejo, npf_periodo_nuevo, npf_sucursal_id,
  npf_estado, npf_fecha_pago, npf_observaciones
)
SELECT p.npe_id,
       min(p.npe_id) OVER w,
       p.npe_sucursal_id,
       p.npe_estado,
       p.npe_fecha_pago,
       p.npe_observaciones
FROM public.sgrh_nomina_periodo p
WHERE p.npe_sucursal_id IS NOT NULL
WINDOW w AS (
  PARTITION BY p.npe_empresa_id, p.npe_periodo_anio, p.npe_periodo_mes, p.npe_quincena
)
ON CONFLICT (npf_periodo_viejo) DO NOTHING;

-- Aviso (no corta): quincenas cuyos periodos tenían fechas distintas. Queda
-- la del periodo que sobrevive; conviene revisarlas.
DO $$
DECLARE
  v_distintas text;
BEGIN
  SELECT string_agg(format('%s-%s q%s', anio, mes, q), ', ')
  INTO v_distintas
  FROM (
    SELECT p.npe_periodo_anio AS anio, p.npe_periodo_mes AS mes, p.npe_quincena AS q
    FROM public.sgrh_nomina_periodo p
    WHERE p.npe_sucursal_id IS NOT NULL
    GROUP BY p.npe_empresa_id, p.npe_periodo_anio, p.npe_periodo_mes, p.npe_quincena
    HAVING count(DISTINCT (p.npe_fecha_inicio_periodo, p.npe_fecha_fin_periodo)) > 1
  ) x;

  IF v_distintas IS NOT NULL THEN
    RAISE NOTICE 'Quincenas con fechas distintas entre sucursales (queda la del periodo de menor id): %',
      v_distintas;
  END IF;
END
$$;

-- ─── 2. Las filas pasan al periodo que queda ────────────────────────────
-- El trigger prohíbe cambiarle el periodo a una fila; acá es justo lo que
-- hay que hacer, una sola vez. Se apaga y se vuelve a prender dentro de la
-- misma transacción (nadie más llega a verlo apagado: ALTER TABLE bloquea la
-- tabla hasta el COMMIT).
ALTER TABLE public.sgrh_nomina_detalle DISABLE TRIGGER sgrh_ndt_sellar_sucursal;

UPDATE public.sgrh_nomina_detalle d
SET ndt_nomina_periodo_id = f.npf_periodo_nuevo
FROM sgrh_private.nomina_periodo_fusion f
JOIN public.sgrh_nomina_periodo p ON p.npe_id = f.npf_periodo_viejo
WHERE f.npf_periodo_viejo = d.ndt_nomina_periodo_id
  AND f.npf_periodo_nuevo <> f.npf_periodo_viejo
  AND p.npe_sucursal_id IS NOT NULL;

ALTER TABLE public.sgrh_nomina_detalle ENABLE TRIGGER sgrh_ndt_sellar_sucursal;

-- ─── 3. El periodo que queda ────────────────────────────────────────────
ALTER TABLE public.sgrh_nomina_periodo ALTER COLUMN npe_sucursal_id DROP NOT NULL;
DROP INDEX IF EXISTS public.sgrh_nomina_periodo_unico;

-- Estado del conjunto: 'pagado' si alguno lo estaba y todos los que tienen
-- filas lo estaban. Un periodo en borrador y vacío no frena al resto.
UPDATE public.sgrh_nomina_periodo p
SET npe_estado = CASE WHEN g.alguno_pagado AND g.todos_resueltos THEN 'pagado' ELSE 'borrador' END,
    npe_fecha_pago = CASE WHEN g.alguno_pagado AND g.todos_resueltos THEN g.fecha_pago ELSE NULL END,
    npe_observaciones = g.observaciones,
    npe_fecha_inicio_periodo = coalesce(p.npe_fecha_inicio_periodo, g.fecha_inicio),
    npe_fecha_fin_periodo = coalesce(p.npe_fecha_fin_periodo, g.fecha_fin)
FROM (
  SELECT f.npf_periodo_nuevo,
         bool_or(f.npf_estado = 'pagado') AS alguno_pagado,
         bool_and(
           f.npf_estado = 'pagado'
           OR NOT EXISTS (
             SELECT 1
             FROM public.sgrh_nomina_detalle d
             WHERE d.ndt_nomina_periodo_id = f.npf_periodo_nuevo
               AND d.ndt_sucursal_id = f.npf_sucursal_id
           )
         ) AS todos_resueltos,
         max(f.npf_fecha_pago) FILTER (WHERE f.npf_estado = 'pagado') AS fecha_pago,
         nullif(
           string_agg(nullif(btrim(f.npf_observaciones), ''), ' | ' ORDER BY f.npf_periodo_viejo),
           ''
         ) AS observaciones,
         min(v.npe_fecha_inicio_periodo) AS fecha_inicio,
         max(v.npe_fecha_fin_periodo) AS fecha_fin
  FROM sgrh_private.nomina_periodo_fusion f
  JOIN public.sgrh_nomina_periodo v ON v.npe_id = f.npf_periodo_viejo
  WHERE v.npe_sucursal_id IS NOT NULL
  GROUP BY f.npf_periodo_nuevo
) g
WHERE g.npf_periodo_nuevo = p.npe_id
  AND p.npe_sucursal_id IS NOT NULL;

DELETE FROM public.sgrh_nomina_periodo p
USING sgrh_private.nomina_periodo_fusion f
WHERE f.npf_periodo_viejo = p.npe_id
  AND f.npf_periodo_nuevo <> f.npf_periodo_viejo
  AND p.npe_sucursal_id IS NOT NULL;

UPDATE public.sgrh_nomina_periodo
SET npe_sucursal_id = NULL
WHERE npe_sucursal_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sgrh_npe_sin_sucursal_chk') THEN
    ALTER TABLE public.sgrh_nomina_periodo
      ADD CONSTRAINT sgrh_npe_sin_sucursal_chk CHECK (npe_sucursal_id IS NULL);
  END IF;
END
$$;

COMMENT ON COLUMN public.sgrh_nomina_periodo.npe_sucursal_id IS
  'Sin uso desde 2026-11: el periodo es de toda la empresa y siempre va en NULL. La sucursal va en cada fila (ndt_sucursal_id).';

-- ─── 4. Un periodo por quincena y por empresa ───────────────────────────
CREATE UNIQUE INDEX sgrh_nomina_periodo_unico
  ON public.sgrh_nomina_periodo (npe_empresa_id, npe_periodo_anio, npe_periodo_mes, npe_quincena);

-- ─── 5. Reglas del periodo ──────────────────────────────────────────────
-- El encabezado (fechas y estado) lo ve cualquiera con permiso de nómina de
-- la empresa. Las filas siguen con sus reglas por sucursal (fase 2).
DROP POLICY IF EXISTS "nomina_periodo_select" ON public.sgrh_nomina_periodo;
DROP POLICY IF EXISTS "nomina_periodo_insert" ON public.sgrh_nomina_periodo;
DROP POLICY IF EXISTS "nomina_periodo_update" ON public.sgrh_nomina_periodo;
DROP POLICY IF EXISTS "nomina_periodo_delete" ON public.sgrh_nomina_periodo;

CREATE POLICY "nomina_periodo_select" ON public.sgrh_nomina_periodo
FOR SELECT TO authenticated USING (
  npe_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('NOMINA_READ'))
);

CREATE POLICY "nomina_periodo_insert" ON public.sgrh_nomina_periodo
FOR INSERT TO authenticated WITH CHECK (
  npe_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('NOMINA_WRITE'))
);

CREATE POLICY "nomina_periodo_update" ON public.sgrh_nomina_periodo
FOR UPDATE TO authenticated
USING (
  npe_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('NOMINA_WRITE'))
)
WITH CHECK (
  npe_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('NOMINA_WRITE'))
);

CREATE POLICY "nomina_periodo_delete" ON public.sgrh_nomina_periodo
FOR DELETE TO authenticated USING (
  npe_empresa_id = (SELECT public.get_empresa_id())
  AND (SELECT public.tiene_permiso('NOMINA_WRITE'))
  AND public.get_sucursal_ids() IS NULL
);

-- ─── 6. La empresa pasa al modelo nuevo ─────────────────────────────────
UPDATE public.sgrh_empresas
SET org_nomina_por_empresa = true
WHERE NOT org_nomina_por_empresa;

COMMIT;

NOTIFY pgrst, 'reload schema';
