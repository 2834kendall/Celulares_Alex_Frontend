'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { registerKioskMark } from '@/modules/attendance/actions/registerKioskMark'
import { nowInCostaRica } from '@/modules/attendance/lib/time'
import type { KioskMarkInput } from '@/modules/attendance/types'
import {
  discardQueuedMark,
  getDiscardedMarks,
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
  // Marcas que el servidor rechazo para siempre. No se reintentan: quedan
  // archivadas y el kiosco las anuncia para que el encargado las corrija a
  // mano desde el panel diario.
  const [discardedCount, setDiscardedCount] = useState(0)
  const backoffRef = useRef(BASE_BACKOFF_MS)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const syncingRef = useRef(false)
  const mounted = useRef(true)
  // Referencia a la version mas reciente de attemptSync: el reintento con
  // backoff se llama a si mismo desde un setTimeout, y auto-referenciar el
  // useCallback por su nombre antes de terminar de declararse dispara
  // react-hooks/immutability. Llamar via ref.current evita esa referencia
  // circular sin perder la version actualizada de la funcion.
  const attemptSyncRef = useRef<() => Promise<void>>(() => Promise.resolve())

  const refreshPendingCount = useCallback(async () => {
    const marks = await getQueuedMarks()
    if (mounted.current) setPendingCount(marks.length)
    return marks
  }, [])

  const refreshDiscardedCount = useCallback(async () => {
    const marks = await getDiscardedMarks()
    if (mounted.current) setDiscardedCount(marks.length)
  }, [])

  const attemptSync = useCallback(async () => {
    if (syncingRef.current || !mounted.current) return
    syncingRef.current = true

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    try {
      if (!navigator.onLine) return
      const marks = await refreshPendingCount()
      let allSynced = true
      const blockedEmployees = new Set<number>()

      for (const mark of marks) {
        if (!mounted.current || !navigator.onLine) {
          allSynced = false
          break
        }
        if (blockedEmployees.has(mark.employeeId)) continue
        let result: Awaited<ReturnType<typeof registerKioskMark>>
        try {
          result = await registerKioskMark({
            operationId: mark.id,
            sincronizada: true,
            employeeId: mark.employeeId,
            tipo: mark.tipo,
            latitud: mark.latitud,
            longitud: mark.longitud,
            ticketFacial: mark.ticketFacial,
            dispositivoId: mark.dispositivoId,
            // La hora capturada al encolar, no la de este intento de envio: es
            // lo que distingue "marco a las 8:00 y no habia red" de "marco a
            // las 14:00". Sin esto la marca diferida nace como tardanza falsa.
            fechaHora: mark.fechaHora,
          })
        } catch {
          blockedEmployees.add(mark.employeeId)
          allSynced = false
          continue
        }

        if (result.ok) {
          await removeQueuedMark(mark.id)
          continue
        }

        // Un rechazo definitivo no mejora esperando: reintentarlo es un
        // bucle infinito que ademas impide que la cola drene las marcas
        // que si son validas. Se archiva con el motivo y se saca de en
        // medio (ver discardQueuedMark).
        if (result.definitivo) {
          await discardQueuedMark(mark, result.error)
          await refreshDiscardedCount()
          continue
        }

        allSynced = false
        blockedEmployees.add(mark.employeeId)
      }

      const remaining = await refreshPendingCount()

      if (allSynced || remaining.length === 0) {
        backoffRef.current = BASE_BACKOFF_MS
      } else if (mounted.current) {
        backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
        timeoutRef.current = setTimeout(() => {
          void attemptSyncRef.current()
        }, backoffRef.current)
      }
    } catch {
      if (!mounted.current) return
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS)
      timeoutRef.current = setTimeout(() => {
        void attemptSyncRef.current()
      }, backoffRef.current)
    } finally {
      syncingRef.current = false
    }
  }, [refreshPendingCount, refreshDiscardedCount])

  useEffect(() => {
    attemptSyncRef.current = attemptSync
  }, [attemptSync])

  useEffect(() => {
    mounted.current = true
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
      void refreshDiscardedCount()
      if (navigator.onLine) void attemptSyncRef.current()
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
      mounted.current = false
      clearTimeout(initialLoad)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [refreshPendingCount, refreshDiscardedCount])

  const submitMark = useCallback(
    async (input: KioskMarkInput): Promise<SubmitMarkOutcome> => {
      // Allocate once BEFORE the first request; preserve it if its response is lost.
      const operationId = input.operationId ?? crypto.randomUUID()
      const fechaHora = input.fechaHora ?? nowInCostaRica()
      const request = { ...input, operationId, fechaHora }
      const queuedAt = Date.now()
      const queueNow = async () => {
        await queueOfflineMark({
          id: operationId,
          employeeId: input.employeeId,
          tipo: input.tipo,
          fechaHora,
          queuedAt,
          latitud: input.latitud,
          longitud: input.longitud,
          ticketFacial: input.ticketFacial,
          dispositivoId: input.dispositivoId,
        })
        await refreshPendingCount()
        if (navigator.onLine) void attemptSyncRef.current()
      }

      if (!isOnline) {
        await queueNow()
        return { queued: true }
      }

      try {
        // Do not overtake an older event belonging to the same employee.
        if ((await getQueuedMarks()).some((m) => m.employeeId === input.employeeId)) {
          await queueNow()
          return { queued: true }
        }
        const result = await registerKioskMark(request)
        return { queued: false, result }
      } catch {
        await queueNow()
        return { queued: true }
      }
    },
    [isOnline, refreshPendingCount]
  )

  return { isOnline, pendingCount, discardedCount, submitMark }
}
