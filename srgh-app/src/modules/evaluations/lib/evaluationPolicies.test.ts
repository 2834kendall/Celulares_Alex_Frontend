import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPolicyDatabase, loadPolicy, queryAsUser } from '@/test/databasePolicies'

describe('evaluation note persistence under real RLS policies', () => {
  let db: PGlite
  const editor = {
    empresa_id: 1,
    usr_id: 99,
    emp_id: null,
    permisos: ['EVALUACIONES_READ', 'EVALUACIONES_WRITE'],
  }
  const update = (id: number) =>
    `UPDATE sgrh_evaluaciones SET eve_observaciones='updated' WHERE eve_id=${id} RETURNING eve_id`
  beforeAll(async () => {
    db = await createPolicyDatabase()
    await db.exec(`
      CREATE TABLE sgrh_historial_laboral (lab_id int PRIMARY KEY, lab_empresa_id int, lab_empleado_id int);
      CREATE TABLE sgrh_evaluaciones (eve_id int PRIMARY KEY, eve_empresa_id int, eve_evaluador_id int, eve_historial_laboral_id int REFERENCES sgrh_historial_laboral(lab_id), eve_observaciones text);
      INSERT INTO sgrh_historial_laboral VALUES (1,1,10),(2,2,20);
      INSERT INTO sgrh_evaluaciones VALUES (1,1,99,1,'original'),(2,2,200,2,'private'),(3,1,98,1,'other evaluator');
      ALTER TABLE sgrh_historial_laboral ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sgrh_evaluaciones ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON sgrh_historial_laboral TO authenticated;
      GRANT SELECT, UPDATE ON sgrh_evaluaciones TO authenticated;
    `)
    for (const policy of ['historial_select', 'evaluaciones_select', 'evaluaciones_update'])
      await loadPolicy(db, '20260101000600_rls_policies.sql', policy)
  }, 30000)
  afterAll(async () => {
    await db?.close()
  })
  it('returns the exact owned row when a permitted update takes effect', async () => {
    expect((await queryAsUser(db, editor, update(1))).rows).toEqual([{ eve_id: 1 }])
  })
  it.each([2, 999])('returns zero rows for foreign or missing evaluation %s', async (id) => {
    expect((await queryAsUser(db, editor, update(id))).rows).toEqual([])
    expect(
      (await db.query('SELECT eve_observaciones FROM sgrh_evaluaciones WHERE eve_id=2')).rows
    ).toEqual([{ eve_observaciones: 'private' }])
  })
  it('a write-only evaluator can confirm an owned update but cannot change an invisible evaluation', async () => {
    const writer = { ...editor, permisos: ['EVALUACIONES_WRITE'] }
    expect((await queryAsUser(db, writer, update(1))).rows).toEqual([{ eve_id: 1 }])
    expect((await queryAsUser(db, writer, update(3))).rows).toEqual([])
  })
  it('self-service reading does not authorize note changes', async () => {
    const employee = { empresa_id: 1, usr_id: 100, emp_id: 10, permisos: [] }
    expect(
      (await queryAsUser(db, employee, 'SELECT eve_id FROM sgrh_evaluaciones ORDER BY eve_id')).rows
    ).toEqual([{ eve_id: 1 }, { eve_id: 3 }])
    expect((await queryAsUser(db, employee, update(1))).rows).toEqual([])
  })
})
