-- SGRH-116: two trigger functions were still executable by anon and
-- authenticated, and the Supabase linter reports them
-- ("Public Can Execute SECURITY DEFINER Function").
--
--   - sgrh_set_codigo_postal (trigger on sgrh_direcciones). The baseline
--     20260101000200_tablas_core.sql already revokes it, but projects that
--     existed before the baseline (SGRH-73) never ran that file: it was only
--     marked as applied, so the grant stayed.
--   - sgrh_crear_tipos_tardia_por_defecto (trigger on sgrh_empresas), from
--     20260917130000_catalogo_tipos_tardia.sql, which never revoked it.
--
-- Both return `trigger`, so PostgREST cannot call them and nobody could run
-- them through the API. This is hygiene, not a hole being closed.
--
-- Revoking does not stop the triggers: Postgres checks EXECUTE on a trigger
-- function when the trigger is CREATED, not every time it fires. Idempotent.

REVOKE EXECUTE ON FUNCTION public.sgrh_set_codigo_postal()
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.sgrh_crear_tipos_tardia_por_defecto()
FROM PUBLIC, anon, authenticated;
