import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const sql = readFileSync(
  resolve('supabase/migrations/20261124202800_revoke_trigger_function_execute.sql'),
  'utf8'
)
let db: PGlite

const FUNCTIONS = ['sgrh_set_codigo_postal()', 'sgrh_crear_tipos_tardia_por_defecto()']

describe('trigger function grants (SGRH-116)', () => {
  beforeEach(async () => {
    db = new PGlite()
    // Minimal copies of both triggers: what matters is the grant, not the body.
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;

      CREATE TABLE sgrh_direcciones (dir_id int PRIMARY KEY, dir_codigo_postal text);
      CREATE FUNCTION public.sgrh_set_codigo_postal() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN NEW.dir_codigo_postal := '10101'; RETURN NEW; END $$;
      CREATE TRIGGER trg_direcciones_codigo_postal BEFORE INSERT ON sgrh_direcciones
        FOR EACH ROW EXECUTE FUNCTION public.sgrh_set_codigo_postal();

      CREATE TABLE sgrh_empresas (emp_id int PRIMARY KEY);
      CREATE TABLE sgrh_tipos_tardia (emp_id int);
      CREATE FUNCTION public.sgrh_crear_tipos_tardia_por_defecto() RETURNS trigger
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
      BEGIN INSERT INTO sgrh_tipos_tardia VALUES (NEW.emp_id); RETURN NEW; END $$;
      CREATE TRIGGER sgrh_empresas_tipos_tardia_por_defecto AFTER INSERT ON sgrh_empresas
        FOR EACH ROW EXECUTE FUNCTION public.sgrh_crear_tipos_tardia_por_defecto();

      GRANT INSERT, SELECT ON sgrh_direcciones, sgrh_empresas TO authenticated;
    `)
  }, 30000)
  afterEach(async () => {
    await db?.close()
  })

  async function canExecute(role: string, fn: string) {
    const { rows } = await db.query<{ ok: boolean }>(
      `SELECT has_function_privilege($1, $2, 'EXECUTE') AS ok`,
      [role, `public.${fn}`]
    )
    return rows[0].ok
  }

  it('starts with both functions executable by anon and authenticated', async () => {
    for (const fn of FUNCTIONS) {
      expect(await canExecute('anon', fn)).toBe(true)
      expect(await canExecute('authenticated', fn)).toBe(true)
    }
  })

  it('revokes EXECUTE from anon and authenticated', async () => {
    await db.exec(sql)
    for (const fn of FUNCTIONS) {
      expect(await canExecute('anon', fn)).toBe(false)
      expect(await canExecute('authenticated', fn)).toBe(false)
    }
  })

  it('keeps both triggers firing for a role without EXECUTE', async () => {
    await db.exec(sql)
    await db.exec(`
      SET ROLE authenticated;
      INSERT INTO sgrh_direcciones (dir_id) VALUES (1);
      INSERT INTO sgrh_empresas VALUES (7);
      RESET ROLE;
    `)
    const dir = await db.query<{ dir_codigo_postal: string }>(
      'SELECT dir_codigo_postal FROM sgrh_direcciones'
    )
    const tipos = await db.query<{ emp_id: number }>('SELECT emp_id FROM sgrh_tipos_tardia')
    expect(dir.rows[0].dir_codigo_postal).toBe('10101')
    expect(tipos.rows).toEqual([{ emp_id: 7 }])
  })

  it('is idempotent', async () => {
    await db.exec(sql)
    await expect(db.exec(sql)).resolves.toBeDefined()
  })
})
