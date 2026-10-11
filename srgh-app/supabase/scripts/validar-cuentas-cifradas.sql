-- =====================================================================
-- SCRIPT ONE-OFF — cerrar la migración a cuentas cifradas
-- =====================================================================
-- ⚠️  NO es una migración. Se corre UNA vez por proyecto, DESPUÉS de
-- scripts/encrypt-payment-data.ts (el backfill que cifra las filas viejas).
--
--   supabase db query --linked -f supabase/scripts/validar-cuentas-cifradas.sql
--
-- ── Qué hace y por qué está separado ────────────────────────────────────
-- La migración 20260824120000 creó los dos CHECK como NOT VALID. NOT VALID
-- salta el escaneo inicial: las filas que ya existían (en texto plano y sin
-- índice) sobreviven, mientras que toda escritura nueva sí queda obligada a
-- cumplir. Eso permite desplegar sin romper nada, pero deja los constraints a
-- medias hasta que alguien los valide — que es lo que hace este script.
--
-- El backfill no puede hacerlo: corre por PostgREST, que no ejecuta DDL. Y la
-- migración tampoco, porque en el momento de aplicarse los datos viejos todavía
-- están en claro y VALIDATE fallaría.
--
-- ── Antes de correrlo ───────────────────────────────────────────────────
-- Los dos primeros SELECT tienen que devolver 0. Si no, el backfill no terminó
-- (o alguna fila quedó ilegible, y ese caso lo reporta el script de Node). Los
-- ALTER de abajo fallan solos si queda algo pendiente — no hay forma de dejar
-- la base en un estado a medias.
-- =====================================================================

BEGIN;

-- 1. Diagnóstico. Ambos conteos deben ser 0 antes de seguir.
SELECT
  count(*) FILTER (
    WHERE edp_numero_cuenta IS NOT NULL AND edp_numero_cuenta !~ '^v[0-9]+:'
  ) AS en_texto_plano,
  count(*) FILTER (
    WHERE (edp_numero_cuenta IS NULL) <> (edp_cuenta_hmac IS NULL)
  ) AS desparejadas
FROM public.sgrh_empleado_datos_pago;

-- 2. Extender los constraints a las filas históricas. VALIDATE escanea la tabla
--    entera; si algo no cumple, aborta con 23514 y el COMMIT no ocurre.
ALTER TABLE public.sgrh_empleado_datos_pago
  VALIDATE CONSTRAINT edp_numero_cuenta_cifrado;

ALTER TABLE public.sgrh_empleado_datos_pago
  VALIDATE CONSTRAINT edp_cuenta_hmac_pareado;

COMMIT;

-- ── Diagnóstico opcional: cuentas repetidas ─────────────────────────────
-- El índice ciego permite detectar la misma cuenta en dos empleados sin poder
-- leerla. La app avisa al guardar, pero eso solo cubre lo que se escriba de
-- ahora en adelante; esta consulta muestra lo que YA está en la base.
--
-- Compartir cuenta puede ser legítimo (cónyuges, por ejemplo). Lo que no debería
-- pasar es que aparezca sin explicación: es el patrón del empleado fantasma
-- cobrando a la cuenta de otro.
--
--   SELECT dp.edp_cuenta_hmac,
--          count(*) AS empleados,
--          array_agg(e.emp_nombre || ' ' || e.emp_apellido_1 ORDER BY e.emp_id) AS quienes
--   FROM public.sgrh_empleado_datos_pago dp
--   JOIN public.sgrh_empleados e ON e.emp_id = dp.edp_empleado_id
--   WHERE dp.edp_cuenta_hmac IS NOT NULL
--   GROUP BY dp.edp_cuenta_hmac
--   HAVING count(*) > 1;
