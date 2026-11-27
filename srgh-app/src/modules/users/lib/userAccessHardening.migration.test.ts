import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const MIGRATION_FILE = '20261127065500_usuarios_acceso_hardening.sql'
const FIX_MIGRATION_FILE = '20261127073000_usuarios_acceso_hardening_fix.sql'
const KIOSK_MIGRATION_FILE = '20261119222018_kiosk_username_login.sql'

const readMigration = (file: string) => readFileSync(resolve('supabase/migrations', file), 'utf8')

const AUTH_ADMIN_1 = '00000000-0000-4000-8000-000000000001'
const AUTH_GERENTE_1 = '00000000-0000-4000-8000-000000000002'
const AUTH_KIOSCO_1 = '00000000-0000-4000-8000-000000000003'
const AUTH_INACTIVE_ROLE = '00000000-0000-4000-8000-000000000004'
const AUTH_MULTI = '00000000-0000-4000-8000-000000000005'
const AUTH_NO_ROLE = '00000000-0000-4000-8000-000000000006'

const SESS_ADMIN_1 = '10000000-0000-4000-8000-000000000001'
const SESS_GERENTE_1 = '10000000-0000-4000-8000-000000000002'
const SESS_KIOSCO_1 = '10000000-0000-4000-8000-000000000003'
const SESS_MULTI_1 = '10000000-0000-4000-8000-000000000005'
const SESS_NO_ROLE = '10000000-0000-4000-8000-000000000006'

let db: PGlite

async function execAsRole(
  role: 'authenticated' | 'anon' | 'service_role',
  jwtClaims: Record<string, unknown> | null,
  sql: string,
  params: unknown[] = []
) {
  await db.exec('BEGIN')
  try {
    if (jwtClaims !== null) {
      await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(jwtClaims),
      ])
    } else {
      await db.query("SELECT set_config('request.jwt.claims', '', true)")
    }
    await db.exec(`SET LOCAL ROLE ${role}`)
    const res = await db.query(sql, params)
    await db.exec('COMMIT')
    return res
  } catch (err) {
    await db.exec('ROLLBACK')
    throw err
  }
}

async function queryAsRole<T = Record<string, unknown>>(
  role: 'authenticated' | 'anon' | 'service_role',
  jwtClaims: Record<string, unknown> | null,
  sql: string,
  params: unknown[] = []
) {
  await db.exec('BEGIN')
  try {
    if (jwtClaims !== null) {
      await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
        JSON.stringify(jwtClaims),
      ])
    } else {
      await db.query("SELECT set_config('request.jwt.claims', '', true)")
    }
    await db.exec(`SET LOCAL ROLE ${role}`)
    return await db.query<T>(sql, params)
  } finally {
    await db.exec('ROLLBACK')
  }
}

async function expectErrorCode(fn: () => Promise<unknown>, code: string) {
  let caught: { code?: string; message?: string } | undefined
  try {
    await fn()
  } catch (err) {
    caught = err as { code?: string; message?: string }
  }
  expect(caught, `Expected SQLSTATE ${code}`).toBeDefined()
  expect(caught?.code).toBe(code)
}

async function runHook(userId: string, existingAppMetadata: Record<string, unknown> = {}) {
  const res = await db.query<{ res: { claims: { app_metadata: Record<string, unknown> } } }>(
    'SELECT public.custom_access_token_hook($1::jsonb) AS res',
    [
      JSON.stringify({
        user_id: userId,
        claims: { sub: userId, app_metadata: existingAppMetadata },
      }),
    ]
  )
  return res.rows[0].res.claims.app_metadata
}

