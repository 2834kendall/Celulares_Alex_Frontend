import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Real PostgreSQL execution against disposable in-memory fixtures, not the hosted DB.
describe('atomic kiosk migration', () => {
  let db: PGlite
  const operation = '00000000-0000-4000-8000-000000000001'
  const mark = (id = operation, overrides = {}) => ({
    mar_operacion_id: id,
    mar_historial_laboral_id: 1,
    mar_sucursal_id: 100,
    mar_tipo: 'entrada',
    mar_fecha_hora: '2026-11-05 08:00:00',
    mar_metodo_verificacion: 'FACIAL',
    ...overrides,
  })
  async function save(row: object, snapshot: unknown[] = [], company = 1) {
    const r = await db.query<{ result: string }>(
      'select public.registrar_marca_kiosco_atomica($1::jsonb, $2::jsonb, $3) as result',
      [JSON.stringify(row), JSON.stringify(snapshot), company]
    )
    return r.rows[0].result
  }
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sgrh_historial_laboral (lab_id int PRIMARY KEY, lab_empresa_id int, lab_fecha_fin date);
      INSERT INTO public.sgrh_historial_laboral VALUES (1,1,null);
      CREATE TABLE public.sgrh_marcas_asistencia (
        mar_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        mar_historial_laboral_id int, mar_sucursal_id int, mar_tipo text,
        mar_fecha_hora timestamp, mar_latitud_marcada numeric, mar_longitud_marcada numeric,
        mar_distancia_geocerca_metros numeric, mar_metodo_verificacion text,
        mar_dispositivo_id text, mar_registrado_por_id int, mar_observacion text
      );
    `)
    const sql = readFileSync(
      resolve('supabase/migrations/20261106032247_kiosk_atomic_mark.sql'),
      'utf8'
    )
    await db.exec(sql)
    await db.exec(sql) // repeatable deployment
  }, 30_000)
  afterAll(async () => {
    await db?.close()
  })

  it('grants execution only to the server role', async () => {
    const r = await db.query<{ role: string; allowed: boolean }>(`
      select role, has_function_privilege(role, 'public.registrar_marca_kiosco_atomica(jsonb,jsonb,integer)', 'EXECUTE') allowed
      from (values ('anon'), ('authenticated'), ('service_role')) roles(role)
    `)
    expect(r.rows).toEqual([
      { role: 'anon', allowed: false },
      { role: 'authenticated', allowed: false },
      { role: 'service_role', allowed: true },
    ])
  })
  it('rejects another company without inserting', async () => {
    expect(await save(mark(), [], 2)).toBe('invalid_contract')
  })
  it('retries one operation without a duplicate and rejects changed content', async () => {
    expect(await save(mark())).toBe('inserted')
    expect(await save(mark())).toBe('duplicate')
    expect(await save(mark(operation, { mar_tipo: 'salida' }))).toBe('conflict')
    const r = await db.query<{ count: number }>(
      'select count(*)::int count from public.sgrh_marcas_asistencia'
    )
    expect(r.rows[0].count).toBe(1)
  })
  it('rejects the second writer using an obsolete journey snapshot', async () => {
    const another = '00000000-0000-4000-8000-000000000002'
    expect(await save(mark(another))).toBe('stale')
    expect(
      await save(mark(another, { mar_tipo: 'salida', mar_fecha_hora: '2026-11-05 17:00:00' }), [
        [1, 'entrada', '2026-11-05 08:00:00'],
      ])
    ).toBe('inserted')
  })
  it('detects edits as well as inserted rows in the snapshot', async () => {
    await db.exec(
      "update public.sgrh_marcas_asistencia set mar_tipo='inicio_receso' where mar_id=1"
    )
    expect(
      await save(mark('00000000-0000-4000-8000-000000000003'), [
        [1, 'entrada', '2026-11-05 08:00:00'],
        [2, 'salida', '2026-11-05 17:00:00'],
      ])
    ).toBe('stale')
  })
})
