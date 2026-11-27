// Lectura del Excel subido en un proceso de Node aparte, con tope de memoria
// y de tiempo.
//
// ExcelJS 4.4.0 tiene vulnerabilidades públicas sin versión corregida: un
// .xlsx armado a propósito puede hacer que la lectura consuma toda la memoria
// o se quede trabada, y con eso tumbar el servidor entero. revisarZipXlsx ya
// frena el caso típico (un zip chico que se infla a gigas); esto cubre el
// resto. Si el proceso pasa del tope de memoria o del tiempo, se mata solo ese
// proceso y la subida responde con un error; el servidor sigue funcionando.
//
// Es un proceso y no un hilo (worker_threads) a propósito: el tope de memoria
// de un hilo se ignora si el servidor arranca con --max-old-space-size en
// NODE_OPTIONS (comprobado con Node 22), y ahí un Excel armado podía volver a
// llevarse toda la memoria. Un proceso aparte lleva su propio tope.
//
// El código del proceso va en línea (node -e) también a propósito: un archivo
// aparte depende de cómo el bundler de Next empaquete el servidor, y podía
// funcionar en `pnpm dev` y no encontrarse en el build. ExcelJS se carga desde
// node_modules del proyecto, igual que lo carga el resto del servidor.

import 'server-only'
import { spawn } from 'node:child_process'
import type { RawCell } from './planilla'

/** Celda ya resuelta: número, texto, o null si está vacía. */
export type CeldaPlana = string | number | null

export interface HojaPlana {
  nombre: string
  /** filas[f - 1][c - 1]: la celda de la fila f y la columna c (base 1, como Excel). */
  filas: CeldaPlana[][]
  /** Columnas de la hoja según Excel (ws.columnCount). */
  columnas: number
}

export type LecturaExcel =
  | { ok: true; hojas: HojaPlana[] }
  | { ok: false; motivo: 'invalido' | 'muy_grande' | 'tiempo' | 'memoria' }

/**
 * Tope de memoria del proceso. Leer una plantilla real de 500 personas usa
 * unos 20 MB; el archivo más grande que deja pasar revisarZipXlsx, unos 120.
 */
export const MEMORIA_MAXIMA_MB = 256
/** Tope de tiempo. Una plantilla real se lee en menos de un segundo. */
export const TIEMPO_MAXIMO_MS = 20_000
/** Ninguna planilla real se acerca: es lo que se copia de vuelta al servidor. */
export const MAX_FILAS = 5_000
export const MAX_COLUMNAS = 300

/** Tope de lo que el proceso puede devolver. Una planilla real son unos KB. */
const MAX_SALIDA_BYTES = 64 * 1024 * 1024

/**
 * Código del proceso. JavaScript plano (no pasa por TypeScript ni por el
 * bundler). Lee el archivo por stdin y escribe el resultado en JSON por
 * stdout. Resuelve cada celda igual que lo hacía cellValue antes de que la
 * lectura se moviera acá: fórmulas a su resultado, texto enriquecido a texto.
 * El apóstrofo de seguridad se quita con la misma expresión que usa
 * planillaExcel.ts, que llega como argumento para no tener dos copias.
 */
const CODIGO_DEL_PROCESO = `
const { createRequire } = require('node:module')
const path = require('node:path')

const config = JSON.parse(process.argv[1])
const requerir = createRequire(path.join(process.cwd(), 'package.json'))
const ExcelJS = requerir('exceljs')
const inicioDeFormula = new RegExp(config.inicioDeFormula)

function sinApostrofo(texto) {
  return texto.startsWith("'") && inicioDeFormula.test(texto.slice(1)) ? texto.slice(1) : texto
}

function valorDe(cell) {
  const value = cell.value
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return value
  if (typeof value === 'string') return sinApostrofo(value)
  if (typeof value === 'object') {
    if ('result' in value && (typeof value.result === 'number' || typeof value.result === 'string')) {
      return value.result
    }
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('text' in value && typeof value.text === 'string') return value.text
  }
  return String(value)
}

async function leer(buffer) {
  const wb = new ExcelJS.Workbook()
  try {
    await wb.xlsx.load(buffer)
  } catch {
    return { ok: false, motivo: 'invalido' }
  }
  const hojas = []
  for (const ws of wb.worksheets) {
    const filas = ws.rowCount
    const columnas = ws.columnCount
    if (filas > config.maxFilas || columnas > config.maxColumnas) {
      return { ok: false, motivo: 'muy_grande' }
    }
    const datos = []
    for (let f = 1; f <= filas; f += 1) {
      const row = ws.getRow(f)
      const fila = []
      for (let c = 1; c <= columnas; c += 1) fila.push(valorDe(row.getCell(c)))
      datos.push(fila)
    }
    hojas.push({ nombre: ws.name, filas: datos, columnas })
  }
  return { ok: true, hojas }
}

const partes = []
process.stdin.on('data', (d) => partes.push(d))
process.stdin.on('end', () => {
  leer(Buffer.concat(partes)).then(
    (resultado) => process.stdout.write(JSON.stringify(resultado)),
    () => process.stdout.write(JSON.stringify({ ok: false, motivo: 'invalido' }))
  )
})
`

