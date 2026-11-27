import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// SGRH-122: la identificación es única comparando sin guiones ni espacios.
const MIGRACION = readFileSync(
  'supabase/migrations/20261126130000_identificacion_normalizada.sql',
  'utf8'
)

describe('identificación normalizada (migración)', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon NOLOGIN;
      CREATE ROLE authenticated NOLOGIN;
      CREATE TABLE public.sgrh_empleados (
        emp_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        emp_numero_identificacion varchar NOT NULL UNIQUE
      );
      INSERT INTO public.sgrh_empleados (emp_numero_identificacion)
        VALUES ('1-3000-0300'), ('PC-20260926'), ('134f');
    `)
    await db.exec(MIGRACION)
  }, 30_000)

  afterAll(async () => {
    await db?.close()
  })

  it.each(['130000300', '1 3000 0300', '1.3000.0300'])(
    'rechaza %s porque ya existe 1-3000-0300',
    async (numero) => {
      await expect(
        db.query('INSERT INTO public.sgrh_empleados (emp_numero_identificacion) VALUES ($1)', [
          numero,
        ])
      ).rejects.toThrow('ux_empleados_identificacion_normalizada')
    }
  )

  it('no distingue mayúsculas en letras (pasaporte, DIMEX)', async () => {
    await expect(
      db.query("INSERT INTO public.sgrh_empleados (emp_numero_identificacion) VALUES ('134F')")
    ).rejects.toThrow('identificacion')
  })

  it('acepta un número distinto', async () => {
    await db.query(
      "INSERT INTO public.sgrh_empleados (emp_numero_identificacion) VALUES ('1-3000-0301')"
    )
    const { rows } = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM public.sgrh_empleados WHERE emp_numero_identificacion = '1-3000-0301'"
    )
    expect(rows[0].n).toBe(1)
  })

  it('identificacion_en_uso compara con la misma regla', async () => {
    const uso = async (numero: string) =>
      (
        await db.query<{ en_uso: boolean }>('SELECT public.identificacion_en_uso($1) AS en_uso', [
          numero,
        ])
      ).rows[0].en_uso

    expect(await uso('130000300')).toBe(true)
    expect(await uso('pc 20260926')).toBe(true)
    expect(await uso('2-0000-0000')).toBe(false)
  })

  it('la consulta del aviso no queda abierta para anon', async () => {
    const { rows } = await db.query<{ puede: boolean }>(
      "SELECT has_function_privilege('anon', 'public.identificacion_en_uso(text)', 'EXECUTE') AS puede"
    )
    expect(rows[0].puede).toBe(false)
  })
})
