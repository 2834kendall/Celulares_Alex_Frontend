-- =====================================================================
-- Seed de DEMO — una cuenta por rol para Inversiones Scorlion SRL
-- =====================================================================
-- ⚠️  NUNCA EN PRODUCCIÓN. Crea 12 cuentas con una contraseña conocida y
-- publicada en este archivo. Está fuera de sql_paths a propósito (igual que
-- todo 99_demo/): un `db push --include-seed` no lo aplica. Se corre con
-- `pnpm supabase:seed:demo`.
--
-- Depende de 01_empresa_sucursales.sql: sin la empresa no hay a qué vincular.
--
-- ─── Contraseña de todas las cuentas ─────────────────────────────────
--
--     SgrhDemo2026!
--
-- Correos: <rol_en_minuscula>@demo.sgrh.local  (ej. admin@demo.sgrh.local)
-- El TLD .local no existe: ningún correo puede salir de verdad.
--
-- ─── Cómo funciona el encadenado ─────────────────────────────────────
-- 1. INSERT en auth.users  → dispara on_auth_user_created, que crea la fila
--    de sgrh_usuarios con usr_auth_id. NO insertamos ahí a mano.
-- 2. INSERT en auth.identities → sin esto signInWithPassword falla: GoTrue
--    busca la identidad 'email', no solo el usuario.
-- 3. INSERT en sgrh_usuarios_empresa_rol → define rol y alcance. Es esta
--    fila la que el hook del JWT lee para armar app_metadata.
--
-- ─── Convergente ─────────────────────────────────────────────────────
-- Los uuid se derivan del código de rol con md5(), así que son estables
-- entre corridas y el ON CONFLICT puede anclarse en ellos. uer usa anti-join
-- porque no tiene índice único natural.
--
-- ─── Limitación conocida: la cuenta EMPLEADO ─────────────────────────
-- EMPLEADO no tiene permisos a propósito; su acceso sale de las ramas
-- `emp_id = get_emp_id()` de las policies. Ese emp_id viene de
-- sgrh_usuarios.usr_empleado_id, y este seed NO crea empleados (haría falta
-- dirección + historial laboral + un puesto, y los catálogos por empresa
-- todavía se cargan desde la UI).
--
-- O sea: la cuenta EMPLEADO entra pero no ve nada hasta que exista un
-- empleado. El paso 4 de abajo la vincula sola, así que basta con crear un
-- empleado desde la UI y volver a correr este seed.
-- =====================================================================

-- ─── 0. Guarda: la empresa demo tiene que existir ───────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sgrh_empresas WHERE org_cedula_juridica = '3-102-866597'
  ) THEN
    RAISE EXCEPTION
      'Falta la empresa demo. Corré primero 99_demo/01_empresa_sucursales.sql';
  END IF;
END
$$;

