-- =====================================================================
-- Recalcular el salario bruto y las provisiones de aguinaldo
-- =====================================================================
-- Se corre UNA vez, después de desplegar el cambio que saca del salario
-- bruto los ingresos no salariales (viáticos y el aguinaldo pagado por
-- planilla, que el catálogo ya marcaba con con_afecta_salario_bruto =
-- false).
--
-- Qué estaba mal:
--   El motor sumaba TODOS los ingresos al bruto. Los viáticos quedaban
--   dentro, y como el aguinaldo se acumula al marcar un pago sumando
--   ndt_salario_bruto / 12, cada quincena con viáticos dejaba el aguinaldo
--   del año un poco más alto de lo que corresponde. En un empleado con
--   ₡50.000 de viáticos por quincena son ₡100.000 al año: el aguinaldo se
--   infla en ₡8.333, y la cesantía, que también sale del bruto, con él.
--
-- Qué NO cambia: el salario neto. El viático se pagaba antes dentro del
-- bruto y ahora se paga después de las deducciones, pero la plata que
-- recibió la persona es la misma, y las deducciones porcentuales ya se
-- calculaban sobre la base sin viáticos. Por eso este script no toca
-- ndt_salario_neto ni ndt_total_deducciones_obreras.
--
-- Se puede correr más de una vez sin hacer daño: los dos bloques calculan
-- el valor correcto desde cero en vez de ajustarlo por diferencia.
--
-- Cómo correrlo en Supabase: SQL Editor → New query → pegar TODO → Run.
-- Antes de correrlo, el bloque 0 muestra qué va a cambiar.
-- =====================================================================


-- ── 0. Revisión previa (no cambia nada) ──────────────────────────────
-- Empleados y periodos cuyo bruto guardado incluye ingresos no salariales.
-- Si no devuelve filas, no hay nada que corregir y los bloques 1 y 2 no
-- van a tocar nada tampoco.

-- Lleva el mismo filtro que el bloque 1 (el bruto guardado todavía es la
-- suma de TODOS los ingresos), así que después de corregir deja de
-- devolver filas en vez de seguir señalando lo que ya se arregló.

SELECT
  p.npe_periodo_anio                      AS anio,
  p.npe_periodo_mes                       AS mes,
  p.npe_quincena                          AS quincena,
  e.emp_nombre || ' ' || e.emp_apellido_1 AS empleado,
  d.ndt_salario_bruto                     AS bruto_actual,
  SUM(i.ing_monto) FILTER (WHERE c.con_afecta_salario_bruto IS FALSE)
                                          AS no_salarial,
  ROUND(
    SUM(i.ing_monto)
      - COALESCE(SUM(i.ing_monto) FILTER (WHERE c.con_afecta_salario_bruto IS FALSE), 0),
    2
  )                                       AS bruto_corregido,
  d.ndt_pagado                            AS pagado
FROM public.sgrh_nomina_detalle d
JOIN public.sgrh_nomina_periodo p         ON p.npe_id = d.ndt_nomina_periodo_id
JOIN public.sgrh_nomina_linea_ingreso i   ON i.ing_nomina_detalle_id = d.ndt_id
JOIN public.sgrh_cat_conceptos_nomina c   ON c.con_id = i.ing_concepto_id
LEFT JOIN public.sgrh_historial_laboral l ON l.lab_id = d.ndt_historial_laboral_id
LEFT JOIN public.sgrh_empleados e         ON e.emp_id = l.lab_empleado_id
GROUP BY d.ndt_id, p.npe_periodo_anio, p.npe_periodo_mes, p.npe_quincena,
         e.emp_nombre, e.emp_apellido_1, d.ndt_salario_bruto, d.ndt_pagado
HAVING SUM(i.ing_monto) FILTER (WHERE c.con_afecta_salario_bruto IS FALSE) > 0
   AND ABS(d.ndt_salario_bruto - SUM(i.ing_monto)) < 0.01
ORDER BY anio, mes, quincena, empleado;


-- ── 1. Bruto = solo los ingresos que son salario ─────────────────────
-- La condición del final es la que lo hace repetible: solo corrige las
-- filas cuyo bruto todavía coincide con la suma de TODOS los ingresos,
-- que es la convención vieja. Una fila ya corregida no vuelve a bajar.

WITH sumas AS (
  SELECT
    i.ing_nomina_detalle_id AS ndt_id,
    SUM(i.ing_monto)                                                       AS total,
    COALESCE(SUM(i.ing_monto) FILTER (WHERE c.con_afecta_salario_bruto IS FALSE), 0)
                                                                           AS no_salarial
  FROM public.sgrh_nomina_linea_ingreso i
  JOIN public.sgrh_cat_conceptos_nomina c ON c.con_id = i.ing_concepto_id
  GROUP BY i.ing_nomina_detalle_id
)
UPDATE public.sgrh_nomina_detalle d
SET ndt_salario_bruto = ROUND(s.total - s.no_salarial, 2)
FROM sumas s
WHERE s.ndt_id = d.ndt_id
  AND s.no_salarial > 0
  AND ABS(d.ndt_salario_bruto - s.total) < 0.01;


