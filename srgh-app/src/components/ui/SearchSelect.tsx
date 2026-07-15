'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, Search } from 'lucide-react'

//Normaliza para comparar sin distinguir mayusculas ni tildes.
export function normalizeSearchText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export interface SearchSelectOption {
  value: string
  label: string
  sublabel?: string
}

interface SearchSelectProps {
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
}

// Combobox generico con filtro por texto sobre una lista de opciones.
export function SearchSelect({
  options,
  value,
  onChange,
  ariaLabel,
  className = 'w-56',
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const listboxId = useId()

  const selected = options.find((o) => o.value === value) ?? null

  const filtered = useMemo(() => {
    const q = normalizeSearchText(query.trim())
    if (!q) return options
    return options.filter(
      (o) =>
        normalizeSearchText(o.label).includes(q) ||
        (o.sublabel !== undefined && normalizeSearchText(o.sublabel).includes(q))
    )
  }, [options, query])

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

  function choose(optionValue: string) {
    onChange(optionValue)
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
      if (match) choose(match.value)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={containerRef} className={`relative max-w-full ${className}`}>
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel}
          value={open ? query : (selected?.label ?? '')}
          placeholder={selected?.label ?? ariaLabel}
          onChange={(e) => {
            setQuery(e.target.value)
            setHighlighted(0)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400"
        />
      </div>
      {open && (
        <div className="absolute right-0 z-20 mt-1.5 w-full min-w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-500">
              Sin resultados para &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto py-1">
              {filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => choose(o.value)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left outline-none transition ${
                      i === highlighted ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-slate-800">
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span className="block truncate text-[11px] text-slate-500">
                          {o.sublabel}
                        </span>
                      )}
                    </span>
                    {o.value === value && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600" />}
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
