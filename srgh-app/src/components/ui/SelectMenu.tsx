'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { cn } from '@/lib/utils/cn'

export interface SelectMenuOption {
  value: string
  label: string
}

type SelectMenuSize = 'sm' | 'md'

const SIZES: Record<SelectMenuSize, Record<string, string>> = {
  /** Densidad de las barras de filtro sobre tablas (par de INPUT_SM). */
  sm: {
    field: 'rounded-xl px-3 py-1.5 text-xs',
    option: 'px-3 py-2 text-xs',
    check: 'h-3.5 w-3.5',
    chevron: 'h-3.5 w-3.5',
  },
  /** Campo de formulario (par de INPUT/SELECT). */
  md: {
    field: 'rounded-xl px-3 py-2 text-sm pointer-coarse:min-h-11',
    option: 'px-3 py-2 text-sm pointer-coarse:min-h-11',
    check: 'h-4 w-4',
    chevron: 'h-4 w-4',
  },
}

interface SelectMenuProps {
  options: SelectMenuOption[]
  value: string
  onChange: (value: string) => void
  id?: string
  /** Nombre accesible cuando no hay un <label htmlFor> apuntando al id. */
  ariaLabel?: string
  placeholder?: string
  disabled?: boolean
  invalid?: boolean
  size?: SelectMenuSize
  className?: string
  /**
   * Reemplaza POR COMPLETO las clases de color/borde/fondo del trigger (no se
   * mezcla con las del tamaño default). Para variantes con paleta propia —
   * hoy, el selector a. m./p. m. de TimeSelect— donde `cn()` no puede resolver
   * un conflicto de `bg-white` contra un fondo propio (ver la nota en
   * AppShell sobre por que este proyecto no usa un merge de clases con
   * prioridad).
   */
  triggerClassName?: string
}

/**
 * Ubica el listbox (portal a <body>, `position: fixed`) pegado al trigger.
 *
 * Portal porque, dibujado en su lugar, un contenedor con `overflow` lo
 * recortaba: dentro de un Modal (cuerpo con scroll) la lista de minutos de
 * TimeSelect quedaba cortada y habia que scrollear el modal para verla.
 * Medido a mano, mismo criterio que DatePickerButton:
 * - abre hacia arriba si abajo no entra y arriba hay mas lugar;
 * - se empuja para no salirse por los costados (un trigger angosto pegado
 *   al borde derecho, como el selector de sucursal del header, recortaba
 *   las opciones largas contra el borde de la ventana).
 */
function placeList(list: HTMLElement | null, trigger: HTMLElement | null) {
  if (!list || !trigger) return

  const margen = 8
  const separacion = 6
  const caja = trigger.getBoundingClientRect()
  const anchoVisible = document.documentElement.clientWidth
  const abajo = window.innerHeight - caja.bottom - margen - separacion
  const arriba = caja.top - margen - separacion

  list.style.minWidth = `${caja.width}px`
  list.style.maxHeight = ''
  const alto = list.offsetHeight
  const haciaArriba = alto > abajo && arriba > abajo
  const disponible = Math.max(haciaArriba ? arriba : abajo, 0)
  if (alto > disponible) list.style.maxHeight = `${disponible}px`
  const altoFinal = Math.min(alto, disponible)

  const left = Math.max(margen, Math.min(caja.left, anchoVisible - list.offsetWidth - margen))
  list.style.left = `${left}px`
  list.style.top = haciaArriba
    ? `${caja.top - separacion - altoFinal}px`
    : `${caja.bottom + separacion}px`
}
/**
 * Reemplazo del `<select>` nativo con la lista desplegada TAMBIEN estilizada.
 *
 * El campo cerrado de un select nativo ya se veia bien (token SELECT), pero la
 * lista abierta la dibuja el sistema operativo y no acepta CSS — en Windows es
 * el menu azul de sistema, ajeno al resto de la interfaz (styles.ts ya lo
 * documentaba). Este control dibuja su propia lista, con el mismo lenguaje
 * visual del combobox SearchSelect.
 *
 * El contrato hacia afuera es el del select: `value` y `onChange(value)` con
 * cadenas. Para formularios con React Hook Form esta `ControlledSelectMenu`,
 * que ademas repone las conversiones (`valueAsNumber`/`setValueAs`) que antes
 * vivian en `register`.
 */
