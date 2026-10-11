'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock'
import { useDialog } from '@/hooks/useDialog'
import { searchSettings, type LocatedLeaf } from '@/modules/settings/lib/sections'

interface SettingsSearchProps {
  /** Permisos del JWT: solo se buscan los ajustes que el usuario ve. */
  permisos: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Buscador de ajustes del modo configuración (SGRH-92). Lo monta el AppShell
 * una sola vez, solo mientras la ruta es /settings…: así Ctrl/⌘+K no se
 * intercepta en el resto de la app y no hay dos paletas cuando el drawer
 * móvil y el sidebar de escritorio están montados a la vez.
 */
export function SettingsSearch({ permisos, open, onOpenChange }: SettingsSearchProps) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        onOpenChange(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onOpenChange])

  if (!open) return null
  return <SearchPalette permisos={permisos} onClose={() => onOpenChange(false)} />
}

function SearchPalette({ permisos, onClose }: { permisos: string[]; onClose: () => void }) {
  useBodyScrollLock()
  const panelRef = useRef<HTMLDivElement>(null)
  // Tab atrapado y foco de vuelta al botón que abrió el buscador.
  useDialog(panelRef, onClose)

  const router = useRouter()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  const results = searchSettings(query, permisos)
  const active = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1)
  const optionId = (index: number) => `${listId}-${index}`

  function go(result: LocatedLeaf) {
    onClose()
    router.push(result.leaf.href)
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (results.length === 0) return
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActiveIndex((active + step + results.length) % results.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (active >= 0) go(results[active])
    } else if (event.key === 'Escape') {
      // Marcado como manejado: useDialog no lo procesa de nuevo (y su chequeo
      // de aria-expanded lo bloquearía, porque el combobox está expandido).
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 px-4 pt-[12vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Buscar ajuste"
        tabIndex={-1}
        className="animate-modal-in w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5 outline-none"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-slate-100 px-4">
          <Search className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <input
            // El buscador existe para escribir: acá sí conviene abrir el
            // teclado en el celular (useDialog respeta el autoFocus).
            autoFocus
            type="text"
            role="combobox"
            aria-label="Buscar ajuste"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? optionId(active) : undefined}
            placeholder="Buscar ajuste…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveIndex(0)
            }}
            onKeyDown={onKeyDown}
            className="min-h-12 w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />
          <kbd className="hidden shrink-0 rounded border border-slate-200 px-1.5 text-[10px] font-semibold text-slate-500 sm:inline">
            Esc
          </kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">
            No hay ajustes con ese nombre.
          </p>
        ) : (
          <ul
            id={listId}
            role="listbox"
            aria-label="Ajustes"
            className="max-h-80 overflow-y-auto p-2"
          >
            {results.map((result, index) => (
              <li
                key={result.leaf.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => go(result)}
                className={cn(
                  'flex cursor-pointer flex-col rounded-lg px-3 py-2',
                  index === active ? 'bg-brand-50' : 'hover:bg-slate-50'
                )}
              >
                <span className="text-sm font-semibold text-slate-900">{result.leaf.label}</span>
                <span className="text-xs text-slate-500">{result.path}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
