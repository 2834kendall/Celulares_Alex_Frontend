import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// A distinct project and ports keep this stack apart from ordinary local dev.
const destination = resolve('.e2e/supabase')
mkdirSync(destination, { recursive: true })
for (const folder of ['migrations', 'seeds', 'templates']) {
  cpSync(resolve('supabase', folder), resolve(destination, folder), { recursive: true })
}
const config = readFileSync('supabase/config.toml', 'utf8')
  .replace('project_id = "srgh-app"', 'project_id = "sgrh105-e2e"')
  .replace(/543(\d{2})/g, '554$1')
  .replaceAll('127.0.0.1:3000', '127.0.0.1:3105')
if (!config.includes('project_id = "sgrh105-e2e"')) {
  throw new Error('Source config changed: refusing to prepare an unexpected project ID')
}
writeFileSync(resolve(destination, 'config.toml'), config)
console.log('Prepared isolated sgrh105-e2e stack on API port 55421.')
