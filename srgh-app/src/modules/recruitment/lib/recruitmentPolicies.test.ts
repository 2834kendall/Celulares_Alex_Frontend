import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPolicyDatabase, loadPolicy, queryAsUser } from '@/test/databasePolicies'

const tables = [
  {
    table: 'sgrh_candidatos',
    prefix: 'cdt',
    policy: 'candidatos',
    migration: '20260921000000_reclutamiento_contratacion.sql',
  },
  {
    table: 'sgrh_candidato_documentos',
    prefix: 'cdo',
    policy: 'candidato_documentos',
    migration: '20260921000000_reclutamiento_contratacion.sql',
  },
  {
    table: 'sgrh_postulaciones',
    prefix: 'pos',
    policy: 'postulaciones',
    migration: '20260101000600_rls_policies.sql',
  },
] as const

describe('recruitment relational RLS', () => {
  let db: PGlite
  const reader = { empresa_id: 1, permisos: ['RECLUTAMIENTO_READ'] }
  const writer = { empresa_id: 1, permisos: ['RECLUTAMIENTO_READ', 'RECLUTAMIENTO_WRITE'] }
  beforeAll(async () => {
    db = await createPolicyDatabase()
    await db.exec(`
      CREATE TABLE sgrh_candidatos (cdt_id int PRIMARY KEY, cdt_empresa_id int, label text);
      CREATE TABLE sgrh_candidato_documentos (cdo_id int PRIMARY KEY, cdo_empresa_id int, cdo_candidato_id int REFERENCES sgrh_candidatos(cdt_id), label text);
      CREATE TABLE sgrh_postulaciones (pos_id int PRIMARY KEY, pos_empresa_id int, pos_candidato_id int REFERENCES sgrh_candidatos(cdt_id), label text);
      INSERT INTO sgrh_candidatos VALUES (1,1,'owned'), (2,2,'foreign');
      INSERT INTO sgrh_candidato_documentos VALUES (1,1,1,'owned'), (2,2,2,'foreign');
      INSERT INTO sgrh_postulaciones VALUES (1,1,1,'owned'), (2,2,2,'foreign');
    `)
    for (const { table, policy, migration } of tables) {
      await db.exec(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO authenticated;`
      )
      for (const operation of ['select', 'insert', 'update', 'delete'])
        await loadPolicy(db, migration, `${policy}_${operation}`)
    }
  }, 30000)
  afterAll(async () => {
    await db?.close()
  })

  describe.each(tables)('$table', ({ table, prefix }) => {
    it('reads only the authenticated company', async () => {
      expect(
        (await queryAsUser(db, reader, `SELECT ${prefix}_id AS id FROM ${table}`)).rows
      ).toEqual([{ id: 1 }])
      expect(
        (
          await queryAsUser(
            db,
            { ...reader, empresa_id: 2 },
            `SELECT ${prefix}_id AS id FROM ${table}`
          )
        ).rows
      ).toEqual([{ id: 2 }])
    })
    it('does not grant recruitment access through employee read permission', async () => {
      expect(
        (
          await queryAsUser(
            db,
            { ...reader, permisos: ['EMPLEADOS_READ'] },
            `SELECT * FROM ${table}`
          )
        ).rows
      ).toEqual([])
    })
    it('read-only access cannot update or delete an owned row', async () => {
      expect(
        (
          await queryAsUser(
            db,
            reader,
            `UPDATE ${table} SET label='changed' WHERE ${prefix}_id=1 RETURNING label`
          )
        ).rows
      ).toEqual([])
      expect(
        (await queryAsUser(db, reader, `DELETE FROM ${table} WHERE ${prefix}_id=1 RETURNING label`))
          .rows
      ).toEqual([])
    })
    it('writer cannot move an owned row to a foreign company', async () => {
      await expect(
        queryAsUser(db, writer, `UPDATE ${table} SET ${prefix}_empresa_id=2 WHERE ${prefix}_id=1`)
      ).rejects.toThrow(/row-level security/)
    })
    it('writer cannot update or delete a foreign row', async () => {
      expect(
        (
          await queryAsUser(
            db,
            writer,
            `UPDATE ${table} SET label='changed' WHERE ${prefix}_id=2 RETURNING label`
          )
        ).rows
      ).toEqual([])
      expect(
        (await queryAsUser(db, writer, `DELETE FROM ${table} WHERE ${prefix}_id=2 RETURNING label`))
          .rows
      ).toEqual([])
      expect((await db.query(`SELECT label FROM ${table} WHERE ${prefix}_id=2`)).rows).toEqual([
        { label: 'foreign' },
      ])
    })
    it('writer can update an owned row', async () => {
      expect(
        (
          await queryAsUser(
            db,
            writer,
            `UPDATE ${table} SET label='changed' WHERE ${prefix}_id=1 RETURNING label`
          )
        ).rows
      ).toEqual([{ label: 'changed' }])
    })

    const insert = (company: number) =>
      prefix === 'cdt'
        ? `INSERT INTO ${table} (${prefix}_id, ${prefix}_empresa_id, label) VALUES (9,${company},'new') RETURNING ${prefix}_id AS id`
        : `INSERT INTO ${table} (${prefix}_id, ${prefix}_empresa_id, ${prefix}_candidato_id, label) VALUES (9,${company},1,'new') RETURNING ${prefix}_id AS id`

    it('read permission alone cannot insert an owned row', async () => {
      await expect(queryAsUser(db, reader, insert(1))).rejects.toThrow(/row-level security/)
    })
    it('writer can insert an owned row but cannot insert under another company', async () => {
      expect((await queryAsUser(db, writer, insert(1))).rows).toEqual([{ id: 9 }])
      await expect(queryAsUser(db, writer, insert(2))).rejects.toThrow(/row-level security/)
    })
  })
  it('foreign candidate join cannot expose documents or applications', async () => {
    expect(
      (
        await queryAsUser(
          db,
          reader,
          'SELECT c.cdt_id FROM sgrh_candidatos c JOIN sgrh_candidato_documentos d ON d.cdo_candidato_id=c.cdt_id JOIN sgrh_postulaciones p ON p.pos_candidato_id=c.cdt_id WHERE c.cdt_id=2'
        )
      ).rows
    ).toEqual([])
  })
})
