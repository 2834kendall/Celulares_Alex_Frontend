'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'

interface DatePickerButtonProps {
  /** Fecha seleccionada, "YYYY-MM-DD". */
  value: string
  onChange: (dateISO: string) => void
  /** "YYYY-MM-DD" del dia de hoy. Se pasa desde afuera porque "hoy" depende de
   *  la zona horaria del negocio, no de la del navegador (ver lib/time.ts). */
  todayISO?: string
  disabled?: boolean
  label?: string
}

/**
 * Selector de fecha con calendario propio.
 *
 * Reemplaza al `<input type="date">`: su calendario lo dibuja el navegador
 * fuera del DOM y NO se puede estilizar — ni tipografia, ni colores, ni
 * bordes. Cambia de aspecto entre Chrome, Firefox y Safari, y no se parecia
 * en nada al resto del sistema.
 *
 * Se trabaja siempre con cadenas "YYYY-MM-DD" y con `new Date(y, m, d)` (que
 * es local por construccion). Nunca se parsea una fecha desde string: eso es
 * lo que mete corrimientos de un dia segun la zona horaria.
 */

const DIAS = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sa']

function partes(dateISO: string) {
  const [y, m, d] = dateISO.split('-').map(Number)
  return { y, m: m - 1, d }
}

function aISO(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** "sábado 15 de agosto de 2026" — nombre accesible de cada dia. */
function etiquetaLarga(y: number, m: number, d: number) {
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'full' }).format(new Date(y, m, d))
}

function nombreMes(y: number, m: number) {
  const etiqueta = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1)
  )
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)
}

