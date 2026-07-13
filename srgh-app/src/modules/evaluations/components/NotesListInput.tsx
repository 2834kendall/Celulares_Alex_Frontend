'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

interface NotesListInputProps {
  label: string
  placeholder: string
  items: string[]
  disabled: boolean
  onChange: (items: string[]) => void
}

/** Lista dinamica de puntos: se escribe uno y con "+" se agregan mas. */
export function NotesListInput({
  label,
  placeholder,
  items,
  disabled,
  onChange,
}: NotesListInputProps) {
  const [draft, setDraft] = useState('')

  function addDraft() {
    const value = draft.trim()
    if (!value) return
    onChange([...items, value])
    setDraft('')
  }

  return (
    <div>
      <span className={LABEL_CLASSES}>{label}</span>
      {items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li
              key={`${item}-${i}`}
              className="flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-2.5 pr-1 text-[11px] font-medium text-slate-700"
            >
              {item}
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                aria-label={`Quitar ${item}`}
                className="rounded-full p-0.5 text-slate-400 outline-none transition hover:bg-slate-200 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-1.5">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              addDraft()
            }
          }}
          className={INPUT_CLASSES}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={addDraft}
          disabled={disabled || !draft.trim()}
          aria-label={`Agregar a ${label.toLowerCase()}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600 shadow-sm outline-none transition hover:border-blue-300 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
