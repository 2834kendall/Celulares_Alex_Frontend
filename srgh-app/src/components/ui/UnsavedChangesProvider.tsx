'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { FilePenLine } from 'lucide-react'
import { NavigationGuardProvider, useNavigationGuard } from 'nextjs-nav-guard'
import { toast } from 'sonner'
import { createPortal } from 'react-dom'
import { Button } from './Button'
import { useDialog } from '@/hooks/useDialog'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'

export interface UnsavedEntry {
  dirty: boolean
  busy: boolean
  label: string
  hasFiles: boolean
  root: HTMLElement | null
}
export interface UnsavedParticipant {
  read: () => UnsavedEntry
  accept: () => void
}
interface LeaveOptions {
  id?: symbol
  root?: HTMLElement | null
  cancel?: () => void
}
interface ChangesContext {
  register: (id: symbol, participant: UnsavedParticipant) => () => void
  requestLeave: (action: () => void, options?: LeaveOptions) => void
}
const Context = createContext<ChangesContext | null>(null)
export function useUnsavedRegistry() {
  return useContext(Context)
}

/** One decision per attempted departure; no field values leave their form. */
export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  return (
    <NavigationGuardProvider>
      <ChangesController>{children}</ChangesController>
    </NavigationGuardProvider>
  )
}

function ChangesController({ children }: { children: React.ReactNode }) {
  const participants = useRef(new Map<symbol, UnsavedParticipant>())
  const [pending, setPending] = useState<{
    action: () => void
    cancel?: () => void
    ids: symbol[]
    labels: string[]
    hasFiles: boolean
  } | null>(null)
  const pendingRef = useRef(false)
  const navigationDecision = useRef(false)
  const register = useCallback((id: symbol, participant: UnsavedParticipant) => {
    participants.current.set(id, participant)
    return () => {
      participants.current.delete(id)
    }
  }, [])
  const requestLeave = useCallback((action: () => void, options?: LeaveOptions) => {
    if (pendingRef.current) {
      options?.cancel?.()
      return
    }
    const affected = [...participants.current].filter(([id, p]) => {
      const state = p.read()
      return (
        state.dirty &&
        (!options?.id || options.id === id) &&
        (!options?.root || (state.root && options.root.contains(state.root)))
      )
    })
    if (!affected.length) {
      action()
      return
    }
    if (affected.some(([, p]) => p.read().busy)) {
      toast.info('El guardado está en curso. Esperá a que termine antes de salir.', {
        id: 'unsaved-saving',
      })
      options?.cancel?.()
      return
    }
    pendingRef.current = true
    setPending({
      action,
      cancel: options?.cancel,
      ids: affected.map(([id]) => id),
      labels: [...new Set(affected.map(([, p]) => p.read().label))],
      hasFiles: affected.some(([, p]) => p.read().hasFiles),
    })
  }, [])
  const navigationEnabled = useCallback(({ type, to }: { type: string; to?: string }) => {
    // Session revocation must remain effective even with an unfinished form.
    if (to && ['/login', '/access-denied'].includes(new URL(to, location.href).pathname))
      return false
    return (
      type !== 'refresh' &&
      type !== 'beforeunload' &&
      (navigationDecision.current || [...participants.current.values()].some((p) => p.read().dirty))
    )
  }, [])
  const confirmNavigation = useCallback(() => {
    navigationDecision.current = true
    return new Promise<boolean>((resolve) => {
      requestLeave(() => resolve(true), { cancel: () => resolve(false) })
    }).finally(() => {
      // Keep the adapter registered/enabled through its promise settlement.
      // Cleaning a form before the dialog unmounts must not reject an accepted trip.
      setTimeout(() => {
        navigationDecision.current = false
      }, 0)
    })
  }, [requestLeave])
  useNavigationGuard({ enabled: navigationEnabled, confirm: confirmNavigation })
  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (![...participants.current.values()].some((p) => p.read().dirty)) return
      event.preventDefault()
      event.returnValue = ''
    }
    // Only bind the browser listener while a participant actually has changes.
    // The hook notifies this provider through a lightweight custom event.
    function update() {
      window.removeEventListener('beforeunload', beforeUnload)
      if ([...participants.current.values()].some((p) => p.read().dirty))
        window.addEventListener('beforeunload', beforeUnload)
    }
    function linkClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const anchor =
        event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!anchor || anchor.download || (anchor.target && anchor.target !== '_self')) return
      const url = new URL(anchor.href, location.href)
      if (!['http:', 'https:'].includes(url.protocol)) return
      // The navigation adapter preserves App Router/back-forward semantics.
      // Only external anchors need this extra pre-departure decision.
      if (url.origin === location.origin) return
      if (![...participants.current.values()].some((p) => p.read().dirty)) return
      event.preventDefault()
      event.stopPropagation()
      requestLeave(() => location.assign(url.href))
    }
    window.addEventListener('sgrh:unsaved-change', update)
    document.addEventListener('click', linkClick, true)
    update()
    return () => {
      window.removeEventListener('sgrh:unsaved-change', update)
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', linkClick, true)
    }
  }, [requestLeave])
  function stay() {
    pending?.cancel?.()
    pendingRef.current = false
    setPending(null)
  }
  function leave() {
    const decision = pending
    if (!decision) return
    if (decision.ids.some((id) => participants.current.get(id)?.read().busy)) return
    decision.ids.forEach((id) => participants.current.get(id)?.accept())
    pendingRef.current = false
    setPending(null)
    decision.action()
  }
  return (
    <Context.Provider value={{ register, requestLeave }}>
      {children}
      {pending &&
        createPortal(
          <UnsavedChangesDialog
            labels={pending.labels}
            hasFiles={pending.hasFiles}
            onStay={stay}
            onLeave={leave}
          />,
          document.body
        )}
    </Context.Provider>
  )
}

function UnsavedChangesDialog({
  labels,
  hasFiles,
  onStay,
  onLeave,
}: {
  labels: string[]
  hasFiles: boolean
  onStay: () => void
  onLeave: () => void
}) {
  const panel = useRef<HTMLDivElement>(null)
  useBodyScrollLock()
  useDialog(panel, onStay)
  useEffect(() => {
    panel.current
      ?.querySelector<HTMLButtonElement>('[data-unsaved-stay]')
      ?.focus({ preventScroll: true })
  }, [])
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="unsaved-title"
      aria-describedby="unsaved-description"
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 px-4 py-6 backdrop-blur-[2px] sm:items-center"
      onClick={onStay}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl outline-none sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
          <FilePenLine className="h-5 w-5" aria-hidden="true" />
        </span>
        <h2 id="unsaved-title" className="text-lg font-bold tracking-tight text-slate-900">
          ¿Salir sin guardar?
        </h2>
        <div id="unsaved-description" className="mt-2 space-y-2 text-sm leading-6 text-slate-600">
          <p>
            Tenés cambios sin guardar en {labels.length === 1 ? labels[0] : 'varios formularios'}.
            Si salís, se perderán.
          </p>
          {hasFiles && (
            <p>Hay archivos sin guardar. Si salís, tendrás que seleccionarlos de nuevo.</p>
          )}
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            size="lg"
            className="min-h-11 sm:flex-1"
            data-unsaved-stay
            autoFocus
            onClick={onStay}
          >
            Seguir editando
          </Button>
          <Button size="lg" variant="secondary" className="min-h-11 sm:flex-1" onClick={onLeave}>
            Salir sin guardar
          </Button>
        </div>
      </div>
    </div>
  )
}
