#!/usr/bin/env node
/**
 * Diagnostico PREVIO a aplicar el baseline sobre una base que ya tiene datos.
 *
 *   pnpm supabase:diagnose
 *
 * Es 100% de LECTURA: no aplica migraciones, no toca datos, no crea nada.
 * Corre contra el proyecto vinculado (`supabase link`).
 *
 * Responde tres preguntas que las migraciones NO responden solas, porque
 * fallan en silencio en vez de con error:
 *
 *   1. Que se puede ROMPER      la seccion 1 del archivo de RLS habilita RLS en
 *                               TODA tabla sgrh_*. Una tabla sin policies queda
 *                               deny-all y su modulo deja de leer.
 *   2. Que va a DIVERGIR        CREATE TABLE IF NOT EXISTS no hace nada si la
 *                               tabla existe con otra forma, y los seeds usan
 *                               ON CONFLICT DO NOTHING: si un id ya esta
 *                               ocupado, la fila vieja gana y nadie avisa.
 *   3. Que hay que REVOCAR      el seed de permisos solo AGREGA. Un grant puesto
 *                               a mano sobrevive para siempre, asi que leer el
 *                               repo no te dice los permisos efectivos.
 *
 * La verdad esperada NO esta duplicada aca: se parsea de supabase/migrations y
 * supabase/seeds, para que el diagnostico no pueda quedar desincronizado.
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = join(appRoot, 'supabase/migrations')
const seedsDir = join(appRoot, 'supabase/seeds')

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// ── Consultar el proyecto vinculado ────────────────────────────────────────
// El SQL va por archivo y no como argumento: en Windows hay que lanzar npx a
// traves del shell (npx.cmd no es un ejecutable), y pasar SQL con comillas por
// linea de comandos ahi es una fuente seguraisima de errores.
const tmp = mkdtempSync(join(tmpdir(), 'sgrh-diag-'))
process.on('exit', () => rmSync(tmp, { recursive: true, force: true }))

function query(sql) {
  const f = join(tmp, 'q.sql')
  writeFileSync(f, sql, 'utf8')
  let out
  try {
    out = execSync(`npx supabase db query --linked -f "${f}"`, {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    })
  } catch (err) {
    console.error('\nNo se pudo consultar el proyecto vinculado.')
    console.error('Verifica que corriste `pnpm supabase:link` y que tenes sesion (`pnpm supabase:login`).\n')
    console.error(String(err.stdout || err.stderr || err.message).slice(0, 600))
    process.exit(1)
  }
  // El CLI envuelve el resultado en {boundary, rows, warning} y agrega ruido
  // alrededor; recortamos hasta el ultimo '}' para quedarnos con el objeto.
  const start = out.indexOf('{')
  let parsed = null
  if (start !== -1) {
    try {
      parsed = JSON.parse(out.slice(start, out.lastIndexOf('}') + 1))
    } catch {
      parsed = null
    }
  }

  // Sin esto el fallo aparece mucho mas tarde como un TypeError opaco
  // ("Cannot read properties of undefined") en el primer .rows[0] del reporte.
  if (!parsed || !Array.isArray(parsed.rows)) {
    console.error('\nEl CLI de Supabase no devolvio un resultado interpretable.')
    console.error('El comando no fallo (exit 0), pero su stdout no traia el JSON esperado.')
    console.error('')
    console.error('Causa tipica: es la PRIMERA corrida despues de `supabase link` y el CLI')
    console.error('pide algo por stdin, que este script deliberadamente no le da. Corre una')
    console.error('vez el comando a mano y volve a intentar. Este es de solo lectura:')
    console.error('')
    console.error('  npx supabase migration list --linked')
    console.error('')
    console.error('--- stdout crudo ---')
    console.error(out.trim().slice(0, 600) || '(vacio)')
    process.exit(1)
  }
  return parsed.rows
}

// ── Lo que el repo declara ─────────────────────────────────────────────────

/** Tablas y columnas segun los CREATE TABLE del baseline. */
function tablasDelRepo() {
  const tablas = new Map()
  for (const f of readdirSync(migrationsDir).sort()) {
    const sql = read(join(migrationsDir, f))
    const re = /CREATE TABLE IF NOT EXISTS public\.(sgrh_[a-z_0-9]+) \(([\s\S]*?)\n\);/g
    let m
    while ((m = re.exec(sql)) !== null) {
      const cols = new Set()
      let depth = 0
      for (const raw of m[2].split('\n')) {
        const line = raw.trim()
        const atTop = depth === 0
        depth += (raw.match(/\(/g) || []).length - (raw.match(/\)/g) || []).length
        if (!atTop || !line || line.startsWith('--') || /^CONSTRAINT\b/i.test(line)) continue
        const name = line.split(/\s+/)[0].replace(/[,()]/g, '')
        if (/^[a-z][a-z0-9_]*$/.test(name)) cols.add(name)
      }
      tablas.set(m[1], cols)
    }
  }
  return tablas
}

