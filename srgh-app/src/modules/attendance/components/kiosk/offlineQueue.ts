import type { MarkType } from '@/modules/attendance/lib/marks'

const DB_NAME = 'sgrh-kiosco'
// v2 agrega el almacen de descartadas (ver discardQueuedMark). El upgrade es
// aditivo: las marcas pendientes de una tablet en v1 sobreviven intactas.
const DB_VERSION = 2
const STORE_NAME = 'marcas_pendientes'
const DISCARDED_STORE_NAME = 'marcas_descartadas'

export interface QueuedMark {
  id: string
  employeeId: number
  tipo: MarkType
  /** "YYYY-MM-DD HH:mm:ss", capturada en el momento del evento — nunca la de sincronizacion. */
  fechaHora: string
  latitud: number | null
  longitud: number | null
  pin: string | null
  dispositivoId: string | null
}

/** Una marca que el servidor rechazo de forma definitiva, con el motivo. */
export interface DiscardedMark extends QueuedMark {
  motivo: string
  /** "YYYY-MM-DD HH:mm:ss" del descarte, para saber cuando dejo de intentarse. */
  descartadaEn: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no disponible en este navegador.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(DISCARDED_STORE_NAME)) {
        db.createObjectStore(DISCARDED_STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/** Guarda una marca localmente mientras no hay red. */
export async function queueOfflineMark(mark: QueuedMark): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(mark)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Todas las marcas pendientes de sincronizar, en el orden en que se guardaron. */
export async function getQueuedMarks(): Promise<QueuedMark[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as QueuedMark[])
    request.onerror = () => reject(request.error)
  })
}

/** Quita una marca de la cola una vez confirmada por el servidor. */
export async function removeQueuedMark(id: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Saca de la cola una marca que el servidor rechazo para siempre (no esta
 * programado ese dia, PIN incorrecto, contrato cerrado) y la archiva con el
 * motivo.
 *
 * Borrarla a secas seria perder el hecho de que alguien intento marcar; y
 * dejarla en la cola era lo que hacia el codigo anterior, que la reintentaba
 * cada 60 segundos para siempre sin drenar nunca. Archivada, el kiosco puede
 * avisar que hay marcas que exigen correccion manual del encargado.
 *
 * Las dos operaciones van en UNA transaccion sobre los dos almacenes: si el
 * archivado falla, la marca no se borra de la cola y se reintenta.
 */
export async function discardQueuedMark(mark: QueuedMark, motivo: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME, DISCARDED_STORE_NAME], 'readwrite')
    const discarded: DiscardedMark = {
      ...mark,
      motivo,
      descartadaEn: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }
    tx.objectStore(DISCARDED_STORE_NAME).put(discarded)
    tx.objectStore(STORE_NAME).delete(mark.id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/** Marcas descartadas, para avisar en el kiosco que hay que corregirlas a mano. */
export async function getDiscardedMarks(): Promise<DiscardedMark[]> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DISCARDED_STORE_NAME, 'readonly')
    const request = tx.objectStore(DISCARDED_STORE_NAME).getAll()
    request.onsuccess = () => resolve(request.result as DiscardedMark[])
    request.onerror = () => reject(request.error)
  })
}

/**
 * Vacia el archivo de descartadas. Es el acuse del encargado: "ya las
 * agregue a mano desde el panel". Mientras no se llame, el aviso del kiosco
 * sigue en pantalla — que es justamente lo que se quiere de un dispositivo
 * sin nadie mirandolo.
 */
export async function clearDiscardedMarks(): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DISCARDED_STORE_NAME, 'readwrite')
    tx.objectStore(DISCARDED_STORE_NAME).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}