export function SelectMenu({
  options,
  value,
  onChange,
  id,
  ariaLabel,
  placeholder = 'Seleccionar…',
  disabled = false,
  invalid = false,
  size = 'md',
  className,
  triggerClassName,
}: SelectMenuProps) {
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listboxId = useId()
  const typeahead = useRef<{ buffer: string; timer: ReturnType<typeof setTimeout> | null }>({
    buffer: '',
    timer: null,
  })
  const s = SIZES[size]

  const selected = options.find((o) => o.value === value) ?? null

  useLayoutEffect(() => {
    if (open) placeList(listRef.current, triggerRef.current)
  }, [open])

  // Si la pagina (o el modal) scrollea con la lista abierta, la lista sigue
  // al trigger en vez de quedar flotando donde estaba.
  useEffect(() => {
    if (!open) return
    function onScrollOrResize(e: Event) {
      if (e.target instanceof Node && listRef.current?.contains(e.target)) return
      placeList(listRef.current, triggerRef.current)
    }
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  function openMenu() {
    const index = options.findIndex((o) => o.value === value)
    setHighlighted(index >= 0 ? index : 0)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function choose(optionValue: string) {
    onChange(optionValue)
    close()
  }

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node
      // La lista vive en un portal: no es descendiente del contenedor.
      if (containerRef.current?.contains(target) || listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // La opcion resaltada sigue al teclado tambien fuera de la ventana visible.
  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, highlighted])

  /**
   * Escribir salta a la primera opcion cuyo texto empiece con lo tecleado,
   * como en un `<select>` nativo. Sin esto, la lista de minutos de
   * TimeSelect (60 opciones) solo se recorria con flechas o scroll. Tambien
   * compara sin el cero inicial, para que "8" encuentre "08".
   */
  function onTypeahead(key: string) {
    const t = typeahead.current
    if (t.timer) clearTimeout(t.timer)
    t.buffer += key.toLowerCase()
    t.timer = setTimeout(() => {
      t.buffer = ''
      t.timer = null
    }, 800)

    const buffer = t.buffer
    const index = options.findIndex((o) => {
      const label = o.label.toLowerCase()
      return label.startsWith(buffer) || label.replace(/^0+(?=\d)/, '').startsWith(buffer)
    })
    if (index < 0) return
    setHighlighted(index)
    setOpen(true)
  }

  useEffect(() => {
    const t = typeahead.current
    return () => {
      if (t.timer) clearTimeout(t.timer)
    }
  }, [])

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault()
      onTypeahead(e.key)
      return
    }

    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openMenu()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlighted((h) => Math.min(h + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlighted((h) => Math.max(h - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlighted(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlighted(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const match = options[highlighted]
      if (match) choose(match.value)
    } else if (e.key === 'Escape') {
      // preventDefault = "este Escape ya lo usé para cerrar la lista": el
      // Modal que contiene al select lo respeta y no se cierra también.
      e.preventDefault()
      setOpen(false)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-invalid={invalid || undefined}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={
          triggerClassName ??
          cn(
            'flex w-full items-center justify-between gap-2 border border-slate-200 bg-white text-left shadow-sm transition hover:border-slate-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400',
            s.field,
            invalid && 'border-rose-400 focus:ring-rose-400/20'
          )
        }
      >
        <span
          className={cn(
            // `min-w-0`: por default un hijo flex no encoge por debajo del
            // ancho de su contenido, asi que sin esto `truncate` nunca
            // llegaba a activarse dentro de un trigger con ancho acotado
            // (el selector de sucursal del header, por ejemplo).
            'min-w-0 truncate font-medium',
            triggerClassName ? undefined : selected ? 'text-slate-800' : 'text-slate-400'
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={cn('shrink-0 text-slate-400', s.chevron)} aria-hidden="true" />
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            // `w-max` (no `w-full`): el listbox se mide por su opcion mas larga,
            // no por el ancho del trigger — un trigger angosto ("Sucursal 11")
            // ya no recorta nombres mas largos ("Sucursal Metrocentro") a lo que
            // mide el propio boton. El ancho minimo (el del trigger) y la
            // posicion los pone placeList. z-60: por encima del Modal (z-50).
            className="animate-fade-in fixed top-0 left-0 z-60 max-h-64 w-max max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
          >
            {options.map((o, i) => (
              <li key={o.value} role="option" aria-selected={o.value === value} data-index={i}>
                <button
                  type="button"
                  tabIndex={-1}
                  // Sin esto el click le saca el foco al trigger (y dentro de un
                  // Modal lo mandaria fuera del panel) antes de elegir.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 text-left outline-none transition',
                    s.option,
                    i === highlighted && 'bg-brand-50'
                  )}
                >
                  <span className="truncate font-medium text-slate-800">{o.label}</span>
                  {o.value === value && (
                    <Check className={cn('shrink-0 text-brand-600', s.check)} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  )
}

interface ControlledSelectMenuProps<T extends FieldValues> extends Omit<
  SelectMenuProps,
  'value' | 'onChange'
> {
  control: Control<T>
  name: Path<T>
  /**
   * Reconstruye la conversion que antes hacia `register`: con el select nativo
   * el valor del DOM siempre es string y `valueAsNumber`/`setValueAs` lo
   * traducian al tipo del schema. Aca el trigger no es un input, asi que la
   * traduccion viaja explicita.
   */
  parse?: (value: string) => unknown
  /** Efecto lateral tras actualizar el formulario (p.ej. sugerir un email). */
  onValueChange?: (value: string) => void
}

/**
 * Puente entre React Hook Form y SelectMenu (mismo criterio que
 * ControlledDateField: `register()` exige un elemento nativo con evento
 * `change`, que este control ya no tiene).
 */
export function ControlledSelectMenu<T extends FieldValues>({
  control,
  name,
  parse,
  onValueChange,
  ...rest
}: ControlledSelectMenuProps<T>) {
  const {
    field: { value, onChange },
  } = useController({ name, control })

  return (
    <SelectMenu
      {...rest}
      value={value === null || value === undefined || Number.isNaN(value) ? '' : String(value)}
      onChange={(v) => {
        onChange(parse ? parse(v) : v)
        onValueChange?.(v)
      }}
    />
  )
}

/** '' → null, resto → Number. El par de `setValueAs: toOptionalNumber`. */
export function parseOptionalNumber(value: string): number | null {
  return value === '' ? null : Number(value)
}

/** El par de `register(..., { valueAsNumber: true })`. */
export function parseNumber(value: string): number {
  return value === '' ? NaN : Number(value)
}
