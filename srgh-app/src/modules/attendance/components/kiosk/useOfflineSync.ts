'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { registerKioskMark } from '@/modules/attendance/actions/registerKioskMark'
import { nowInCostaRica } from '@/modules/attendance/lib/time'
import type { KioskMarkInput } from '@/modules/attendance/types'
import {
  getQueuedMarks,
  queueOfflineMark,
  removeQueuedMark,
} from '@/modules/attendance/components/kiosk/offlineQueue'

const BASE_BACKOFF_MS = 5000
const MAX_BACKOFF_MS = 60000

export type SubmitMarkOutcome =
  { queued: true } | { queued: false; result: Awaited<ReturnType<typeof registerKioskMark>> }

/**
 * Cola local (IndexedDB) + sincronizacion con reintentos cuando la tablet
 * pierde la conexion. Dos caminos distintos a la cola:
 * (a) offline detectado de antemano (navigator.onLine) — no se intenta la
 *     llamada de red, se guarda directo;
 * (b) el navegador cree que hay red pero la llamada falla igual (fetch
 *     lanza) — se cae a la cola tambien. Un rechazo del SERVIDOR (ok:false,
 *     ej. "PIN incorrecto") no es un problema de red: se surge normal, no se
 *     encola, porque encolarlo solo pospondria un error que ya conocemos.
 */
export function useOfflineSync() {
  // SIEMPRE arranca en true, tanto en el servidor como en el primer render
  // del cliente — nunca se lee navigator.onLine aca. Node 21+ ya expone un
  // navigator global propio (sin onLine real), asi que el viejo chequeo
  // `typeof navigator === 'undefined'` dejo de proteger nada: en el servidor
  // navigator.onLine daba `undefined` (falsy), la SSR renderizaba "offline",
  // y el cliente (con navigator.onLine real) renderizaba "online" — mismatch
  // de hidratacion en CADA carga de /kiosco. El valor real se corrige recien
  // en el efecto de abajo (deferido, ver nota del initialLoad).
  const [isOnline, setIsOnline] = useState(true)
  const [pendingCount, setPendingCount] = useState(0)
  const backoffRef = useRef(BASE_BACKOFF_MS)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)
  // Referencia a la version mas reciente de attemptSync: el reintento con
  // backoff se llama a si mismo desde un setTimeout, y auto-referenciar el
  // useCallback por su nombre antes de terminar de declararse dispara
  // react-hooks/immutability. Llamar via ref.current evita esa referencia
  // circular sin perder la version actualizada de la funcion.
  const attemptSyncRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const refreshPendingCount = useCallback(async () => {
    const marks = await getQueuedMarks()
    setPendingCount(marks.length)
    return marks
  }, [])

  const attemptSync = useCallback(async () => {
    if (syncingRef.current) return
    syncingRef.current = true

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    try {
      const marks = await refreshPendingCount()
      let allSynced = true

      for (const mark of marks) {
        const result = await registerKioskMark({
          employeeId: mark.employeeId,
          tipo: mark.tipo,
          latitud: mark.latitud,
          longitud: mark.longitud,
          pin: mark.pin,
          dispositivoId: mark.dispositivoId,
        })

        if (result.ok) {
          await removeQueuedMark(mark.id)
        } else {
          allSynced = false
        }
      }

      const remaining = await refreshPendingCount()

      if (allSynced || remaining.length === 0) {
        backoffRef.current = BASE_BACKOFF_MS
      } else {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
        timeoutRef.current = setTimeout(() => {
          void attemptSyncRef.current()
        }, backoffRef.current)
      }
    } catch {
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
      timeoutRef.current = setTimeout(() => {
        void attemptSyncRef.current()
      }, backoffRef.current)
    } finally {
      syncingRef.current = false
    }
  }, [refreshPendingCount])

  useEffect(() => {
    attemptSyncRef.current = attemptSync
  }, [attemptSync])

  useEffect(() => {
    // setTimeout(0, ...) en vez de invocar refreshPendingCount()/setIsOnline
    // directo: el linter marca como sospechoso llamar, dentro del cuerpo del
    // efecto, a cualquier funcion que termine en un setState — incluso si es
    // async y el setState ocurre despues de un await. Diferirlo vía un
    // callback real (igual que el timeout de la pantalla de exito) lo deja
    // conforme. De paso, corrige aca el valor real de isOnline (ver el
    // useState de arriba: siempre arranca en true para no romper la
    // hidratacion) — recien el cliente conoce navigator.onLine de verdad.
    const initialLoad = setTimeout(() => {
      setIsOnline(navigator.onLine)
      void refreshPendingCount()
    }, 0)

    function handleOnline() {
      setIsOnline(true)
      void attemptSyncRef.current()
    }

    function handleOffline() {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearTimeout(initialLoad)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [refreshPendingCount])

  const submitMark = useCallback(
    async (input: KioskMarkInput): Promise<SubmitMarkOutcome> => {
      const queueNow = async () => {
        await queueOfflineMark({
          id: crypto.randomUUID(),
          employeeId: input.employeeId,
          tipo: input.tipo,
          fechaHora: nowInCostaRica(),
          latitud: input.latitud,
          longitud: input.longitud,
          pin: input.pin,
          dispositivoId: input.dispositivoId,
        })
        await refreshPendingCount()
      }

      if (!isOnline) {
        await queueNow()
        return { queued: true }
      }

      try {
        const result = await registerKioskMark(input)
        return { queued: false, result }
      } catch {
        await queueNow()
        return { queued: true }
      }
    },
    [isOnline, refreshPendingCount]
  )

  return { isOnline, pendingCount, submitMark }
}
