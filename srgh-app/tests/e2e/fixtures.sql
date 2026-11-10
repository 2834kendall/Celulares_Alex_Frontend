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
-- Brands. Every run resets them: brands.spec.ts edits colors and logos, and
-- creates "Temporal E2E ..." rows that are removed further down.
INSERT INTO sgrh_marcas_comerciales (mco_id, mco_empresa_id, mco_nombre, mco_activa, mco_color_acento, mco_color_sidebar, mco_logo_path)
OVERRIDING SYSTEM VALUE VALUES
  (1051,1051,'Marca E2E Uno',true,'#9f1239','#1b2a41',NULL),
  (1052,1051,'Marca E2E Dos',true,'#1e40af',NULL,NULL),
  (1053,1052,'Marca E2E Ajena',true,'#5b21b6','#15181d',NULL),
  (1054,1051,'Marca E2E Tiendas',true,'#334155','#f1efe8',NULL)
ON CONFLICT (mco_id) DO UPDATE SET mco_nombre=EXCLUDED.mco_nombre, mco_activa=EXCLUDED.mco_activa,
  mco_color_acento=EXCLUDED.mco_color_acento, mco_color_sidebar=EXCLUDED.mco_color_sidebar, mco_logo_path=NULL;
INSERT INTO sgrh_sucursales (suc_id, suc_empresa_id, suc_nombre, suc_marca_id)
OVERRIDING SYSTEM VALUE VALUES
  (1051,1051,'Sucursal E2E Uno',1051),
  (1052,1052,'Sucursal E2E Dos',1053),
  (1053,1051,'Mall E2E',1054),
  (1054,1051,'Centro E2E',1054),
  (1055,1051,'Otra E2E',1052)
ON CONFLICT (suc_id) DO UPDATE SET suc_marca_id=EXCLUDED.suc_marca_id, suc_activa=true;
DELETE FROM sgrh_sucursales WHERE suc_empresa_id=1051 AND suc_nombre LIKE 'Temporal E2E%';
DELETE FROM sgrh_marcas_comerciales WHERE mco_empresa_id=1051 AND mco_nombre LIKE 'Temporal E2E%';
-- Company theme and logo for the general view. global-setup.ts uploads the file.
UPDATE sgrh_empresas SET org_color_acento='#166534', org_color_sidebar='#eef1f4',
  org_logo_url='1051/logo/e2e-empresa.png' WHERE org_id=1051;

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT '00000000-0000-0000-0000-000000000000', md5('sgrh105-' || code)::uuid, 'authenticated', 'authenticated',
  lower(code) || '@e2e.sgrh.local', extensions.crypt('Sgrh105OnlyLocal!', extensions.gen_salt('bf')),
  now(), now(), now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, '', '', '', ''
FROM (VALUES ('ADMIN'), ('KIOSCO'), ('GERENTE'), ('GERENTE2'), ('EMPLEADO')) AS roles(code)
ON CONFLICT (id) DO NOTHING;
INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT id::text, id, jsonb_build_object('sub',id::text,'email',email,'email_verified',true), 'email', now(), now()
FROM auth.users WHERE email IN ('admin@e2e.sgrh.local','kiosco@e2e.sgrh.local','gerente@e2e.sgrh.local','gerente2@e2e.sgrh.local','empleado@e2e.sgrh.local')
ON CONFLICT (provider_id, provider) DO NOTHING;
INSERT INTO sgrh_usuarios_empresa_rol (uer_usuario_id, uer_empresa_id, uer_sucursal_id, uer_rol_id)
SELECT usr.usr_id, 1051, cuenta.sucursal, rol.rol_id
FROM (VALUES
  ('admin@e2e.sgrh.local','ADMIN',NULL::int),
  ('kiosco@e2e.sgrh.local','KIOSCO',1051),
  -- Two managers in two stores of the same brand: the shared-theme criterion.
  ('gerente@e2e.sgrh.local','GERENTE',1053),
  ('gerente2@e2e.sgrh.local','GERENTE',1054),
  -- No branch on the account: the brand has to come from the current contract.
  ('empleado@e2e.sgrh.local','EMPLEADO',NULL)
) AS cuenta(email, rol, sucursal)
JOIN sgrh_usuarios usr ON usr.usr_email=cuenta.email
JOIN sgrh_cat_roles rol ON rol.rol_codigo=cuenta.rol
WHERE NOT EXISTS (SELECT 1 FROM sgrh_usuarios_empresa_rol existing WHERE existing.uer_usuario_id=usr.usr_id AND existing.uer_empresa_id=1051);
-- Each company gets its own copy of the role templates and its accounts move to it
-- (supabase/seeds/01_sistema/01_roles.sql). Re-runnable: a second run creates nothing.
SELECT sgrh_private.instanciar_roles_empresa(org_id) FROM sgrh_empresas WHERE org_id IN (1051, 1052);
-- Roles. Every run resets them: roles.spec.ts creates "Rol E2E ..." roles and edits
-- the company's copy of Gerente, and a test that fails halfway must not leak into
-- the next run.
-- 1. Whatever is not the copy of a template goes away (the roles a test created).
DELETE FROM sgrh_rol_permisos WHERE rpe_rol_id IN (
  SELECT r.rol_id FROM sgrh_cat_roles r WHERE r.rol_empresa_id IN (1051,1052) AND NOT EXISTS (
    SELECT 1 FROM sgrh_cat_roles t WHERE t.rol_empresa_id IS NULL AND r.rol_codigo='EMPRESA_'||r.rol_empresa_id||'_'||t.rol_codigo));
