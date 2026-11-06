import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

const read = (file: string) => readFileSync(resolve('supabase/migrations', file), 'utf8')

/** Load exact SQL definitions, failing loudly if a migration no longer matches. */
export async function loadPolicy(db: PGlite, file: string, name: string) {
  const statement = read(file).match(new RegExp(`CREATE POLICY "${name}" ON[\\s\\S]*?;`))?.[0]
  if (!statement) throw new Error(`Missing policy ${name} in ${file}`)
  await db.exec(statement)
}

export async function createPolicyDatabase() {
  const db = new PGlite()
  await db.exec(`
    CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
      SELECT current_setting('request.jwt.claims', true)::jsonb
    $$;
    GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE TABLE public.sgrh_sucursales (suc_id int PRIMARY KEY, suc_empresa_id int);
    INSERT INTO public.sgrh_sucursales VALUES (10,1), (11,1), (20,2);
  `)
  for (const [file, names] of [
    [
      '20260101000400_funciones_auth.sql',
      ['get_empresa_id', 'get_emp_id', 'get_usr_id', 'tiene_permiso'],
    ],
    ['20260912010000_multi_sucursal_usuario.sql', ['get_sucursal_ids', 'sucursal_visible']],
  ] as const) {
    for (const name of names) {
      const statement = read(file).match(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$ LANGUAGE[^;]+;`)
      )?.[0]
      if (!statement) throw new Error(`Missing auth helper ${name}`)
      await db.exec(statement)
    }
  }
  return db
}

/** Every test uses a real non-owner role and rolls back writes, even on error. */
export async function queryAsUser(db: PGlite, metadata: Record<string, unknown>, sql: string) {
  await db.exec('BEGIN')
  try {
    await db.query("SELECT set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ app_metadata: metadata }),
    ])
    await db.exec('SET LOCAL ROLE authenticated')
    return await db.query(sql)
  } finally {
    await db.exec('ROLLBACK')
  }
}
