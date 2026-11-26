'use client'

import { useEffect } from 'react'

export function useWakeLock() {
  useEffect(() => {
    if (!navigator.wakeLock?.request) return

    let current: WakeLockSentinel | null = null
    let pending = false
    let retryOnVisible = false
    let disposed = false

    async function release(lock: WakeLockSentinel | null) {
      try {
        if (lock && !lock.released) await lock.release()
      } catch {
        // El navegador puede haberlo liberado al ocultar la página.
      }
    }

    async function request() {
      if (pending || disposed || (current && !current.released)) return
      pending = true
      try {
        const lock = await navigator.wakeLock.request('screen')
        if (disposed || document.visibilityState !== 'visible') await release(lock)
        else current = lock
      } catch {
        // El modo de ahorro de batería puede impedir que se mantenga encendida.
      } finally {
        pending = false
        if (retryOnVisible) {
          retryOnVisible = false
          if (document.visibilityState === 'visible') void request()
        }
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        // Una solicitud iniciada antes de ocultar la página puede fallar al volver.
        if (pending) retryOnVisible = true
        else void request()
      } else {
        const lock = current
        current = null
        void release(lock)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    onVisibilityChange()
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      void release(current)
    }
  }, [])
}
