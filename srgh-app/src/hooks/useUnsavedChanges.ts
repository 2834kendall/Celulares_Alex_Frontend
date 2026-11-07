'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useUnsavedRegistry } from '@/components/ui/UnsavedChangesProvider'

/** Canonical comparison handles empty optional fields and native/custom inputs. */
export function changesSignature(value: unknown): string {
  if (value == null || value === '') return 'empty'
  if (typeof File !== 'undefined' && value instanceof File)
    return `file:${value.name}:${value.size}:${value.lastModified}`
  if (Array.isArray(value)) return `[${value.map(changesSignature).join(',')}]`
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object')
    return `{${Object.entries(value)
      .filter(([, v]) => v != null && v !== '')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${changesSignature(v)}`)
      .join(',')}}`
  return JSON.stringify(String(value))
}

export function useUnsavedChanges({
  label,
  value,
  busy = false,
  hasFiles = false,
  enabled = true,
  dirty: explicitDirty,
  onDiscard,
}: {
  label: string
  value?: unknown
  busy?: boolean
  hasFiles?: boolean
  enabled?: boolean
  dirty?: boolean
  onDiscard?: () => void
}) {
  const registry = useUnsavedRegistry()
  const id = useRef(Symbol(label))
  const root = useRef<HTMLElement | null>(null)
  const signature = changesSignature(value)
  const baseline = useRef(signature)
  const accepted = useRef<string | null>(null)
  const current = useRef({ signature, busy, label, hasFiles, enabled, explicitDirty, onDiscard })
  // Read in events only; a success can immediately clean the guard before navigation.
  useEffect(() => {
    current.current = { signature, busy, label, hasFiles, enabled, explicitDirty, onDiscard }
  })
  const acceptChanges = useCallback((nextValue?: unknown) => {
    baseline.current =
      nextValue === undefined ? current.current.signature : changesSignature(nextValue)
    accepted.current = baseline.current
    if (nextValue !== undefined) current.current.signature = baseline.current
    window.dispatchEvent(new Event('sgrh:unsaved-change'))
  }, [])
  const register = registry?.register
  useEffect(() => {
    const unregister = register?.(id.current, {
      read: () => {
        const state = current.current
        return {
          dirty:
            state.enabled &&
            (Boolean(state.explicitDirty) || state.signature !== baseline.current) &&
            state.signature !== accepted.current,
          busy: state.busy,
          label: state.label,
          hasFiles: state.hasFiles,
          root: root.current,
        }
      },
      accept: () => {
        current.current.onDiscard?.()
        acceptChanges()
      },
    })
    return () => {
      unregister?.()
      window.dispatchEvent(new Event('sgrh:unsaved-change'))
    }
  }, [register, acceptChanges])
  useEffect(() => {
    window.dispatchEvent(new Event('sgrh:unsaved-change'))
  }, [signature, busy, enabled, explicitDirty])
  const request = registry?.requestLeave
  const confirmLeave = useCallback(
    (action: () => void) => {
      if (request) request(action, { id: id.current })
      else action()
    },
    [request]
  )
  const bindRoot = useCallback((element: HTMLElement | null) => {
    root.current = element
  }, [])
  return { bindRoot, confirmLeave, acceptChanges }
}

export function useConfirmLeave() {
  const registry = useUnsavedRegistry()
  return useCallback(
    (action: () => void, root?: HTMLElement | null) => {
      if (registry) registry.requestLeave(action, { root })
      else action()
    },
    [registry]
  )
}
