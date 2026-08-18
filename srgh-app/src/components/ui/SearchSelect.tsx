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
  /** Adorno opcional a la izquierda de la opcion (avatar, iniciales, icono). */
  avatar?: React.ReactNode
  /** Texto extra por el que tambien se puede buscar (cedula, codigo). */
  searchTerms?: string
}

interface SearchSelectProps {
  options: SearchSelectOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  className?: string
  /**
   * `sm` (por defecto) es la densidad de las barras de filtro del admin, que
   * se opera con mouse. `lg` es para superficies tactiles vistas a distancia
   * —hoy el kiosco—: mismo componente y mismo comportamiento, pero con texto
   * legible de lejos y filas que superan los 44px de WCAG 2.5.5.
   */
  size?: SearchSelectSize
}

type SearchSelectSize = 'sm' | 'lg'

const SIZES: Record<SearchSelectSize, Record<string, string>> = {
  sm: {
    field: 'gap-2 rounded-xl px-3 py-2',
    icon: 'h-3.5 w-3.5',
    input: 'text-xs',
    menu: 'mt-1.5 min-w-56 rounded-xl',
    list: 'max-h-64',
    option: 'gap-2.5 px-3 py-2',
    label: 'text-xs',
    sublabel: 'text-[11px]',
    check: 'h-3.5 w-3.5',
    empty: 'px-3 py-4 text-xs',
  },
  lg: {
    field: 'gap-3 rounded-2xl px-4 py-3.5 min-h-14',
    icon: 'h-5 w-5',
    input: 'text-lg',
    menu: 'mt-2 min-w-full rounded-2xl',
    list: 'max-h-[19rem]',
    option: 'gap-3 px-4 py-3.5 min-h-14',
    label: 'text-base',
    sublabel: 'text-sm',
    check: 'h-5 w-5',
    empty: 'px-4 py-6 text-sm',
  },
}

// Combobox generico con filtro por texto sobre una lista de opciones.
export function SearchSelect({
  options,
  value,
  onChange,
  ariaLabel,
  className = 'w-56',
  size = 'sm',
}: SearchSelectProps) {
  const s = SIZES[size]
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
        (o.sublabel !== undefined && normalizeSearchText(o.sublabel).includes(q)) ||
        (o.searchTerms !== undefined && normalizeSearchText(o.searchTerms).includes(q))
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
      <div
        className={`flex items-center border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/10 pointer-coarse:min-h-11 ${s.field}`}
      >
        <Search className={`shrink-0 text-slate-400 ${s.icon}`} />
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
          className={`min-w-0 flex-1 bg-transparent font-medium text-slate-700 outline-none placeholder:text-slate-400 ${s.input}`}
        />
      </div>
      {open && (
        <div
          className={`absolute right-0 z-20 w-full max-w-[calc(100vw-2rem)] overflow-hidden border border-slate-200 bg-white shadow-lg ${s.menu}`}
        >
          {filtered.length === 0 ? (
            <p className={`text-center text-slate-500 ${s.empty}`}>
              Sin resultados para &ldquo;{query.trim()}&rdquo;
            </p>
          ) : (
            <ul id={listboxId} role="listbox" className={`overflow-y-auto py-1 ${s.list}`}>
              {filtered.map((o, i) => (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => choose(o.value)}
                    onMouseEnter={() => setHighlighted(i)}
                    className={`flex w-full items-center text-left outline-none transition ${s.option} ${
                      i === highlighted ? 'bg-brand-50' : ''
                    }`}
                  >
                    {o.avatar}
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate font-semibold text-slate-800 ${s.label}`}>
                        {o.label}
                      </span>
                      {o.sublabel && (
                        <span className={`block truncate text-slate-500 ${s.sublabel}`}>
                          {o.sublabel}
                        </span>
                      )}
                    </span>
                    {o.value === value && (
                      <Check className={`shrink-0 text-brand-600 ${s.check}`} />
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