/**
 * Filas de catalogo con id EXPLICITO. Son las unicas con riesgo de colision:
 * las que dejan que la secuencia asigne el id no pueden chocar.
 */
function catalogosConIdDelRepo() {
  const filas = [] // { tabla, id, codigo }
  for (const dir of ['01_sistema', '02_catalogos']) {
    const d = join(seedsDir, dir)
    if (!existsSync(d)) continue
    for (const f of readdirSync(d).sort()) {
      let tabla = null
      for (const raw of read(join(d, f)).split('\n')) {
        const line = raw.trim()
        if (line.startsWith('--')) continue
        const ins = line.match(/INSERT INTO public\.(sgrh_[a-z_0-9]+)/)
        if (ins) tabla = ins[1]
        if (!tabla) continue
        // (<id>, '<codigo o nombre unico>', ...
        const row = line.match(/^\((\d+),\s*'((?:[^']|'')*)'/)
        if (row) filas.push({ tabla, id: Number(row[1]), codigo: row[2].replace(/''/g, "'") })
      }
    }
  }
  return filas
}

/** Matriz rol -> permiso declarada en el seed. */
function matrizDelRepo() {
  const f = join(seedsDir, '01_sistema/03_rol_permisos.sql')
  if (!existsSync(f)) return new Set()
  const set = new Set()
  for (const m of read(f).matchAll(/\('([A-Z_]+)',\s*'([A-Z_]+)'\)/g)) set.add(`${m[1]}|${m[2]}`)
  return set
}

// ── Reporte ────────────────────────────────────────────────────────────────
let riesgos = 0
let divergencias = 0
const titulo = (t) => console.log(`\n${'='.repeat(72)}\n${t}\n${'='.repeat(72)}`)
const ok = (t) => console.log(`  OK   ${t}`)
const alerta = (t) => { console.log(`  !!   ${t}`); riesgos++ }
const nota = (t) => { console.log(`  ~    ${t}`); divergencias++ }

console.log('\nDiagnostico del proyecto vinculado (solo lectura)')

// ── 1. Ledger ──────────────────────────────────────────────────────────────
titulo('1. LEDGER DE MIGRACIONES')
const localVersions = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.split('_')[0])
  .sort()

const tieneLedger = query(
  "select count(*)::int as n from information_schema.tables where table_schema='supabase_migrations' and table_name='schema_migrations'"
)[0].n

if (!tieneLedger) {
  ok('El destino no tiene ledger: el push aplicara las 9 migraciones desde cero.')
} else {
  const remotas = query('select version from supabase_migrations.schema_migrations order by version').map(
    (r) => String(r.version)
  )
  const soloRemotas = remotas.filter((v) => !localVersions.includes(v))
  const soloLocales = localVersions.filter((v) => !remotas.includes(v))
  console.log(`  Registradas en el destino: ${remotas.length} | en el repo: ${localVersions.length}`)
  if (soloRemotas.length) {
    alerta(`El destino registra ${soloRemotas.length} migracion(es) que el repo ya no tiene:`)
    soloRemotas.forEach((v) => console.log(`         ${v}`))
    console.log('         -> `db push` se va a negar. Hay que repararlas como `reverted`,')
    console.log('            y marcar las del baseline como `applied` SOLO si los objetos ya existen.')
  }
  if (soloLocales.length && !soloRemotas.length) ok(`${soloLocales.length} migracion(es) pendientes de aplicar.`)
  if (!soloRemotas.length && !soloLocales.length) ok('Ledger sincronizado.')
}

