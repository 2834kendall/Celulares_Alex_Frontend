'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'
import type { CollaboratorRow } from '@/modules/evaluations/types'
import { initialsOf } from '@/modules/evaluations/lib/scoring'

// Normaliza para comparar sin distinguir mayusculas ni tildes. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

interface CollaboratorSearchSelectProps {
  collaborators: CollaboratorRow[]
  selectedLabId: number
  onSelect: (labId: number) => void
}

/** Combobox con filtro por nombre o cedula para cambiar de colaborador. */
export function CollaboratorSearchSelect({
  collaborators,
  selectedLabId,
  onSelect,
}: CollaboratorSearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selected = collaborators.find((c) => c.labId === selectedLabId) ?? null

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return collaborators
    return collaborators.filter((c) => normalize(c.fullName).includes(q) || c.idNumber.includes(q))
  }, [collaborators, query])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function choose(labId: number) {
    onSelect(labId)
    setOpen(false)
    setQuery('')
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const match = filtered[highlighted]
      if (match) choose(match.labId)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className="relative w-64 max-w-full">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label="Buscar colaborador"
        value={open ? query : (selected?.fullName ?? '')}
        placeholder={selected?.fullName ?? 'Buscar colaborador…'}
        onChange={(e) => {
          setQuery(e.target.value)
          setHighlighted(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs font-medium text-slate-700 shadow-sm transition placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10"
      />
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              Sin resultados para &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {filtered.map((c, i) => (
                <li key={c.labId}>
                  <button
                    type="button"
                    onClick={() => choose(c.labId)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left outline-none transition ${
                      i === highlighted ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
                      {initialsOf(c.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-800">
                        {c.fullName}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {c.position ?? 'Sin puesto'} • {c.branchName}
                      </span>
                    </span>
                    {c.labId === selectedLabId && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
