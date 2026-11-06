-- Applied only by the test runner to the dedicated sgrh105-e2e Docker stack.
-- Local hook activation needs the same execute grant normally configured when
-- enabling the hook in the dashboard. The baseline revokes PUBLIC execution
-- but does not grant supabase_auth_admin; keep this provisioning visible.
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
-- New local Supabase instances revoke Data API table access by default. These
-- explicit local grants expose the API; the repository RLS still controls rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
DELETE FROM sgrh_candidato_documentos WHERE cdo_candidato_id=1051;
INSERT INTO sgrh_empresas (org_id, org_cedula_juridica, org_nombre_social, org_nombre_fantasia, org_periodicidad_pago)
OVERRIDING SYSTEM VALUE VALUES
  (1051, 'E2E-105-1', 'Empresa E2E Uno', 'Empresa E2E Uno', 'Quincenal'),
  (1052, 'E2E-105-2', 'Empresa E2E Dos', 'Empresa E2E Dos', 'Quincenal')
ON CONFLICT (org_id) DO NOTHING;
INSERT INTO sgrh_sucursales (suc_id, suc_empresa_id, suc_nombre)
OVERRIDING SYSTEM VALUE VALUES (1051,1051,'Sucursal E2E Uno'), (1052,1052,'Sucursal E2E Dos')
ON CONFLICT (suc_id) DO NOTHING;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', md5('sgrh105-' || code)::uuid, 'authenticated', 'authenticated',
  lower(code) || '@e2e.sgrh.local', extensions.crypt('Sgrh105OnlyLocal!', extensions.gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
FROM (VALUES ('ADMIN'), ('KIOSCO')) AS roles(code)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT id::text, id, jsonb_build_object('sub',id::text,'email',email,'email_verified',true), 'email', now(), now()
FROM auth.users WHERE email IN ('admin@e2e.sgrh.local','kiosco@e2e.sgrh.local')
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO sgrh_usuarios_empresa_rol (uer_usuario_id, uer_empresa_id, uer_sucursal_id, uer_rol_id)
SELECT usr.usr_id, 1051, CASE WHEN rol.rol_codigo='KIOSCO' THEN 1051 ELSE NULL END, rol.rol_id
FROM sgrh_usuarios usr JOIN sgrh_cat_roles rol ON lower(rol.rol_codigo)||'@e2e.sgrh.local'=usr.usr_email
WHERE NOT EXISTS (SELECT 1 FROM sgrh_usuarios_empresa_rol existing WHERE existing.uer_usuario_id=usr.usr_id AND existing.uer_empresa_id=1051);

INSERT INTO sgrh_candidatos (cdt_id, cdt_empresa_id, cdt_nombre, cdt_apellido_1, cdt_email)
OVERRIDING SYSTEM VALUE VALUES
  (1051,1051,'Ana E2E','Prueba','ana@e2e.sgrh.local'),
  (1052,1052,'Candidata Ajena E2E','Privada','ajena@e2e.sgrh.local')
ON CONFLICT (cdt_id) DO NOTHING;

INSERT INTO sgrh_direcciones (dir_id, dir_distrito_id, dir_senas_exactas)
SELECT 1051, min(dis_id), 'Dirección ficticia E2E' FROM sgrh_cat_distritos
ON CONFLICT (dir_id) DO NOTHING;
INSERT INTO sgrh_cat_puestos (pue_id, pue_empresa_id, pue_nombre)
OVERRIDING SYSTEM VALUE VALUES (1051,1051,'Puesto E2E') ON CONFLICT (pue_id) DO NOTHING;
INSERT INTO sgrh_empleados (emp_id, emp_tipo_identificacion_id, emp_numero_identificacion, emp_nombre, emp_apellido_1, emp_fecha_ingreso_original, emp_direccion_id)
OVERRIDING SYSTEM VALUE SELECT 1051, min(tid_id), 'E2E1051001', 'Empleado E2E', 'Prueba', '2026-01-01', 1051 FROM sgrh_cat_tipos_identificacion
ON CONFLICT (emp_id) DO NOTHING;
INSERT INTO sgrh_historial_laboral (lab_id, lab_empleado_id, lab_empresa_id, lab_sucursal_id, lab_puesto_id, lab_tipo_jornada_id, lab_tipo_contrato_id, lab_salario_base, lab_salario_real, lab_fecha_inicio)
OVERRIDING SYSTEM VALUE VALUES (1051,1051,1051,1051,1051,(SELECT min(tjo_id) FROM sgrh_cat_tipos_jornada),(SELECT min(tco_id) FROM sgrh_cat_tipos_contrato),400000,400000,'2026-01-01')
ON CONFLICT (lab_id) DO NOTHING;
DELETE FROM sgrh_marcas_asistencia WHERE mar_historial_laboral_id=1051;
