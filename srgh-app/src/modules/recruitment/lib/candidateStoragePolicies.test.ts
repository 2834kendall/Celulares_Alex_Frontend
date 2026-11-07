import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Executes the repository migration as a non-owner role. Fixtures replace Auth
// claim helpers only; PostgreSQL evaluates the actual USING/WITH CHECK policies.
describe('candidate storage RLS with two companies', () => {
  let db: PGlite
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE authenticated;
      CREATE SCHEMA storage;
      CREATE TABLE storage.objects (id int PRIMARY KEY, bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
      CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array($1, '/') $$;
      CREATE FUNCTION public.get_empresa_id() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT current_setting('test.company')::int $$;
      CREATE FUNCTION public.tiene_permiso(text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1 = ANY(string_to_array(current_setting('test.permissions'), ',')) $$;
      GRANT USAGE ON SCHEMA storage TO authenticated;
      GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
      INSERT INTO storage.objects VALUES (1, 'cv-candidatos', '1/candidatos/10/a.pdf'), (2, 'cv-candidatos', '2/candidatos/20/b.pdf'), (3, 'other-bucket', '1/private.pdf');
    `)
    await db.exec(
      readFileSync(
        resolve('supabase/migrations/20260921010000_storage_policies_candidatos.sql'),
        'utf8'
      )
    )
  }, 30000)
  afterAll(async () => {
    await db?.close()
  })

  async function asUser(company: number, permissions: string, sql: string) {
    await db.exec('BEGIN')
    try {
      await db.query(
        "SELECT set_config('test.company', $1, true), set_config('test.permissions', $2, true)",
        [String(company), permissions]
      )
      await db.exec('SET LOCAL ROLE authenticated')
      return await db.query(sql)
    } finally {
      await db.exec('ROLLBACK')
    }
  }

  it.each([1, 2])('reads only company %s CVs and excludes other buckets', async (company) => {
    const result = await asUser(
      company,
      'RECLUTAMIENTO_READ',
      'SELECT id FROM storage.objects ORDER BY id'
    )
    expect(result.rows).toEqual([{ id: company }])
  })
  it('does not grant CV access through employee document permission', async () => {
    expect((await asUser(1, 'DOCUMENTOS_READ', 'SELECT id FROM storage.objects')).rows).toEqual([])
  })
  it('allows an owned upload with write permission', async () => {
    const result = await asUser(
      1,
      'RECLUTAMIENTO_READ,RECLUTAMIENTO_WRITE',
      "INSERT INTO storage.objects VALUES (4, 'cv-candidatos', '1/candidatos/10/new.pdf') RETURNING id"
    )
    expect(result.rows).toEqual([{ id: 4 }])
  })
  it('blocks cross-company upload', async () => {
    await expect(
      asUser(
        1,
        'RECLUTAMIENTO_WRITE',
        "INSERT INTO storage.objects VALUES (4, 'cv-candidatos', '2/candidatos/20/new.pdf')"
      )
    ).rejects.toThrow(/row-level security/)
  })
  it('prevents moving an owned object into another company', async () => {
    await expect(
      asUser(
        1,
        'RECLUTAMIENTO_READ,RECLUTAMIENTO_WRITE',
        "UPDATE storage.objects SET name='2/candidatos/20/stolen.pdf' WHERE id=1"
      )
    ).rejects.toThrow(/row-level security/)
  })
  it('cannot delete another company document even with read and write permissions', async () => {
    expect(
      (
        await asUser(
          1,
          'RECLUTAMIENTO_READ,RECLUTAMIENTO_WRITE',
          'DELETE FROM storage.objects WHERE id=2 RETURNING id'
        )
      ).rows
    ).toEqual([])
    expect((await db.query('SELECT id FROM storage.objects ORDER BY id')).rows).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ])
  })
})
