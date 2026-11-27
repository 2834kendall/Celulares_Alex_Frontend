-- =====================================================================
-- SGRH-122: la identificación es única sin importar guiones ni espacios
-- =====================================================================
-- La restricción UNIQUE de emp_numero_identificacion compara el texto tal
-- cual: "1-3000-0300" y "130000300" pasaban como dos personas distintas. En
-- la base conviven los dos formatos (47 cédulas físicas con guiones y 7 sin
-- guiones al 26/11/2026), así que el duplicado se colaba.
--
-- Cambio:
--   * normalizar_identificacion(): mayúsculas y solo letras y dígitos.
--   * Índice único sobre el valor normalizado. La restricción original se
--     deja: el índice nuevo es más estricto y la contiene.
--   * identificacion_en_uso(): para avisar en el paso 1 del alta con la
--     misma regla que aplica el índice. SECURITY INVOKER: respeta la RLS.
--
-- Los datos no cambian: cada número se sigue guardando y mostrando como se
-- escribió. Antes de aplicar se verificó que no hay números que choquen al
-- normalizar (consulta en el plan de SGRH-122); si los hubiera, el CREATE
-- UNIQUE INDEX falla y la migración entera se revierte.
-- =====================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_identificacion(p_numero text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = ''
AS $$
  SELECT pg_catalog.upper(
    pg_catalog.regexp_replace(COALESCE(p_numero, ''), '[^0-9A-Za-z]', '', 'g')
  )
$$;

COMMENT ON FUNCTION public.normalizar_identificacion(text) IS
  'Identificación sin guiones, espacios ni signos y en mayúsculas: la usa el índice único de sgrh_empleados (SGRH-122).';

CREATE UNIQUE INDEX ux_empleados_identificacion_normalizada
  ON public.sgrh_empleados (public.normalizar_identificacion(emp_numero_identificacion));

CREATE OR REPLACE FUNCTION public.identificacion_en_uso(p_numero text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.sgrh_empleados e
    WHERE public.normalizar_identificacion(e.emp_numero_identificacion)
        = public.normalizar_identificacion(p_numero)
  )
$$;

COMMENT ON FUNCTION public.identificacion_en_uso(text) IS
  'true si algún empleado visible para la cuenta ya tiene esa identificación, comparando normalizado (SGRH-122).';

REVOKE EXECUTE ON FUNCTION public.identificacion_en_uso(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.identificacion_en_uso(text) FROM anon;
GRANT  EXECUTE ON FUNCTION public.identificacion_en_uso(text) TO authenticated;

COMMIT;