-- ─── 1. Cuentas en auth.users ───────────────────────────────────────────────
-- Los campos de token van en '' y no NULL: GoTrue los lee como string y con
-- NULL revienta al escanear la fila ("converting NULL to string is unsupported").

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  md5('sgrh-demo-usuario-' || r.rol_codigo)::uuid,
  'authenticated',
  'authenticated',
  lower(r.rol_codigo) || '@demo.sgrh.local',
  extensions.crypt('SgrhDemo2026!', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('rol_demo', r.rol_codigo),
  '', '', '', ''
FROM public.sgrh_cat_roles r
ON CONFLICT (id) DO NOTHING;

-- ─── 2. Identidades (login por email/password) ──────────────────────────────

INSERT INTO auth.identities (
  provider_id, user_id, identity_data, provider,
  created_at, updated_at
)
SELECT
  u.id::text,
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email',
  now(), now()
FROM auth.users u
WHERE u.email LIKE '%@demo.sgrh.local'
ON CONFLICT (provider_id, provider) DO NOTHING;

-- ─── 3. Vínculo empresa / rol / sucursal ────────────────────────────────────
-- El alcance NO lo decide el rol sino uer_sucursal_id:
--   NULL       -> opera a nivel empresa (el hook emite sucursal_id: null y
--                 sucursal_visible() deja pasar todas las sucursales)
--   con valor  -> acotado a esa sucursal
--
-- Los roles de sucursal se atan a 'Tienda Infinity' para que el contraste
-- contra 'Celulares Alex' sea probable de inmediato.

INSERT INTO public.sgrh_usuarios_empresa_rol (
  uer_usuario_id, uer_empresa_id, uer_sucursal_id, uer_rol_id, uer_activo
)
SELECT
  usr.usr_id,
  e.org_id,
  CASE WHEN m.sucursal IS NULL THEN NULL
       ELSE (SELECT s.suc_id FROM public.sgrh_sucursales s
             WHERE s.suc_empresa_id = e.org_id AND s.suc_nombre = m.sucursal)
  END,
  r.rol_id,
  true
FROM (VALUES
  -- rol            sucursal a la que se adscribe (NULL = toda la empresa)
  ('ADMIN',         NULL),
  ('GERENTE',       'Tienda Infinity'),
  ('EMPLEADO',      NULL),
  ('KIOSCO',        'Tienda Infinity'),
  ('RRHH',          NULL),
  ('SUPERVISOR',    'Tienda Infinity'),
  ('CONTADOR',      NULL),
  ('RECLUTADOR',    NULL),
  ('AUDITOR',       NULL),
  ('JEFE_SUCURSAL', 'Tienda Infinity'),
  ('SOPORTE',       NULL),
  ('EVALUADOR',     NULL)
) AS m(rol, sucursal)
JOIN public.sgrh_cat_roles r ON r.rol_codigo = m.rol
JOIN public.sgrh_usuarios  usr
  ON usr.usr_email = lower(m.rol) || '@demo.sgrh.local'
CROSS JOIN public.sgrh_empresas e
WHERE e.org_cedula_juridica = '3-102-866597'
  AND NOT EXISTS (
    SELECT 1 FROM public.sgrh_usuarios_empresa_rol x
    WHERE x.uer_usuario_id = usr.usr_id
      AND x.uer_empresa_id = e.org_id
  );

-- ─── 4. Vincular la cuenta EMPLEADO a un empleado real, si existe ───────────
-- No-op mientras no haya empleados. Crear uno desde la UI y volver a correr
-- este seed es lo que le da contenido a esa cuenta.

UPDATE public.sgrh_usuarios usr
SET usr_empleado_id = (
  SELECT hl.lab_empleado_id
  FROM public.sgrh_historial_laboral hl
  JOIN public.sgrh_empresas e ON e.org_id = hl.lab_empresa_id
  WHERE e.org_cedula_juridica = '3-102-866597'
    AND hl.lab_fecha_fin IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.sgrh_usuarios u2
      WHERE u2.usr_empleado_id = hl.lab_empleado_id
    )
  ORDER BY hl.lab_empleado_id
  LIMIT 1
)
WHERE usr.usr_email = 'empleado@demo.sgrh.local'
  AND usr.usr_empleado_id IS NULL;

-- ─── 5. Resumen ─────────────────────────────────────────────────────────────

SELECT
  usr.usr_email                                        AS cuenta,
  r.rol_codigo                                         AS rol,
  CASE WHEN r.rol_activo THEN 'activo' ELSE 'inactivo' END AS estado_rol,
  coalesce(s.suc_nombre, '(toda la empresa)')          AS alcance,
  coalesce(usr.usr_empleado_id::text, '—')             AS empleado,
  count(p.per_codigo)::text                            AS permisos
FROM public.sgrh_usuarios usr
JOIN public.sgrh_usuarios_empresa_rol uer ON uer.uer_usuario_id = usr.usr_id
JOIN public.sgrh_cat_roles r              ON r.rol_id = uer.uer_rol_id
LEFT JOIN public.sgrh_sucursales s        ON s.suc_id = uer.uer_sucursal_id
LEFT JOIN public.sgrh_rol_permisos rp     ON rp.rpe_rol_id = r.rol_id
LEFT JOIN public.sgrh_cat_permisos p      ON p.per_id = rp.rpe_permiso_id
WHERE usr.usr_email LIKE '%@demo.sgrh.local'
GROUP BY usr.usr_email, r.rol_codigo, r.rol_activo, s.suc_nombre, usr.usr_empleado_id
ORDER BY r.rol_activo DESC, r.rol_codigo;
