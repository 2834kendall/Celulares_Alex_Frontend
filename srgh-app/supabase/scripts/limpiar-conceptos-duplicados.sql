-- =====================================================================
-- SCRIPT ONE-OFF — retirar los conceptos de nómina duplicados
-- =====================================================================
-- ⚠️  NO es una migración, y es OPCIONAL. Un proyecto nuevo nunca siembra
-- estos conceptos (ver seeds/02_catalogos/04_nomina.sql). Este script existe
-- solo para alinear un proyecto que YA los tiene.
--
-- ── Qué se retira y por qué ─────────────────────────────────────────────
-- Dos generaciones de conceptos convivían: la serie de diseño (ING/DED/PAT)
-- y la del machote de planilla del cliente. Cinco son duplicados exactos:
--
--   ING001 Salario Base          → duplica BASE
--   ING002 Horas Extra 50%       → duplica HORAS_EXTRA
--   ING003 Horas Extra 75%       → duplica HORAS_EXTRA
--   ING004 Comisiones por Ventas → duplica COMISION
--   DED001 CCSS Obrero (SEM+IVM) → duplica CCSS_OBRERA
--
-- El RESTO de la serie ING/DED/PAT se conserva: aguinaldo, renta, embargo,
-- préstamo, viáticos y cargas patronales no tienen equivalente.
--
-- Ninguno de los cinco está referenciado desde el código (se verificó con
-- grep: el módulo de nómina solo usa BASE, COMISION, CCSS_OBRERA y
-- HORAS_EXTRA).
--
-- ── Antes de correrlo ───────────────────────────────────────────────────
-- Si alguna planilla ya usó estos conceptos, el DELETE falla por FK. Eso es
-- deseable: significa que hay datos reales colgando y borrarlos los
-- rompería. En ese caso, la alternativa es desactivarlos en vez de
-- borrarlos (ver el UPDATE comentado al final).
-- =====================================================================

BEGIN;

-- 1. Diagnóstico: ¿alguien los usa? Si esto devuelve filas con uso > 0,
--    NO sigas con el DELETE.
SELECT
  c.con_codigo,
  c.con_nombre,
  (SELECT count(*) FROM public.sgrh_nomina_linea_ingreso   i WHERE i.ing_concepto_id = c.con_id) AS en_ingresos,
  (SELECT count(*) FROM public.sgrh_nomina_linea_deduccion d WHERE d.ded_concepto_id = c.con_id) AS en_deducciones,
  (SELECT count(*) FROM public.sgrh_nomina_linea_patronal  p WHERE p.pat_concepto_id = c.con_id) AS en_patronales
FROM public.sgrh_cat_conceptos_nomina c
WHERE c.con_codigo IN ('ING001', 'ING002', 'ING003', 'ING004', 'DED001')
ORDER BY c.con_codigo;

-- 2. Borrado. Falla con 23503 (foreign_key_violation) si algo los referencia.
DELETE FROM public.sgrh_cat_conceptos_nomina
WHERE con_codigo IN ('ING001', 'ING002', 'ING003', 'ING004', 'DED001');

COMMIT;

-- ── Alternativa si el DELETE falla por FK ───────────────────────────────
-- Desactivarlos conserva el histórico de planillas y los saca de la UI:
--
--   UPDATE public.sgrh_cat_conceptos_nomina
--   SET con_activo = false
--   WHERE con_codigo IN ('ING001', 'ING002', 'ING003', 'ING004', 'DED001');
