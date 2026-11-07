import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

export default async function setup() {
  // Never accept a project ref, DB URL or arbitrary container from the caller.
  const container = 'supabase_db_sgrh105-e2e'
  const actual = execFileSync('docker', ['inspect', '--format', '{{.Name}}', container], {
    encoding: 'utf8',
  }).trim()
  if (actual !== `/${container}`) throw new Error('Unexpected test database container')
  execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    {
      input: readFileSync('tests/e2e/fixtures.sql'),
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  )
  const local = JSON.parse(
    readFileSync('.e2e/connection.json', 'utf8').replace(/^\uFEFF/, '')
  ) as Record<string, string>
  if (local.API_URL !== 'http://127.0.0.1:55421') throw new Error('Unexpected test API')
  const storage = createClient(
    local.API_URL,
    local.SECRET_KEY || local.SERVICE_ROLE_KEY
  ).storage.from('cv-candidatos')
  const prefix = '1051/candidatos/1051'
  const listed = await storage.list(prefix)
  if (listed.error) throw listed.error
  const paths = listed.data.map((file) => `${prefix}/${file.name}`)
  if (paths.length) {
    const removed = await storage.remove(paths)
    if (removed.error) throw removed.error
  }
}