describe('SGRH-119 · usuarios_acceso_hardening (PostgreSQL real con PGlite)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      CREATE ROLE supabase_auth_admin;

      CREATE SCHEMA auth;
      GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role, supabase_auth_admin;

      CREATE TABLE auth.users (
        id uuid PRIMARY KEY,
        email text,
        banned_until timestamptz,
        last_sign_in_at timestamptz
      );

      CREATE TABLE auth.sessions (
        id uuid PRIMARY KEY,
        user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
        not_after timestamptz
      );

      CREATE TABLE auth.refresh_tokens (
        id bigserial PRIMARY KEY,
        user_id text NOT NULL,
        session_id uuid
      );

      CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claims', true), '')::jsonb
      $$;

      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(auth.jwt() ->> 'sub', '')::uuid
      $$;

      CREATE TABLE public.sgrh_empresas (org_id int PRIMARY KEY, org_nombre text);
      CREATE TABLE public.sgrh_sucursales (
        suc_id int PRIMARY KEY,
        suc_empresa_id int REFERENCES public.sgrh_empresas(org_id),
        suc_nombre text,
        suc_activa boolean DEFAULT true
      );
      CREATE TABLE public.sgrh_usuarios (
        usr_id int PRIMARY KEY,
        usr_auth_id uuid UNIQUE,
        usr_empleado_id int,
        usr_email text,
        usr_activo boolean DEFAULT true
      );
      CREATE TABLE public.sgrh_cat_roles (
        rol_id int PRIMARY KEY,
        rol_codigo text NOT NULL UNIQUE,
        rol_nombre text,
        rol_activo boolean DEFAULT true
      );
      CREATE TABLE public.sgrh_cat_permisos (
        per_id int PRIMARY KEY,
        per_codigo text UNIQUE
      );
      CREATE TABLE public.sgrh_rol_permisos (
        rpe_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        rpe_rol_id int REFERENCES public.sgrh_cat_roles(rol_id),
        rpe_permiso_id int REFERENCES public.sgrh_cat_permisos(per_id)
      );
      CREATE TABLE public.sgrh_usuarios_empresa_rol (
        uer_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        uer_usuario_id int REFERENCES public.sgrh_usuarios(usr_id),
        uer_empresa_id int REFERENCES public.sgrh_empresas(org_id),
        uer_sucursal_id int REFERENCES public.sgrh_sucursales(suc_id),
        uer_rol_id int REFERENCES public.sgrh_cat_roles(rol_id),
        uer_activo boolean DEFAULT true
      );

      CREATE TABLE public.sgrh_empleados_rls_probe (
        emp_id int PRIMARY KEY,
        emp_empresa_id int NOT NULL,
        emp_nombre text NOT NULL
      );
      ALTER TABLE public.sgrh_empleados_rls_probe ENABLE ROW LEVEL SECURITY;
      GRANT SELECT, UPDATE ON public.sgrh_empleados_rls_probe TO authenticated;
      GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

      -- Baseline helpers needed before applying the hardening migration
      CREATE SCHEMA IF NOT EXISTS sgrh_private;
    `)

    // Extract revoke_auth_sessions from SGRH-111 migration so sgrh_revoke_user_sessions delegates to it
    const revokeFn = readMigration(KIOSK_MIGRATION_FILE).match(
      /CREATE FUNCTION sgrh_private\.revoke_auth_sessions[\s\S]*?END \$\$;/
    )?.[0]
    if (!revokeFn) throw new Error('Missing revoke_auth_sessions in SGRH-111 migration')
    await db.exec(revokeFn)

    // Apply our hardening migrations in order
    await db.exec(readMigration(MIGRATION_FILE))
    await db.exec(readMigration(FIX_MIGRATION_FILE))

    await db.exec(`
      CREATE POLICY "probe_select" ON public.sgrh_empleados_rls_probe
        FOR SELECT TO authenticated
        USING (
          emp_empresa_id = (SELECT public.get_empresa_id())
          AND (SELECT public.tiene_permiso('EMPLEADOS_READ'))
        );

      CREATE POLICY "probe_update" ON public.sgrh_empleados_rls_probe
        FOR UPDATE TO authenticated
        USING (
          emp_empresa_id = (SELECT public.get_empresa_id())
          AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
        )
        WITH CHECK (
          emp_empresa_id = (SELECT public.get_empresa_id())
          AND (SELECT public.tiene_permiso('EMPLEADOS_WRITE'))
        );
    `)
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    await db.exec(`
      TRUNCATE auth.refresh_tokens, auth.sessions, auth.users,
        public.sgrh_empleados_rls_probe,
        public.sgrh_usuarios_empresa_rol,
        public.sgrh_rol_permisos,
        public.sgrh_cat_permisos,
        public.sgrh_cat_roles,
        public.sgrh_usuarios,
        public.sgrh_sucursales,
        public.sgrh_empresas
      RESTART IDENTITY CASCADE;

      INSERT INTO public.sgrh_empresas VALUES (1, 'Celulares Alex'), (2, 'Infinity CR');
      INSERT INTO public.sgrh_sucursales VALUES
        (10, 1, 'San José', true),
        (11, 1, 'Heredia', true),
        (20, 2, 'Cartago', true);

      INSERT INTO public.sgrh_cat_permisos VALUES
        (1, 'EMPLEADOS_READ'),
        (2, 'EMPLEADOS_WRITE'),
        (3, 'USUARIOS_WRITE'),
        (4, 'ASISTENCIA_KIOSCO'),
        (5, 'NOMINA_READ');

      INSERT INTO public.sgrh_cat_roles (rol_id, rol_codigo, rol_nombre, rol_activo) VALUES
        (2, 'ADMIN', 'Administrador', true),
        (4, 'GERENTE', 'Gerente', true),
        (6, 'ARCHIVADO', 'Rol Archivado', false),
        (13, 'KIOSCO', 'Kiosco de asistencia', false);

      INSERT INTO public.sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id) VALUES
        (2, 1), (2, 2), (2, 3),
        (4, 1),
        (6, 5),
        (13, 4);

      INSERT INTO auth.users (id, email, banned_until, last_sign_in_at) VALUES
        ('${AUTH_ADMIN_1}', 'admin@alex.cr', NULL, '2026-11-26 10:00:00+00'),
        ('${AUTH_GERENTE_1}', 'gerente@alex.cr', NULL, '2026-11-25 14:30:00+00'),
        ('${AUTH_KIOSCO_1}', 'kiosk-1@kiosk.sgrh.internal', NULL, '2026-11-27 01:00:00+00'),
        ('${AUTH_INACTIVE_ROLE}', 'archivado@alex.cr', NULL, '2026-11-20 08:00:00+00'),
        ('${AUTH_MULTI}', 'multi@alex.cr', NULL, '2026-11-26 18:00:00+00'),
        ('${AUTH_NO_ROLE}', 'sinrol@alex.cr', NULL, NULL);

      INSERT INTO auth.sessions (id, user_id) VALUES
        ('${SESS_ADMIN_1}', '${AUTH_ADMIN_1}'),
        ('${SESS_GERENTE_1}', '${AUTH_GERENTE_1}'),
        ('${SESS_KIOSCO_1}', '${AUTH_KIOSCO_1}'),
        ('${SESS_MULTI_1}', '${AUTH_MULTI}'),
        ('${SESS_NO_ROLE}', '${AUTH_NO_ROLE}');

      INSERT INTO auth.refresh_tokens (user_id, session_id) VALUES
        ('${AUTH_ADMIN_1}', '${SESS_ADMIN_1}'),
        ('${AUTH_GERENTE_1}', '${SESS_GERENTE_1}'),
        ('${AUTH_KIOSCO_1}', '${SESS_KIOSCO_1}'),
        ('${AUTH_MULTI}', '${SESS_MULTI_1}');

      INSERT INTO public.sgrh_usuarios (usr_id, usr_auth_id, usr_empleado_id, usr_email, usr_activo) VALUES
        (1, '${AUTH_ADMIN_1}', 101, 'admin@alex.cr', true),
        (2, '${AUTH_GERENTE_1}', 102, 'gerente@alex.cr', true),
        (3, '${AUTH_KIOSCO_1}', NULL, 'kiosk-1@kiosk.sgrh.internal', true),
        (4, '${AUTH_INACTIVE_ROLE}', 104, 'archivado@alex.cr', true),
        (5, '${AUTH_MULTI}', 105, 'multi@alex.cr', true),
        (6, '${AUTH_NO_ROLE}', 106, 'sinrol@alex.cr', true);

      INSERT INTO public.sgrh_usuarios_empresa_rol
        (uer_usuario_id, uer_empresa_id, uer_sucursal_id, uer_rol_id, uer_activo) VALUES
        (1, 1, NULL, 2, true),
        (2, 1, 10, 4, true),
        (3, 1, 10, 13, true),
        (4, 1, NULL, 6, true),
        (5, 1, 10, 4, true),
        (5, 1, 11, 4, true),
        (5, 2, 20, 2, true);

      INSERT INTO public.sgrh_empleados_rls_probe VALUES
        (101, 1, 'Ana'),
        (201, 2, 'Luis');
    `)
  })

  it('1. Revoca sesiones y corta inmediatamente acceso RLS y sgrh_sesion_vigente con JWT aún vigente', async () => {
    const adminJwt = {
      sub: AUTH_ADMIN_1,
      session_id: SESS_ADMIN_1,
      app_metadata: {
        usr_id: 1,
        emp_id: 101,
        rol: 'ADMIN',
        empresa_id: 1,
        sucursal_ids: null,
        permisos: ['EMPLEADOS_READ', 'EMPLEADOS_WRITE', 'USUARIOS_WRITE'],
      },
    }

    // Antes de revocar: todo funciona como authenticated
    const before = await queryAsRole<{
      vigente: boolean
      puede_leer: boolean
      emp: number | null
      rows_count: number
    }>(
      'authenticated',
      adminJwt,
      `SELECT
        public.sgrh_sesion_vigente() AS vigente,
        public.tiene_permiso('EMPLEADOS_READ') AS puede_leer,
        public.get_empresa_id() AS emp,
        (SELECT count(*)::int FROM public.sgrh_empleados_rls_probe) AS rows_count`
    )
    expect(before.rows[0]).toEqual({
      vigente: true,
      puede_leer: true,
      emp: 1,
      rows_count: 1,
    })

    // Revocar sesiones con service_role (como hace setUserActive)
    await execAsRole('service_role', null, 'SELECT public.sgrh_revoke_user_sessions($1::uuid)', [
      AUTH_ADMIN_1,
    ])

    // Mismo JWT sigue en request.jwt.claims, pero auth.sessions y refresh_tokens ya no existen
    const after = await queryAsRole<{
      vigente: boolean
      puede_leer: boolean
      emp: number | null
      emp_id: number | null
      usr_id: number | null
      rol: string | null
      suc_ids: number[] | null
      rows_count: number
    }>(
      'authenticated',
      adminJwt,
      `SELECT
        public.sgrh_sesion_vigente() AS vigente,
        public.tiene_permiso('EMPLEADOS_READ') AS puede_leer,
        public.get_empresa_id() AS emp,
        public.get_emp_id() AS emp_id,
        public.get_usr_id() AS usr_id,
        public.get_rol() AS rol,
        public.get_sucursal_ids() AS suc_ids,
        (SELECT count(*)::int FROM public.sgrh_empleados_rls_probe) AS rows_count`
    )
    expect(after.rows[0]).toEqual({
      vigente: false,
      puede_leer: false,
      emp: null,
      emp_id: null,
      usr_id: null,
      rol: null,
      suc_ids: null,
      rows_count: 0,
    })

    // UPDATE con JWT revocado afecta 0 filas
    const upd = await queryAsRole(
      'authenticated',
      adminJwt,
      `UPDATE public.sgrh_empleados_rls_probe SET emp_nombre = 'Hack' WHERE emp_id = 101`
    )
    expect(upd.affectedRows).toBe(0)
  })

  it('2. usr_activo = false o banned_until activo bloquean sgrh_sesion_vigente y RLS aun con sesión viva', async () => {
    const gerenteJwt = {
      sub: AUTH_GERENTE_1,
      session_id: SESS_GERENTE_1,
      app_metadata: {
        usr_id: 2,
        emp_id: 102,
        rol: 'GERENTE',
        empresa_id: 1,
        sucursal_ids: [10],
        permisos: ['EMPLEADOS_READ'],
      },
    }

    await db.query('UPDATE public.sgrh_usuarios SET usr_activo = false WHERE usr_id = 2')
    const byFlag = await queryAsRole<{ vigente: boolean; count: number }>(
      'authenticated',
      gerenteJwt,
      `SELECT public.sgrh_sesion_vigente() AS vigente, (SELECT count(*)::int FROM public.sgrh_empleados_rls_probe) AS count`
    )
    expect(byFlag.rows[0]).toEqual({ vigente: false, count: 0 })

    // Restaurar usr_activo pero aplicar ban en auth.users
    await db.query('UPDATE public.sgrh_usuarios SET usr_activo = true WHERE usr_id = 2')
    await db.query(
      `UPDATE auth.users SET banned_until = now() + interval '10 years' WHERE id = $1`,
      [AUTH_GERENTE_1]
    )
    const byBan = await queryAsRole<{ vigente: boolean; count: number }>(
      'authenticated',
      gerenteJwt,
      `SELECT public.sgrh_sesion_vigente() AS vigente, (SELECT count(*)::int FROM public.sgrh_empleados_rls_probe) AS count`
    )
    expect(byBan.rows[0]).toEqual({ vigente: false, count: 0 })
  })

  it('3. custom_access_token_hook con usuario inactivo limpia claims previos de app_metadata', async () => {
    await db.query('UPDATE public.sgrh_usuarios SET usr_activo = false WHERE usr_id = 1')

    const meta = await runHook(AUTH_ADMIN_1, {
      usr_id: 1,
      emp_id: 101,
      rol: 'ADMIN',
      empresa_id: 1,
      sucursal_id: 99,
      sucursal_ids: [10],
      permisos: ['EMPLEADOS_READ', 'USUARIOS_WRITE'],
    })

    expect(meta).toEqual({
      usr_id: null,
      emp_id: null,
      rol: 'SIN_ROL',
      empresa_id: null,
      sucursal_ids: null,
      permisos: [],
    })
    expect(meta).not.toHaveProperty('sucursal_id')
  })

  it('4. custom_access_token_hook y sgrh_private.permisos_actor ignoran roles inactivos distintos de KIOSCO', async () => {
    const meta = await runHook(AUTH_INACTIVE_ROLE, {
      rol: 'ARCHIVADO',
      permisos: ['NOMINA_READ'],
    })
    expect(meta).toEqual({
      usr_id: 4,
      emp_id: 104,
      rol: 'SIN_ROL',
      empresa_id: null,
      sucursal_ids: null,
      permisos: [],
    })

    const actor = await queryAsRole(
      'service_role',
      null,
      'SELECT * FROM sgrh_private.permisos_actor($1::uuid, 1)',
      [AUTH_INACTIVE_ROLE]
    )
    expect(actor.rows).toHaveLength(0)
  })

  it('5. Regresión SGRH-111: rol KIOSCO (rol_activo = false) conserva claims, permisos y sesión vigente', async () => {
    const meta = await runHook(AUTH_KIOSCO_1)
    expect(meta).toEqual({
      usr_id: 3,
      emp_id: null,
      rol: 'KIOSCO',
      empresa_id: 1,
      sucursal_ids: [10],
      permisos: ['ASISTENCIA_KIOSCO'],
    })

    const kioskJwt = {
      sub: AUTH_KIOSCO_1,
      session_id: SESS_KIOSCO_1,
      app_metadata: meta,
    }
    const check = await queryAsRole<{ vigente: boolean; puede_kiosco: boolean }>(
      'authenticated',
      kioskJwt,
      `SELECT public.sgrh_sesion_vigente() AS vigente, public.tiene_permiso('ASISTENCIA_KIOSCO') AS puede_kiosco`
    )
    expect(check.rows[0]).toEqual({ vigente: true, puede_kiosco: true })

    // Si se revoca la sesión del kiosco, deja de pasar de inmediato
    await execAsRole('service_role', null, 'SELECT public.sgrh_revoke_user_sessions($1::uuid)', [
      AUTH_KIOSCO_1,
    ])
    const afterRevoke = await queryAsRole<{ vigente: boolean; puede_kiosco: boolean }>(
      'authenticated',
      kioskJwt,
      `SELECT public.sgrh_sesion_vigente() AS vigente, public.tiene_permiso('ASISTENCIA_KIOSCO') AS puede_kiosco`
    )
    expect(afterRevoke.rows[0]).toEqual({ vigente: false, puede_kiosco: false })
  })

  it('6. Multi-empresa: no mezcla sucursales entre empresas y desactivar en empresa 1 corta JWT de empresa 1 pero preserva empresa 2', async () => {
    // Inicialmente el hook elige empresa 1 y agrega solo sus sucursales [10, 11], sin 20
    const metaInicial = await runHook(AUTH_MULTI)
    expect(metaInicial).toEqual({
      usr_id: 5,
      emp_id: 105,
      rol: 'GERENTE',
      empresa_id: 1,
      sucursal_ids: [10, 11],
      permisos: ['EMPLEADOS_READ'],
    })

    // Desactivar uer_activo en empresa 1 (preservando usr_activo = true y empresa 2 activa)
    await db.query(
      'UPDATE public.sgrh_usuarios_empresa_rol SET uer_activo = false WHERE uer_usuario_id = 5 AND uer_empresa_id = 1'
    )

    // El JWT viejo de empresa 1 queda bloqueado inmediatamente
    const jwtEmpresa1 = {
      sub: AUTH_MULTI,
      session_id: SESS_MULTI_1,
      app_metadata: metaInicial,
    }
    const blocked = await queryAsRole<{ vigente: boolean; count: number }>(
      'authenticated',
      jwtEmpresa1,
      `SELECT public.sgrh_sesion_vigente() AS vigente, (SELECT count(*)::int FROM public.sgrh_empleados_rls_probe) AS count`
    )
    expect(blocked.rows[0]).toEqual({ vigente: false, count: 0 })

    // Al re-autenticarse, el hook emite claims limpios de empresa 2
    const metaEmpresa2 = await runHook(AUTH_MULTI, metaInicial)
    expect(metaEmpresa2).toEqual({
      usr_id: 5,
      emp_id: 105,
      rol: 'ADMIN',
      empresa_id: 2,
      sucursal_ids: [20],
      permisos: ['EMPLEADOS_READ', 'EMPLEADOS_WRITE', 'USUARIOS_WRITE'],
    })

    const jwtEmpresa2 = {
      sub: AUTH_MULTI,
      session_id: SESS_MULTI_1,
      app_metadata: metaEmpresa2,
    }
    const allowedEmpresa2 = await queryAsRole<{ vigente: boolean; emp: number; count: number }>(
      'authenticated',
      jwtEmpresa2,
      `SELECT public.sgrh_sesion_vigente() AS vigente, public.get_empresa_id() AS emp, (SELECT count(*)::int FROM public.sgrh_empleados_rls_probe) AS count`
    )
    expect(allowedEmpresa2.rows[0]).toEqual({ vigente: true, emp: 2, count: 1 })
  })

  it('7. sgrh_usuarios_ultimo_acceso_empresa funciona con >1000 cuentas en auth.users sin truncar ni duplicar', async () => {
    // Insertar 1095 cuentas ajenas (empresa 2 o sin empresa) ANTES que las de empresa 1
    await db.exec(`
      INSERT INTO auth.users (id, email, last_sign_in_at)
      SELECT
        gen_random_uuid(),
        'ajeno-' || g || '@other.cr',
        '2026-11-01 00:00:00+00'::timestamptz
      FROM generate_series(1, 1095) AS g;
    `)

    // Empresa 1 tiene 5 usuarios: 1(ADMIN), 2(GERENTE), 3(KIOSCO), 4(ARCHIVADO), 5(MULTI con 2 sucursales en empresa 1)
    // Usuario 6 no tiene fila en empresa 1.
    const totalAuth = await db.query<{ c: number }>('SELECT count(*)::int AS c FROM auth.users')
    expect(totalAuth.rows[0].c).toBe(1101)

    const res = await queryAsRole<{ usr_auth_id: string; last_sign_in_at: Date | null }>(
      'service_role',
      null,
      'SELECT usr_auth_id, last_sign_in_at FROM public.sgrh_usuarios_ultimo_acceso_empresa(1) ORDER BY usr_auth_id'
    )

    // Exactamente 5 filas únicas de empresa 1 (sin duplicar al usuario multi-sucursal 5, ni traer los 1095 ajenos)
    expect(res.rows.map((r) => r.usr_auth_id)).toEqual([
      AUTH_ADMIN_1,
      AUTH_GERENTE_1,
      AUTH_KIOSCO_1,
      AUTH_INACTIVE_ROLE,
      AUTH_MULTI,
    ])
    expect(res.rows[0].last_sign_in_at?.toISOString()).toBe('2026-11-26T10:00:00.000Z')
  })

  it('8. Grants reales (42501), usuario activo SIN_ROL (/unauthorized) y claims malformados', async () => {
    // Usuario activo sin rol puede verificar sgrh_sesion_vigente() -> true (permite ver /unauthorized)
    const noRoleJwt = {
      sub: AUTH_NO_ROLE,
      session_id: SESS_NO_ROLE,
      app_metadata: { usr_id: 6, rol: 'SIN_ROL', empresa_id: null, permisos: [] },
    }
    const noRoleRes = await queryAsRole<{ vigente: boolean }>(
      'authenticated',
      noRoleJwt,
      'SELECT public.sgrh_sesion_vigente() AS vigente'
    )
    expect(noRoleRes.rows[0].vigente).toBe(true)

    // Claims malformados (session_id o empresa_id no válidos) devuelven false en vez de lanzar 22P02
    for (const malformedJwt of [
      { sub: AUTH_ADMIN_1, session_id: 'not-a-uuid', app_metadata: { empresa_id: 1 } },
      { sub: AUTH_ADMIN_1, session_id: '', app_metadata: { empresa_id: 1 } },
      { sub: AUTH_ADMIN_1, session_id: SESS_ADMIN_1, app_metadata: { empresa_id: 'abc' } },
      { sub: 'bad-sub', session_id: SESS_ADMIN_1, app_metadata: { empresa_id: 1 } },
      null,
    ]) {
      const r = await queryAsRole<{ vigente: boolean }>(
        'authenticated',
        malformedJwt,
        'SELECT public.sgrh_sesion_vigente() AS vigente'
      )
      expect(r.rows[0].vigente).toBe(false)
    }

    // Claims numéricos vacíos ("") no deben lanzar 22P02 en get_empresa_id/get_usr_id/get_emp_id
    const emptyNumericJwt = {
      sub: AUTH_NO_ROLE,
      session_id: SESS_NO_ROLE,
      app_metadata: { empresa_id: '', usr_id: '', emp_id: '', rol: 'SIN_ROL', permisos: [] },
    }
    const emptyNumericRes = await queryAsRole<{
      vigente: boolean
      emp: number | null
      usr: number | null
      emp_id: number | null
    }>(
      'authenticated',
      emptyNumericJwt,
      `SELECT
        public.sgrh_sesion_vigente() AS vigente,
        public.get_empresa_id() AS emp,
        public.get_usr_id() AS usr,
        public.get_emp_id() AS emp_id`
    )
    expect(emptyNumericRes.rows[0]).toEqual({
      vigente: true,
      emp: null,
      usr: null,
      emp_id: null,
    })

    // auth.sessions.not_after <= now() se rechaza inmediatamente; > now() pasa
    await db.query(`UPDATE auth.sessions SET not_after = now() + interval '1 hour' WHERE id = $1`, [
      SESS_NO_ROLE,
    ])
    const futureNotAfter = await queryAsRole<{ vigente: boolean }>(
      'authenticated',
      noRoleJwt,
      'SELECT public.sgrh_sesion_vigente() AS vigente'
    )
    expect(futureNotAfter.rows[0].vigente).toBe(true)

    await db.query(
      `UPDATE auth.sessions SET not_after = now() - interval '1 minute' WHERE id = $1`,
      [SESS_NO_ROLE]
    )
    const expiredNotAfter = await queryAsRole<{ vigente: boolean }>(
      'authenticated',
      noRoleJwt,
      'SELECT public.sgrh_sesion_vigente() AS vigente'
    )
    expect(expiredNotAfter.rows[0].vigente).toBe(false)

    // Dos filas activas para la misma sucursal no duplican sucursal_ids en el hook
    await db.query(
      'INSERT INTO public.sgrh_usuarios_empresa_rol (uer_usuario_id, uer_empresa_id, uer_sucursal_id, uer_rol_id, uer_activo) VALUES (2, 1, 10, 4, true)'
    )
    const dedupMeta = await runHook(AUTH_GERENTE_1)
    expect(dedupMeta.sucursal_ids).toEqual([10])

    // authenticated NO puede llamar RPCs privilegiadas (42501)
    await expectErrorCode(
      () =>
        queryAsRole(
          'authenticated',
          noRoleJwt,
          'SELECT public.sgrh_revoke_user_sessions($1::uuid)',
          [AUTH_ADMIN_1]
        ),
      '42501'
    )
    await expectErrorCode(
      () =>
        queryAsRole(
          'authenticated',
          noRoleJwt,
          'SELECT * FROM public.sgrh_usuarios_ultimo_acceso_empresa(1)'
        ),
      '42501'
    )

    // anon NO puede llamar ninguna de las 3 RPCs (42501)
    await expectErrorCode(
      () => queryAsRole('anon', null, 'SELECT public.sgrh_sesion_vigente()'),
      '42501'
    )
    await expectErrorCode(
      () =>
        queryAsRole('anon', null, 'SELECT public.sgrh_revoke_user_sessions($1::uuid)', [
          AUTH_ADMIN_1,
        ]),
      '42501'
    )
    await expectErrorCode(
      () =>
        queryAsRole('anon', null, 'SELECT * FROM public.sgrh_usuarios_ultimo_acceso_empresa(1)'),
      '42501'
    )
  })
})
