'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'
import { cn } from '@/lib/utils/cn'
import { INPUT } from '@/components/ui/styles'

/**
 * Selector de fecha con calendario propio.
 *
 * Reemplaza al `<input type="date">`: su calendario lo dibuja el navegador
 * fuera del DOM y NO se puede estilizar — ni tipografia, ni colores, ni
 * bordes. Cambia de aspecto entre Chrome, Firefox y Safari, y no se parecia
 * en nada al resto del sistema.
 *
 * Dos disparadores sobre el MISMO panel: `DatePickerButton` es solo un icono
 * (navegar por dias en un listado) y `DateField` se ve como un campo de
 * formulario. Comparten toda la logica; solo cambia lo que se toca.
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

/** "sábado, 15 de agosto de 2026" — nombre accesible de cada dia. */
function etiquetaLarga(y: number, m: number, d: number) {
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'full' }).format(new Date(y, m, d))
}

function nombreMes(y: number, m: number) {
  const etiqueta = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(
    new Date(y, m, 1)
  )
  return etiqueta.charAt(0).toUpperCase() + etiqueta.slice(1)
}

/** Hoy segun el navegador. Solo decide en que mes ABRE el calendario. */
function hoyLocal() {
  const ahora = new Date()
  return aISO(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
}

/** "15/08/2026" para mostrar en el campo. Cadena vacia si no hay fecha. */
function formatoCorto(dateISO: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return ''
  const { y, m, d } = partes(dateISO)
  return new Intl.DateTimeFormat('es-CR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(y, m, d))
}

interface PopoverProps {
  value: string
  onChange: (dateISO: string) => void
  todayISO?: string
  disabled?: boolean
  label: string
  /**
   * Rango permitido, "YYYY-MM-DD". Equivalen a los `min`/`max` del
   * `<input type="date">` nativo: los dias fuera del rango se muestran
   * apagados y no se pueden elegir. Se comparan como cadenas, que en formato
   * ISO ordena igual que por fecha.
   */
  minISO?: string
  maxISO?: string
  /** El control que abre el panel. Recibe lo que necesita para cablearse. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>
    onClick: () => void
    disabled: boolean
    'aria-expanded': boolean
    'aria-haspopup': 'dialog'
  }) => React.ReactNode
}

/**
 * El calendario con un disparador a medida. `DatePickerButton` y `DateField`
 * son los dos disparadores de uso comun; se exporta para las barras de control
 * que necesitan uno propio (la pildora de rango semanal de Horarios) sin tener
 * que volver a un `<input type="date">` nativo.
 */
export function DatePopover({
  value,
  onChange,
  todayISO,
  disabled = false,
  label,
  minISO,
  maxISO,
  trigger,
}: PopoverProps) {
  const fueraDeRango = (iso: string) =>
    Boolean((minISO && iso < minISO) || (maxISO && iso > maxISO))
  const [abierto, setAbierto] = useState(false)
  // Fecha "en foco" dentro del calendario, que no es la elegida: con las
  // flechas se recorre sin seleccionar hasta apretar Enter.
  //
  // Sin valor y sin "hoy" del negocio, se abre en el mes CORRIENTE del
  // navegador. Es una fecha de arranque para la vista, no un valor que se
  // guarde, asi que la zona horaria local alcanza y es infinitamente mejor
  // que un mes fijo: abrir un campo vacio y aterrizar en enero de otro año
  // obliga a navegar meses a mano.
  const [cursor, setCursor] = useState(value || todayISO || hoyLocal())

  /**
   * Nivel de zoom del calendario: dias, meses de un año, o bloque de años.
   *
   * Sin esto, poner una fecha de nacimiento de 1985 exigia unos 500 toques
   * en "mes anterior". Tocando el titulo se sube de nivel (dias -> meses ->
   * años) y eligiendo se baja: 1985 queda a tres toques.
   */
  const [vista, setVista] = useState<'dias' | 'meses' | 'anios'>('dias')
  const contenedorRef = useRef<HTMLDivElement>(null)
  const disparadorRef = useRef<HTMLButtonElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  /**
   * Empuja el panel para que no se salga de la pantalla.
   *
   * Anclarlo a un lado fijo no alcanza: el mismo disparador puede quedar a la
   * derecha en escritorio y a la izquierda en movil (basta que la barra de
   * controles envuelva de linea), y en 375px un panel de 280px se sale por
   * cualquiera de los dos lados.
   *
   * Se escribe `style.left` sobre el nodo en vez de guardarlo en estado: es
   * un ajuste visual derivado de una medicion del DOM, y pasarlo por estado
   * encadena un render extra por cada apertura. El panel se monta de cero
   * cada vez, asi que no hay valor viejo que arrastrar.
   */
  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!abierto || !panel) return

    const caja = panel.getBoundingClientRect()
    const margen = 8
    // `clientWidth` del documento y NO `window.innerWidth`: el segundo incluye
    // el ancho de la barra de scroll, asi que el panel quedaba calzado contra
    // el borde y generaba unos pixeles de desplazamiento horizontal en la
    // pagina — el defecto que este componente venia justamente a evitar.
    const anchoVisible = document.documentElement.clientWidth
    const sobraDerecha = caja.right - (anchoVisible - margen)
    const faltaIzquierda = margen - caja.left

    if (sobraDerecha > 0) panel.style.left = `${-sobraDerecha}px`
    else if (faltaIzquierda > 0) panel.style.left = `${faltaIzquierda}px`
  }, [abierto])

  // Al abrir, el calendario arranca en el mes de la fecha seleccionada —
  // aunque el usuario haya navegado a otro mes y cerrado sin elegir. Se hace
  // en el handler y no en un efecto: sincronizar estado con estado dentro de
  // un useEffect provoca un render de mas y el linter lo marca con razon.
  function alternar() {
    const siguiente = !abierto
    if (siguiente) {
      setCursor(value || todayISO || cursor)
      // Siempre se reabre en dias: quien dejo el calendario en la vista de
      // años no espera reencontrarla ahi la proxima vez.
      setVista('dias')
    }
    setAbierto(siguiente)
  }

  function cerrar() {
    setAbierto(false)
    // Devolver el foco al disparador: si se pierde, quien navega con teclado
    // queda sin punto de partida y tiene que tabular desde el principio.
    disparadorRef.current?.focus()
  }

  useEffect(() => {
    if (!abierto) return

    function alTocarFuera(evento: MouseEvent) {
      if (!contenedorRef.current?.contains(evento.target as Node)) setAbierto(false)
    }

    function alTeclear(evento: KeyboardEvent) {
      if (evento.key !== 'Escape') return
      setAbierto(false)
      disparadorRef.current?.focus()
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
    // Se rellena hasta completar semanas, para que la cuadricula no baile de
    // alto entre meses (un mes puede necesitar 5 filas y otro 6).
    const filas = Math.ceil((primerDia + diasDelMes) / 7) * 7

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
    cerrar()
  }

  /** Primer año del bloque de 12 que se muestra en la vista de años. */
  const inicioBloque = Math.floor(y / 12) * 12

  return (
    <div className="relative" ref={contenedorRef}>
      {trigger({
        ref: disparadorRef,
        onClick: alternar,
        disabled,
        'aria-expanded': abierto,
        'aria-haspopup': 'dialog',
      })}

      {abierto && (
        <div
          role="dialog"
          aria-label={label}
          ref={panelRef}
          className="animate-menu-pop absolute left-0 top-full z-50 mt-2 w-[17.5rem] max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="flex items-center justify-between gap-2">
            <IconButton
              onClick={() =>
                vista === 'dias'
                  ? cambiarMes(-1)
                  : setCursor(aISO(y - (vista === 'meses' ? 1 : 12), m, 1))
              }
              aria-label={vista === 'dias' ? 'Mes anterior' : 'Años anteriores'}
            >
              <ChevronLeft className="h-4 w-4" />
            </IconButton>

            {/*
              El titulo es el que sube de nivel. Es el gesto que ya existe en
              los calendarios de escritorio, y evita meter dos desplegables
              que en 280px de ancho no caben.
            */}
            <button
              type="button"
              onClick={() => setVista(vista === 'dias' ? 'meses' : 'anios')}
              disabled={vista === 'anios'}
              aria-label={
                vista === 'dias' ? 'Elegir mes y año' : vista === 'meses' ? 'Elegir año' : undefined
              }
              className="rounded-lg px-2 py-1 text-xs font-bold capitalize text-slate-800 outline-none transition hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:hover:bg-transparent"
            >
              {vista === 'dias'
                ? nombreMes(y, m)
                : vista === 'meses'
                  ? y
                  : `${inicioBloque} – ${inicioBloque + 11}`}
            </button>

            <IconButton
              onClick={() =>
                vista === 'dias'
                  ? cambiarMes(1)
                  : setCursor(aISO(y + (vista === 'meses' ? 1 : 12), m, 1))
              }
              aria-label={vista === 'dias' ? 'Mes siguiente' : 'Años siguientes'}
            >
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>

          {vista === 'meses' && (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setCursor(aISO(y, i, 1))
                    setVista('dias')
                  }}
                  className={`rounded-lg py-2.5 text-xs font-semibold capitalize outline-none transition active:scale-95 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                    i === m ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {new Intl.DateTimeFormat('es-CR', { month: 'short' }).format(new Date(y, i, 1))}
                </button>
              ))}
            </div>
          )}

          {vista === 'anios' && (
            <div className="mt-2 grid grid-cols-3 gap-1">
              {Array.from({ length: 12 }, (_, i) => {
                const anio = inicioBloque + i
                return (
                  <button
                    key={anio}
                    type="button"
                    onClick={() => {
                      setCursor(aISO(anio, m, 1))
                      setVista('meses')
                    }}
                    className={`rounded-lg py-2.5 text-xs font-semibold tabular-nums outline-none transition active:scale-95 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                      anio === y ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {anio}
                  </button>
                )
              })}
            </div>
          )}

          <div
            className={`mt-2 grid grid-cols-7 gap-0.5 ${vista === 'dias' ? '' : 'hidden'}`}
            aria-hidden="true"
          >
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
          <div
            ref={gridRef}
            onKeyDown={alTeclearEnGrid}
            className={`grid grid-cols-7 gap-0.5 ${vista === 'dias' ? '' : 'hidden'}`}
          >
            {celdas.map((dia, i) => {
              if (dia === null) return <span key={`vacio-${i}`} />

              const iso = aISO(y, m, dia)
              const seleccionado = iso === value
              const esHoy = iso === todayISO
              const activo = iso === cursor
              const bloqueado = fueraDeRango(iso)

              return (
                <button
                  key={iso}
                  type="button"
                  data-activo={activo}
                  tabIndex={activo ? 0 : -1}
                  disabled={bloqueado}
                  onClick={() => elegir(dia)}
                  aria-label={etiquetaLarga(y, m, dia) + (esHoy ? ', hoy' : '')}
                  // `aria-current="date"` marca la fecha ELEGIDA, que es lo
                  // que el usuario necesita reencontrar al reabrir. El "hoy"
                  // se distingue visualmente y se dice en la etiqueta.
                  aria-current={seleccionado ? 'date' : undefined}
                  className={`flex h-9 items-center justify-center rounded-lg text-xs tabular-nums outline-none transition focus-visible:ring-2 focus-visible:ring-brand-500/60 ${
                    bloqueado
                      ? 'cursor-not-allowed text-slate-300'
                      : `active:scale-90 motion-reduce:active:scale-100 ${
                          seleccionado
                            ? 'bg-brand-600 font-bold text-white hover:bg-brand-700'
                            : esHoy
                              ? 'font-bold text-brand-700 ring-1 ring-inset ring-brand-200 hover:bg-brand-50'
                              : 'text-slate-600 hover:bg-slate-100'
                        }`
                  }`}
                >
                  {dia}
                </button>
              )
            })}
          </div>

          {/*
            Pie de acciones. "Cerrar" existe sobre todo por movil: en
            escritorio se sale con Escape o tocando afuera, pero en una
            pantalla tactil no hay ninguna de las dos cosas a la vista, y
            tocar "afuera" de un panel que ocupa media pantalla es incomodo.
            Va abajo porque es donde llega el pulgar sin recolocar la mano.
          */}
          <div className="mt-2 flex items-center gap-1 border-t border-slate-100 pt-2">
            {todayISO && vista === 'dias' && (
              <button
                type="button"
                onClick={() => {
                  onChange(todayISO)
                  cerrar()
                }}
                className="flex-1 rounded-lg py-2 text-xs font-semibold text-brand-600 outline-none transition hover:bg-brand-50 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={cerrar}
              className="flex-1 rounded-lg py-2 text-xs font-semibold text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-800 active:scale-[0.98] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

interface DatePickerButtonProps {
  value: string
  onChange: (dateISO: string) => void
  todayISO?: string
  disabled?: boolean
  label?: string
}

/** Disparador de solo icono: navegar por fecha en un listado. */
export function DatePickerButton({
  value,
  onChange,
  todayISO,
  disabled = false,
  label = 'Elegir fecha',
}: DatePickerButtonProps) {
  return (
    <DatePopover
      value={value}
      onChange={onChange}
      todayISO={todayISO}
      disabled={disabled}
      label={label}
      trigger={(props) => (
        <IconButton {...props} aria-label={label}>
          <CalendarDays className="h-4 w-4" />
        </IconButton>
      )}
    />
  )
}

interface DateFieldProps {
  value: string
  onChange: (dateISO: string) => void
  todayISO?: string
  disabled?: boolean
  /** Nombre accesible; tambien el texto del placeholder cuando no hay fecha. */
  label: string
  id?: string
  invalid?: boolean
  placeholder?: string
  minISO?: string
  maxISO?: string
}

/**
 * Disparador con forma de campo: reemplaza al `<input type="date">` dentro de
 * los formularios. Se ve como el resto de los campos (mismo token `INPUT`),
 * muestra la fecha en dd/mm/aaaa y abre el mismo calendario.
 */
export function DateField({
  value,
  onChange,
  todayISO,
  disabled = false,
  label,
  id,
  invalid = false,
  placeholder = 'dd/mm/aaaa',
  minISO,
  maxISO,
}: DateFieldProps) {
  const texto = formatoCorto(value)

  return (
    <DatePopover
      value={value}
      onChange={onChange}
      todayISO={todayISO}
      disabled={disabled}
      label={label}
      minISO={minISO}
      maxISO={maxISO}
      trigger={(props) => (
        <button
          {...props}
          id={id}
          type="button"
          aria-label={label}
          // Sin `aria-invalid`: no es un atributo valido sobre role="button",
          // asi que el borde rojo se aplica por clase. El mensaje de error lo
          // anuncia el `role="alert"` que ya rinde <Labeled> debajo.
          className={cn(
            INPUT,
            'flex items-center justify-between gap-2 text-left',
            !texto && 'text-slate-400',
            invalid && 'border-rose-400 focus:ring-rose-400/20'
          )}
        >
          <span className="truncate tabular-nums">{texto || placeholder}</span>
          <CalendarDays className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
        </button>
      )}
    />
  )
}
