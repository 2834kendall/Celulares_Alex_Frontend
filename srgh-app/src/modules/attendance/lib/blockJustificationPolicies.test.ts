import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPolicyDatabase, loadPolicy, queryAsUser } from '@/test/databasePolicies'

const manager = {
  empresa_id: 1,
  emp_id: null,
  sucursal_ids: [10, 20],
  permisos: ['ASISTENCIA_READ', 'AUSENCIAS_APPROVE', 'EMPLEADOS_READ'],
}

const select = 'SELECT jbl_historial_laboral_id FROM sgrh_justificaciones_bloque ORDER BY 1'
const insert = (company: number, history: number, branch: number) => `
  INSERT INTO sgrh_justificaciones_bloque
    (jbl_empresa_id, jbl_historial_laboral_id, jbl_sucursal_id,
     jbl_fecha, jbl_bloque, jbl_tipo_ausencia_id, jbl_fraccion_pagada)
  VALUES (${company}, ${history}, ${branch}, '2026-11-02', 2, 1, 0)
`

describe('second-block justification policies', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await createPolicyDatabase()
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE service_role;
      CREATE TABLE sgrh_empresas (org_id int PRIMARY KEY);
      CREATE TABLE sgrh_historial_laboral (
        lab_id int PRIMARY KEY, lab_empresa_id int, lab_empleado_id int
      );
      CREATE TABLE sgrh_cat_tipos_ausencia (tau_id int PRIMARY KEY);
      CREATE TABLE sgrh_usuarios (usr_id int PRIMARY KEY);
      INSERT INTO sgrh_empresas VALUES (1), (2);
      INSERT INTO sgrh_historial_laboral VALUES (1, 1, 100), (2, 1, 101), (3, 2, 200);
      INSERT INTO sgrh_cat_tipos_ausencia VALUES (1);
      ALTER TABLE sgrh_historial_laboral ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON sgrh_historial_laboral TO authenticated;
    `)
    await loadPolicy(db, '20260101000600_rls_policies.sql', 'historial_select')
    await db.exec(
      readFileSync('supabase/migrations/20261125120100_attendance_block_justifications.sql', 'utf8')
    )
    await db.exec([insert(1, 1, 10), insert(1, 2, 11), insert(2, 3, 20)].join(';'))
  }, 30_000)

  afterAll(async () => {
    await db?.close()
  })

  it('shows only the assigned branch in the same company', async () => {
    expect((await queryAsUser(db, manager, select)).rows).toEqual([{ jbl_historial_laboral_id: 1 }])
    expect(
      (await queryAsUser(db, { ...manager, permisos: ['AUSENCIAS_APPROVE'] }, select)).rows
    ).toEqual([])
  })

  it('allows insert in an assigned branch of the same company', async () => {
    await expect(
      queryAsUser(db, manager, insert(1, 1, 10).replace('11-02', '11-03'))
    ).resolves.toBeDefined()
  })

  it.each([
    [1, 1, 11],
    [2, 3, 20],
    [1, 3, 10],
    [2, 1, 10],
  ])(
    'rejects inserts for company %s, contract %s and branch %s outside scope',
    async (company, history, branch) => {
      await expect(queryAsUser(db, manager, insert(company, history, branch))).rejects.toThrow(
        /row-level security/
      )
    }
  )

  it('requires absence approval for writes and grants no updates', async () => {
    const reader = { ...manager, permisos: ['ASISTENCIA_READ', 'EMPLEADOS_READ'] }
    await expect(queryAsUser(db, reader, insert(1, 1, 10))).rejects.toThrow(/row-level security/)
    await expect(
      queryAsUser(db, manager, "UPDATE sgrh_justificaciones_bloque SET jbl_motivo = 'Cambio'")
    ).rejects.toThrow(/permission denied/)
    expect(
      (
        await queryAsUser(
          db,
          manager,
          'DELETE FROM sgrh_justificaciones_bloque RETURNING jbl_historial_laboral_id'
        )
      ).rows
    ).toEqual([{ jbl_historial_laboral_id: 1 }])
  })
})