export function DatePickerButton({
  value,
  onChange,
  todayISO,
  disabled = false,
  label = 'Elegir fecha',
}: DatePickerButtonProps) {
  const [abierto, setAbierto] = useState(false)
  const [cursor, setCursor] = useState(value)
  const contenedorRef = useRef<HTMLDivElement>(null)
  const botonRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)

  // Al abrir, el calendario arranca en el mes de la fecha seleccionada —
  // aunque el usuario haya navegado a otro mes y cerrado sin elegir. Se hace
  // en el handler y no en un efecto: sincronizar estado con estado dentro de
  // un useEffect provoca un render de mas y el linter lo marca con razon.
  function alternar() {
    const siguiente = !abierto
    if (siguiente) setCursor(value)
    setAbierto(siguiente)
  }

  useEffect(() => {
    if (!abierto) return

    function alTocarFuera(evento: MouseEvent) {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false)
    }

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return
      setAbierto(false)
      // Devolver el foco al boton: si se pierde, quien navega con teclado
      // queda sin punto de partida y tiene que tabular desde el principio.
      botonRef.current?.focus()
    }

    document.addEventListener('mousedown', alTocarFuera)
    document.addEventListener('keydown', alTeclear)
    return () => {
      document.removeEventListener('mousedown', alTocarFuera)
      document.removeEventListener('keydown', alTeclear)
    }
  }, [abierto])

  // Mover el foco al dia activo cada vez que cambia, para que las flechas
  // recorran la cuadricula como se espera de un calendario.
  useEffect(() => {
    if (!abierto) return
    gridRef.current?.querySelector<HTMLButtonElement>('[data-activo="true"]')?.focus()
  }, [abierto, cursor])

  const { y, m } = partes(cursor)

  const celdas = useMemo(() => {
    const primerDia = new Date(y, m, 1).getDay()
    const diasDelMes = new Date(y, m + 1, 0).getDate()
    const total = primerDia + diasDelMes
    // Se rellena hasta completar semanas, para que la cuadricula no baile de
    // alto entre meses (un mes puede necesitar 5 filas y otro 6).
    const filas = Math.ceil(total / 7) * 7

    return Array.from({ length: filas }, (_, i) => {
      const dia = i - primerDia + 1
      return dia >= 1 && dia <= diasDelMes ? dia : null
    })
  }, [y, m])

  function moverCursor(dias: number) {
    const { y: cy, m: cm, d: cd } = partes(cursor)
    const siguiente = new Date(cy, cm, cd + dias)
    setCursor(aISO(siguiente.getFullYear(), siguiente.getMonth(), siguiente.getDate()))
  }

  function cambiarMes(delta: number) {
    const { y: cy, m: cm, d: cd } = partes(cursor)
    const ultimoDelDestino = new Date(cy, cm + delta + 1, 0).getDate()
    // Si el dia no existe en el mes destino (31 de enero -> febrero), se
    // recorta al ultimo dia en vez de saltar de mes.
    setCursor(aISO(cy, cm + delta, Math.min(cd, ultimoDelDestino)))
  }

  function alTeclearEnGrid(evento: React.KeyboardEvent) {
    const movimientos: Record<string, () => void> = {
      ArrowLeft: () => moverCursor(-1),
      ArrowRight: () => moverCursor(1),
      ArrowUp: () => moverCursor(-7),
      ArrowDown: () => moverCursor(7),
      PageUp: () => cambiarMes(-1),
      PageDown: () => cambiarMes(1),
    }

    const mover = movimientos[evento.key]
    if (!mover) return

    evento.preventDefault()
    mover()
  }

  function elegir(dia: number) {
    onChange(aISO(y, m, dia))
    setAbierto(false)
    botonRef.current?.focus()
  }

  return (
    <div className="relative" ref={contenedorRef}>
      <IconButton
        ref={botonRef}
        onClick={alternar}
        disabled={disabled}
        aria-label={label}
        aria-expanded={abierto}
        aria-haspopup="dialog"
      >
        <CalendarDays className="h-4 w-4" />
      </IconButton>

      {abierto && (
        <div
          role="dialog"
          aria-label={label}
          className="animate-menu-pop absolute right-0 top-full z-50 mt-2 w-[17.5rem] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <IconButton onClick={() => cambiarMes(-1)} aria-label="Mes anterior">
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <p className="text-xs font-bold capitalize text-slate-800">{nombreMes(y, m)}</p>
            <IconButton onClick={() => cambiarMes(1)} aria-label="Mes siguiente">
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5" aria-hidden="true">
            {DIAS.map((dia) => (
              <span
                key={dia}
                className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400"
              >
                {dia}
              </span>
            ))}
          </div>

          {/*
            Sin `role="grid"` a proposito. Un grid ARIA de verdad exige filas
            y celdas (`row`/`gridcell`) envolviendo cada boton; ponerle el rol
            al contenedor y nada mas deja una estructura invalida, que para un
            lector de pantalla es peor que no declarar nada. Aca cada dia es un
            boton con su fecha completa en el nombre accesible, que se anuncia
            bien por si solo, y las flechas siguen funcionando igual.
          */}
          <div ref={gridRef} onKeyDown={alTeclearEnGrid} className="grid grid-cols-7 gap-0.5">
            {celdas.map((dia, i) => {
              if (dia === null) return <span key={`vacio-${i}`} />

              const iso = aISO(y, m, dia)
              const seleccionado = iso === value
              const esHoy = iso === todayISO
              const activo = iso === cursor

              return (
                <button
                  key={iso}
                  type="button"
                  data-activo={activo}
                  tabIndex={activo ? 0 : -1}
                  onClick={() => elegir(dia)}
                  aria-label={etiquetaLarga(y, m, dia) + (esHoy ? ', hoy' : '')}
                  // `aria-current="date"` marca la fecha ELEGIDA, que es lo
                  // que el usuario necesita reencontrar al reabrir. El "hoy"
                  // se distingue visualmente y se dice en la etiqueta.
                  aria-current={seleccionado ? 'date' : undefined}
                  className={`flex h-9 items-center justify-center rounded-lg text-xs tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-blue-500/60 ${
                    seleccionado
                      ? 'bg-blue-600 font-bold text-white hover:bg-blue-700'
                      : esHoy
                        ? 'font-bold text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50'
                        : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {dia}
                </button>
              )
            })}
          </div>

          {todayISO && (
            <button
              type="button"
              onClick={() => {
                onChange(todayISO)
                setAbierto(false)
                botonRef.current?.focus()
              }}
              className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-blue-600 outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              Hoy
            </button>
          )}
        </div>
      )}
    </div>
  )
}