// ── 2. Esquema ─────────────────────────────────────────────────────────────
titulo('2. ESQUEMA: LO QUE `CREATE TABLE IF NOT EXISTS` NO VA A ARREGLAR')
const repoTablas = tablasDelRepo()
const destinoCols = query(
  "select table_name, column_name from information_schema.columns where table_schema='public' and table_name like 'sgrh%'"
)
const destinoTablas = new Map()
for (const r of destinoCols) {
  if (!destinoTablas.has(r.table_name)) destinoTablas.set(r.table_name, new Set())
  destinoTablas.get(r.table_name).add(r.column_name)
}

if (destinoTablas.size === 0) {
  ok('El destino no tiene tablas sgrh_*: nada que divergir.')
} else {
  const ajenas = [...destinoTablas.keys()].filter((t) => !repoTablas.has(t))
  if (ajenas.length) {
    alerta(`${ajenas.length} tabla(s) sgrh_* en el destino que el baseline NO conoce:`)
    ajenas.forEach((t) => console.log(`         ${t}`))
    console.log('         -> el baseline no las crea, pero SI les va a habilitar RLS (ver seccion 3).')
  }
  let conDiferencias = 0
  for (const [t, cols] of [...repoTablas].sort()) {
    const dest = destinoTablas.get(t)
    if (!dest) continue // no existe: la migracion la va a crear bien
    const faltan = [...cols].filter((c) => !dest.has(c))
    const sobran = [...dest].filter((c) => !cols.has(c))
    if (faltan.length || sobran.length) {
      conDiferencias++
      nota(`${t}`)
      if (faltan.length) console.log(`         faltan en el destino: ${faltan.join(', ')}`)
      if (sobran.length) console.log(`         sobran en el destino: ${sobran.join(', ')}`)
    }
  }
  if (conDiferencias) {
    console.log('\n         -> CREATE TABLE IF NOT EXISTS NO agrega columnas a una tabla que ya')
    console.log('            existe. Estas diferencias sobreviven al push y quedan invisibles.')
    console.log('            Hay que resolverlas a mano con ALTER TABLE antes de aplicar.')
  } else if (!ajenas.length) {
    ok('Todas las tablas del baseline que ya existen tienen exactamente las mismas columnas.')
  }
}

// ── 3. RLS ─────────────────────────────────────────────────────────────────
titulo('3. RLS: QUE SE PUEDE ROMPER AL HABILITARLA')
const rls = query(`
  select c.relname as tabla,
         c.relrowsecurity as rls_activa,
         (select count(*)::int from pg_policies p
           where p.schemaname='public' and p.tablename=c.relname) as policies
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and c.relname like 'sgrh%'
  order by c.relname`)

if (!rls.length) {
  ok('No hay tablas sgrh_* en el destino.')
} else {
  const peligrosas = rls.filter((r) => r.policies === 0)
  if (peligrosas.length) {
    alerta(`${peligrosas.length} tabla(s) quedarian DENY-ALL (RLS activa y CERO policies):`)
    peligrosas.forEach((r) =>
      console.log(`         ${r.tabla}${r.rls_activa ? ' (ya esta asi)' : '  <-- la rompe el push'}`)
    )
    console.log('         -> el baseline habilita RLS en TODA tabla sgrh_*. Si una no tiene')
    console.log('            policies, su modulo deja de leer. Escribir sus policies ANTES.')
  } else {
    ok(`Las ${rls.length} tablas sgrh_* tienen al menos una policy.`)
  }
}

// ── 4. Catalogos con id explicito ──────────────────────────────────────────
titulo('4. CATALOGOS: COLISIONES DE ID')
const esperados = catalogosConIdDelRepo()
const porTabla = new Map()
for (const f of esperados) {
  if (!porTabla.has(f.tabla)) porTabla.set(f.tabla, [])
  porTabla.get(f.tabla).push(f)
}