-- ── 2. Provisión de aguinaldo = suma de los brutos ya pagados ÷ 12 ───
-- pra_monto_acumulado_aguinaldo la escribe una sola cosa en toda la app:
-- marcarDetallePagado, que suma bruto/12 al marcar un pago y lo resta al
-- desmarcarlo. Por eso se puede recalcular entero desde los detalles
-- pagados en vez de ajustarlo por diferencia — y de paso corrige
-- cualquier acumulado que se haya desincronizado, porque ese paso es
-- "mejor esfuerzo" y no bloquea el pago si falla.
--
-- El ciclo de aguinaldo va de diciembre a noviembre: diciembre acumula
-- para el año siguiente (ver anioCicloAguinaldo en lib/liquidacion.ts).

WITH acumulado AS (
  SELECT
    d.ndt_historial_laboral_id AS lab_id,
    CASE WHEN p.npe_periodo_mes = 12
         THEN p.npe_periodo_anio + 1
         ELSE p.npe_periodo_anio
    END                        AS anio,
    ROUND(SUM(d.ndt_salario_bruto) / 12, 2) AS monto
  FROM public.sgrh_nomina_detalle d
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
  WHERE d.ndt_pagado IS TRUE
  GROUP BY 1, 2
)
UPDATE public.sgrh_provisiones_anuales pr
SET pra_monto_acumulado_aguinaldo = a.monto
FROM acumulado a
WHERE a.lab_id = pr.pra_historial_laboral_id
  AND a.anio  = pr.pra_anio
  AND ABS(pr.pra_monto_acumulado_aguinaldo - a.monto) >= 0.01;


-- ── 3. Filas de provisión que faltan ─────────────────────────────────
-- Si el acumulado falló alguna vez al marcar un pago, el empleado puede
-- no tener fila del todo para ese ciclo. Se crea con el monto correcto.
-- El NOT EXISTS es lo que lo hace repetible.

WITH acumulado AS (
  SELECT
    d.ndt_historial_laboral_id AS lab_id,
    CASE WHEN p.npe_periodo_mes = 12
         THEN p.npe_periodo_anio + 1
         ELSE p.npe_periodo_anio
    END                        AS anio,
    ROUND(SUM(d.ndt_salario_bruto) / 12, 2) AS monto
  FROM public.sgrh_nomina_detalle d
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
  WHERE d.ndt_pagado IS TRUE
  GROUP BY 1, 2
)
INSERT INTO public.sgrh_provisiones_anuales (
  pra_historial_laboral_id, pra_anio, pra_monto_acumulado_aguinaldo
)
SELECT a.lab_id, a.anio, a.monto
FROM acumulado a
WHERE NOT EXISTS (
  SELECT 1
  FROM public.sgrh_provisiones_anuales pr
  WHERE pr.pra_historial_laboral_id = a.lab_id
    AND pr.pra_anio = a.anio
);


-- ── 4. Provisiones duplicadas (no cambia nada) ───────────────────────
-- sgrh_provisiones_anuales no tiene índice único por (empleado, año), y
-- la app la escribe con un "buscá y si no está insertá". Dos pagos
-- marcados a la vez para el mismo empleado pueden dejar DOS filas del
-- mismo ciclo: la pantalla de aguinaldo lee una sola y muestra la mitad.
--
-- La migración 20260912130000 agrega ese índice único, y no se va a poder
-- aplicar mientras haya duplicados. Si esta consulta devuelve filas, hay
-- que decidir con cuál quedarse ANTES de aplicarla — cuál es la buena no
-- es algo que pueda decidir una migración.

SELECT
  pra_historial_laboral_id AS lab_id,
  pra_anio                 AS anio,
  COUNT(*)                 AS filas,
  ARRAY_AGG(pra_id ORDER BY pra_id)                        AS ids,
  ARRAY_AGG(pra_monto_acumulado_aguinaldo ORDER BY pra_id) AS montos
FROM public.sgrh_provisiones_anuales
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY 1, 2;


-- ── 5. Verificación (no cambia nada) ─────────────────────────────────
-- Después de correr lo de arriba, esto debería devolver CERO filas: el
-- acumulado de cada empleado coincide con la suma de sus brutos pagados.

WITH esperado AS (
  SELECT
    d.ndt_historial_laboral_id AS lab_id,
    CASE WHEN p.npe_periodo_mes = 12
         THEN p.npe_periodo_anio + 1
         ELSE p.npe_periodo_anio
    END                        AS anio,
    ROUND(SUM(d.ndt_salario_bruto) / 12, 2) AS monto
  FROM public.sgrh_nomina_detalle d
  JOIN public.sgrh_nomina_periodo p ON p.npe_id = d.ndt_nomina_periodo_id
  WHERE d.ndt_pagado IS TRUE
  GROUP BY 1, 2
)
SELECT
  pr.pra_historial_laboral_id AS lab_id,
  pr.pra_anio                 AS anio,
  pr.pra_monto_acumulado_aguinaldo AS guardado,
  e.monto                          AS esperado
FROM public.sgrh_provisiones_anuales pr
JOIN esperado e
  ON e.lab_id = pr.pra_historial_laboral_id
 AND e.anio   = pr.pra_anio
WHERE ABS(pr.pra_monto_acumulado_aguinaldo - e.monto) >= 0.01;