DELETE FROM sgrh_cat_roles r WHERE r.rol_empresa_id IN (1051,1052) AND NOT EXISTS (
  SELECT 1 FROM sgrh_cat_roles t WHERE t.rol_empresa_id IS NULL AND r.rol_codigo='EMPRESA_'||r.rol_empresa_id||'_'||t.rol_codigo);
-- 2. The copies get back the name and the permissions of their template.
UPDATE sgrh_cat_roles c SET rol_nombre=t.rol_nombre, rol_descripcion=t.rol_descripcion, rol_activo=true
FROM sgrh_cat_roles t
WHERE t.rol_empresa_id IS NULL AND c.rol_empresa_id IN (1051,1052) AND c.rol_codigo='EMPRESA_'||c.rol_empresa_id||'_'||t.rol_codigo;
DELETE FROM sgrh_rol_permisos rp USING sgrh_cat_roles c WHERE rp.rpe_rol_id=c.rol_id AND c.rol_empresa_id IN (1051,1052);
INSERT INTO sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id)
SELECT c.rol_id, rp.rpe_permiso_id
FROM sgrh_cat_roles c
JOIN sgrh_cat_roles t ON t.rol_empresa_id IS NULL AND c.rol_codigo='EMPRESA_'||c.rol_empresa_id||'_'||t.rol_codigo
JOIN sgrh_rol_permisos rp ON rp.rpe_rol_id=t.rol_id
WHERE c.rol_empresa_id IN (1051,1052);

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
UPDATE sgrh_usuarios SET usr_empleado_id=1051 WHERE usr_email='empleado@e2e.sgrh.local';
-- A borrowed shift today in a store of ANOTHER brand: it must not change the theme.
INSERT INTO sgrh_programacion_semanal (prg_id, prg_empleado_id, prg_sucursal_id, prg_historial_laboral_id, prg_fecha, prg_hora_entrada_custom, prg_hora_salida_custom)
OVERRIDING SYSTEM VALUE VALUES (1051,1051,1055,1051,(now() AT TIME ZONE 'America/Costa_Rica')::date,'08:00','16:00')
ON CONFLICT (prg_id) DO UPDATE SET prg_fecha=EXCLUDED.prg_fecha;

INSERT INTO sgrh_evaluaciones (eve_id, eve_empresa_id, eve_tipo_evaluacion, eve_historial_laboral_id, eve_sucursal_id, eve_evaluador_id, eve_fecha_evaluacion, eve_tipo_periodo, eve_estado, eve_promedio_final, eve_observaciones)
OVERRIDING SYSTEM VALUE VALUES
  (1051,1051,'Mensual',1051,1051,(SELECT usr_id FROM sgrh_usuarios WHERE usr_email='admin@e2e.sgrh.local'),'2026-11-06','Noviembre 2026','completada',8,'original'),
  (1052,1052,'Mensual',NULL,1052,(SELECT usr_id FROM sgrh_usuarios WHERE usr_email='admin@e2e.sgrh.local'),'2026-11-06','Noviembre 2026','completada',8,'foreign evaluation')
ON CONFLICT (eve_id) DO UPDATE SET eve_observaciones=EXCLUDED.eve_observaciones;
