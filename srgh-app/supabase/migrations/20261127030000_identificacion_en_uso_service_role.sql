-- =====================================================================
-- SGRH-122: el aviso de identificación repetida consulta con service_role
-- =====================================================================
-- checkEmployeeIdentificacion (SGRH-118) usa el cliente admin a propósito: la
-- unicidad es de toda la tabla y la RLS de la sesión no ve empleados de otras
-- empresas. Para comparar con la regla normalizada (sin guiones ni espacios,
-- 20261126130000) llama a identificacion_en_uso con ese cliente, así que
-- service_role necesita poder ejecutarla. Se otorga explícito, como el resto
-- de funciones que usa el cliente admin. Es idempotente.
-- =====================================================================

GRANT EXECUTE ON FUNCTION public.identificacion_en_uso(text) TO service_role;
