import type { MarkType } from '@/modules/attendance/lib/marks'

const DB_NAME = 'sgrh-kiosco'
const DB_VERSION = 1
const STORE_NAME = 'marcas_pendientes'

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