let colisiones = 0
for (const [tabla, filas] of [...porTabla].sort()) {
  if (!destinoTablas.has(tabla)) continue
  const cols = [...destinoTablas.get(tabla)]
  const idCol = cols.find((c) => /_id$/.test(c))
  const codCol = cols.find((c) => /_codigo$/.test(c)) || cols.find((c) => /_nombre$/.test(c))
  if (!idCol || !codCol) continue

  const actuales = query(`select ${idCol} as id, ${codCol} as codigo from public.${tabla}`)
  const porId = new Map(actuales.map((r) => [Number(r.id), String(r.codigo)]))
  const porCodigo = new Map(actuales.map((r) => [String(r.codigo), Number(r.id)]))

  for (const e of filas) {
    const enEseId = porId.get(e.id)
    const idDelCodigo = porCodigo.get(e.codigo)
    if (enEseId !== undefined && enEseId !== e.codigo) {
      colisiones++
      nota(`${tabla}: el id ${e.id} deberia ser '${e.codigo}' pero el destino tiene '${enEseId}'`)
    } else if (idDelCodigo !== undefined && idDelCodigo !== e.id) {
      colisiones++
      nota(`${tabla}: '${e.codigo}' existe con id ${idDelCodigo}, el repo lo declara con id ${e.id}`)
    }
  }
  // Filas que el destino tiene y el repo ya no declara (p. ej. SUPERADMIN).
  const codigosRepo = new Set(filas.map((f) => f.codigo))
  const sobrantes = actuales.map((r) => String(r.codigo)).filter((c) => !codigosRepo.has(c))
  if (sobrantes.length) {
    colisiones++
    nota(`${tabla}: el destino tiene ${sobrantes.length} fila(s) que el repo ya no declara: ${sobrantes.join(', ')}`)
    console.log('         -> los seeds NUNCA borran. Si sobran a proposito, retirarlas a mano.')
  }
}
if (!colisiones) ok('Ningun id declarado choca con el destino.')
else console.log('\n         -> ON CONFLICT DO NOTHING deja ganar a la fila vieja, sin error.')

// ── 5. Permisos efectivos ──────────────────────────────────────────────────
titulo('5. PERMISOS: LO QUE EL SEED NO PUEDE REVOCAR')
const declarada = matrizDelRepo()
if (!destinoTablas.has('sgrh_rol_permisos')) {
  ok('El destino no tiene la matriz todavia.')
} else {
  const efectiva = query(`
    select r.rol_codigo as rol, p.per_codigo as permiso
    from public.sgrh_rol_permisos rp
    join public.sgrh_cat_roles r on r.rol_id = rp.rpe_rol_id
    join public.sgrh_cat_permisos p on p.per_id = rp.rpe_permiso_id`)

  const enDestino = new Set(efectiva.map((r) => `${r.rol}|${r.permiso}`))
  const soloDestino = [...enDestino].filter((k) => !declarada.has(k))
  const soloRepo = [...declarada].filter((k) => !enDestino.has(k))

  console.log(`  Declarados en el repo: ${declarada.size} | efectivos en el destino: ${enDestino.size}`)
  if (soloDestino.length) {
    alerta(`${soloDestino.length} grant(s) vivos en el destino que el repo NO declara:`)
    for (const k of soloDestino.sort()) console.log(`         ${k.replace('|', ' -> ')}`)
    console.log('         -> el seed solo AGREGA. Estos sobreviven al push y hay que')
    console.log('            revocarlos a mano si ya no corresponden.')
  }
  if (soloRepo.length) {
    nota(`${soloRepo.length} grant(s) del repo que faltan en el destino (el seed los va a agregar).`)
  }
  if (!soloDestino.length && !soloRepo.length) ok('La matriz efectiva coincide exactamente con el repo.')
}

// ── Cierre ─────────────────────────────────────────────────────────────────
titulo('RESUMEN')
if (!riesgos && !divergencias) {
  console.log('  Sin riesgos ni divergencias: se puede aplicar el baseline.')
} else {
  if (riesgos) console.log(`  ${riesgos} riesgo(s) de ROTURA  (!!) — resolver ANTES de aplicar.`)
  if (divergencias) console.log(`  ${divergencias} divergencia(s) silenciosa(s) (~) — el push no las va a arreglar.`)
  console.log('\n  Ninguna se resuelve sola: las migraciones no borran datos, pero tampoco')
  console.log('  fuerzan el destino al estado del repo.')
}
console.log('')
process.exit(riesgos ? 1 : 0)
