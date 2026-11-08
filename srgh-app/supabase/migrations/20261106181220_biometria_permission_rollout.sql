-- SGRH-102: forward-only permission rollout; no full seed run is required.
-- Keep the already-applied policy migration unchanged. Resolve IDs by code
-- so installations with different catalog IDs receive the same capability.
BEGIN;

INSERT INTO public.sgrh_cat_permisos (per_codigo, per_modulo, per_nombre, per_descripcion)
VALUES ('BIOMETRIA_WRITE', 'empleados', 'Registrar rostros',
        'Registrar, reemplazar y eliminar el rostro de un empleado para el kiosco')
ON CONFLICT (per_codigo) DO NOTHING;

INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
SELECT r.rol_id, p.per_id
FROM public.sgrh_cat_roles r CROSS JOIN public.sgrh_cat_permisos p
WHERE r.rol_codigo IN ('ADMIN', 'GERENTE', 'RRHH', 'SUPERVISOR', 'JEFE_SUCURSAL', 'SUPERADMIN')
  AND p.per_codigo = 'BIOMETRIA_WRITE'
  AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_rol_permisos rp
    WHERE rp.rpe_rol_id = r.rol_id AND rp.rpe_permiso_id = p.per_id
  );

-- SUPERADMIN is only supported when it already exists. Do not create a role,
-- change user assignments or grant unrelated permissions during this rollout.
COMMIT;
