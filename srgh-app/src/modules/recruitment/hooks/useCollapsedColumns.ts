'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'sgrh_recruitment_collapsed_columns'

/*
 * Qué columnas del tablero tiene contraídas ESTA persona en ESTE navegador.
 * Es una preferencia de vista, no un dato del proceso: por eso vive en
 * localStorage y no en la base (contraer una columna no debe cambiarle el
 * tablero a los demás).
 *
 * Se lee con useSyncExternalStore: el servidor no conoce localStorage, así
 * que el primer render sale con todo expandido y recién después se aplica
 * lo guardado — sin eso el HTML del servidor y el del navegador no coinciden.
 */

const listeners = new Set<() => void>()
// Copia en memoria: la fuente de verdad mientras la pestaña está abierta, y
// lo único que queda si el navegador bloquea localStorage (modo privado).
let current: string | null = null

function read(): string {
  if (current === null) {
    try {
      current = window.localStorage.getItem(STORAGE_KEY) ?? ''
    } catch {
      current = ''
    }
  }
  return current
}

function write(ids: number[]) {
  current = ids.join(',')
  try {
    window.localStorage.setItem(STORAGE_KEY, current)
  } catch {
    // Sin almacenamiento la preferencia dura lo que dure la pestaña.
  }
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  // Otra pestaña cambió la preferencia: se vuelve a leer.
  function onStorage(event: StorageEvent) {
    if (event.key !== STORAGE_KEY) return
    current = null
    listener()
  }
  // El primer tablero que se monta vuelve a leer lo guardado: la copia en
  // memoria solo vale mientras haya alguien mirándola.
  if (listeners.size === 0) current = null
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

function parse(raw: string): number[] {
  return raw
    .split(',')
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0)
}

export function useCollapsedColumns() {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  const collapsed = useMemo<ReadonlySet<number>>(() => new Set(parse(raw)), [raw])

  const toggle = useCallback((stageId: number) => {
    const ids = new Set(parse(read()))
    if (ids.has(stageId)) ids.delete(stageId)
    else ids.add(stageId)
    write([...ids])
  }, [])

  const collapse = useCallback((stageIds: number[]) => {
    write([...new Set([...parse(read()), ...stageIds])])
  }, [])

  const expand = useCallback((stageIds: number[]) => {
    const remove = new Set(stageIds)
    write(parse(read()).filter((id) => !remove.has(id)))
  }, [])

  return { collapsed, toggle, collapse, expand }
}
