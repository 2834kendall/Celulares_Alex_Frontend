import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPolicyDatabase, loadPolicy, queryAsUser } from '@/test/databasePolicies'

describe('attendance policies with actual JWT helpers and branch restrictions', () => {
  let db: PGlite
  const manager = {
    empresa_id: 1,
    emp_id: null,
    sucursal_ids: [10],
    permisos: ['ASISTENCIA_READ', 'ASISTENCIA_WRITE', 'EMPLEADOS_READ'],
  }
  beforeAll(async () => {
    db = await createPolicyDatabase()
    await db.exec(`
      CREATE TABLE sgrh_historial_laboral (lab_id int PRIMARY KEY, lab_empresa_id int, lab_empleado_id int, lab_sucursal_id int);
      CREATE TABLE sgrh_marcas_asistencia (mar_id int PRIMARY KEY, mar_historial_laboral_id int REFERENCES sgrh_historial_laboral(lab_id), mar_sucursal_id int, mar_tipo text);
      INSERT INTO sgrh_historial_laboral VALUES (1,1,100,10), (2,1,101,11), (3,2,200,20);
      INSERT INTO sgrh_marcas_asistencia VALUES (1,1,10,'entrada'), (2,2,11,'entrada'), (3,3,20,'entrada');
      ALTER TABLE sgrh_historial_laboral ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sgrh_marcas_asistencia ENABLE ROW LEVEL SECURITY;
      GRANT SELECT ON sgrh_historial_laboral TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON sgrh_marcas_asistencia TO authenticated;
    `)
    for (const policy of [
      'historial_select',
      'marcas_select',
      'marcas_insert',
      'marcas_update',
      'marcas_delete',
    ]) {
      await loadPolicy(db, '20260101000600_rls_policies.sql', policy)
    }
  }, 30000)
  afterAll(async () => {
    await db?.close()
  })

  it('manager sees marks only in assigned branches', async () => {
    expect(
      (await queryAsUser(db, manager, 'SELECT mar_id FROM sgrh_marcas_asistencia ORDER BY mar_id'))
        .rows
    ).toEqual([{ mar_id: 1 }])
  })
  it('company-wide access still excludes another company', async () => {
    expect(
      (
        await queryAsUser(
          db,
          { ...manager, sucursal_ids: null },
          'SELECT mar_id FROM sgrh_marcas_asistencia ORDER BY mar_id'
        )
      ).rows
    ).toEqual([{ mar_id: 1 }, { mar_id: 2 }])
  })
  it('multiple assigned branches are visible but a foreign branch in the JWT is not', async () => {
    expect(
      (
        await queryAsUser(
          db,
          { ...manager, sucursal_ids: [10, 11, 20] },
          'SELECT mar_id FROM sgrh_marcas_asistencia ORDER BY mar_id'
        )
      ).rows
    ).toEqual([{ mar_id: 1 }, { mar_id: 2 }])
  })
  it('an employee without administrative permission sees only own contract marks', async () => {
    expect(
      (
        await queryAsUser(
          db,
          { empresa_id: 1, emp_id: 100, sucursal_ids: null, permisos: [] },
          'SELECT mar_id FROM sgrh_marcas_asistencia'
        )
      ).rows
    ).toEqual([{ mar_id: 1 }])
  })
  it('kiosk permission alone does not expose attendance tables directly', async () => {
    expect(
      (
        await queryAsUser(
          db,
          { ...manager, permisos: ['ASISTENCIA_KIOSCO'] },
          'SELECT mar_id FROM sgrh_marcas_asistencia'
        )
      ).rows
    ).toEqual([])
  })
  it('manager can insert for an owned contract in a visible branch', async () => {
    expect(
      (
        await queryAsUser(
          db,
          manager,
          "INSERT INTO sgrh_marcas_asistencia VALUES (4,1,10,'salida') RETURNING mar_id"
        )
      ).rows
    ).toEqual([{ mar_id: 4 }])
  })
  it.each(["(4,3,10,'salida')", "(4,1,20,'salida')", "(4,2,11,'salida')"])(
    'rejects foreign contracts or unassigned branches on insert %s',
    async (row) => {
      await expect(
        queryAsUser(db, manager, `INSERT INTO sgrh_marcas_asistencia VALUES ${row}`)
      ).rejects.toThrow(/row-level security/)
    }
  )
  it('cannot move an existing mark to an invisible branch', async () => {
    await expect(
      queryAsUser(
        db,
        manager,
        'UPDATE sgrh_marcas_asistencia SET mar_sucursal_id=20 WHERE mar_id=1'
      )
    ).rejects.toThrow(/row-level security/)
  })
  it('cannot update or delete invisible marks and leaves their persisted contents intact', async () => {
    expect(
      (
        await queryAsUser(
          db,
          manager,
          "UPDATE sgrh_marcas_asistencia SET mar_tipo='salida' WHERE mar_id=3 RETURNING mar_id"
        )
      ).rows
    ).toEqual([])
    expect(
      (
        await queryAsUser(
          db,
          manager,
          'DELETE FROM sgrh_marcas_asistencia WHERE mar_id=2 RETURNING mar_id'
        )
      ).rows
    ).toEqual([])
    expect(
      (await db.query('SELECT mar_id, mar_tipo FROM sgrh_marcas_asistencia ORDER BY mar_id')).rows
    ).toEqual([1, 2, 3].map((mar_id) => ({ mar_id, mar_tipo: 'entrada' })))
  })
})