/**
 * Variables de entorno del proceso, sin NODE_OPTIONS. El tope de memoria no
 * depende de esto (el argumento --max-old-space-size le gana al que venga en
 * NODE_OPTIONS), pero ahí pueden venir otras opciones del servidor, como
 * módulos precargados con --require, que el proceso de lectura no necesita.
 */
function entornoDelProceso(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  return env
}

/**
 * Lee el .xlsx en un proceso aparte. Nunca lanza: cualquier fallo del proceso
 * se devuelve como { ok: false } con el motivo.
 */
export function leerExcelAislado(
  buffer: ArrayBuffer,
  inicioDeFormula: RegExp,
  limites: { memoriaMb?: number; tiempoMs?: number } = {}
): Promise<LecturaExcel> {
  const memoriaMb = limites.memoriaMb ?? MEMORIA_MAXIMA_MB
  const tiempoMs = limites.tiempoMs ?? TIEMPO_MAXIMO_MS
  const config = JSON.stringify({
    inicioDeFormula: inicioDeFormula.source,
    maxFilas: MAX_FILAS,
    maxColumnas: MAX_COLUMNAS,
  })

  return new Promise((resolve) => {
    let terminado = false
    let porTiempo = false
    let salidaBytes = 0
    const salida: Buffer[] = []
    let errores = ''

    const terminar = (resultado: LecturaExcel) => {
      if (terminado) return
      terminado = true
      clearTimeout(reloj)
      if (proceso.exitCode === null && proceso.signalCode === null) proceso.kill('SIGKILL')
      resolve(resultado)
    }

    const proceso = spawn(
      process.execPath,
      [`--max-old-space-size=${memoriaMb}`, '-e', CODIGO_DEL_PROCESO, config],
      { env: entornoDelProceso(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
    )

    const reloj = setTimeout(() => {
      porTiempo = true
      terminar({ ok: false, motivo: 'tiempo' })
    }, tiempoMs)

    proceso.stdout.on('data', (d: Buffer) => {
      salidaBytes += d.length
      if (salidaBytes > MAX_SALIDA_BYTES) {
        terminar({ ok: false, motivo: 'muy_grande' })
        return
      }
      salida.push(d)
    })
    proceso.stderr.on('data', (d: Buffer) => {
      // Solo el principio: alcanza para saber si fue falta de memoria.
      if (errores.length < 4096) errores += d.toString()
    })
    proceso.on('error', (error) => {
      // No se pudo arrancar el proceso: es un problema del servidor, no del archivo.
      console.error('leerExcelAislado: no se pudo iniciar la lectura', error)
      terminar({ ok: false, motivo: 'invalido' })
    })
    proceso.on('close', (codigo) => {
      if (porTiempo) return
      if (/heap out of memory|allocation failed/i.test(errores)) {
        terminar({ ok: false, motivo: 'memoria' })
        return
      }
      if (codigo !== 0) {
        console.error('leerExcelAislado: la lectura terminó con error', codigo, errores)
        terminar({ ok: false, motivo: 'invalido' })
        return
      }
      try {
        terminar(JSON.parse(Buffer.concat(salida).toString('utf8')) as LecturaExcel)
      } catch {
        terminar({ ok: false, motivo: 'invalido' })
      }
    })

    // Un EPIPE si el proceso ya murió (por ejemplo, por falta de memoria) se
    // resuelve en 'close'; acá solo se evita que tumbe al servidor.
    proceso.stdin.on('error', () => {})
    proceso.stdin.end(Buffer.from(buffer))
  })
}

/** Hoja plana con la misma forma de acceso que se usaba con ExcelJS. */
export class HojaLeida {
  constructor(private readonly hoja: HojaPlana) {}

  get nombre(): string {
    return this.hoja.nombre
  }

  get rowCount(): number {
    return this.hoja.filas.length
  }

  get columnCount(): number {
    return this.hoja.columnas
  }

  /** Celda en base 1, como Excel. Fuera de la hoja = vacía. */
  celda(fila: number, columna: number): RawCell {
    return this.hoja.filas[fila - 1]?.[columna - 1] ?? null
  }

  /** Celdas con valor en una fila (lo que ExcelJS llama actualCellCount). */
  celdasConValor(fila: number): number {
    return (this.hoja.filas[fila - 1] ?? []).filter((v) => v !== null && v !== '').length
  }
}
