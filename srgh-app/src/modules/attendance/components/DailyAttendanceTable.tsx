'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Users,
} from 'lucide-react'
import type {
  DailyAttendanceRow,
  DailyMarkInfo,
  DailyScheduledBlock,
  DailyTardiness,
} from '@/modules/attendance/actions/getDailyAttendance'
import { DEFAULT_TARDINESS_COLOR } from '@/modules/attendance/lib/infractions'
import { useDateNavigation } from '@/modules/attendance/hooks/useDateNavigation'
import { usePagination } from '@/hooks/usePagination'
import { Alert } from '@/components/ui/Alert'
import { Avatar } from '@/components/ui/Avatar'
import { Pagination } from '@/components/ui/Pagination'
import { ManualMarkModal } from '@/modules/attendance/components/ManualMarkModal'
import type { DayStatusKind } from '@/modules/attendance/lib/dayStatus'
import type { MarkType } from '@/modules/attendance/lib/marks'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { DatePickerButton } from '@/components/ui/DatePickerButton'
import { formatMinutes, todayInCostaRica } from '@/modules/attendance/lib/time'
import { META_LABEL, TABLE_HEAD, TABLE_ROW, TABLE_SCROLL, TABLE_TH } from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'
import { Hora } from '@/components/ui/Hora'
import { useFormatHora } from '@/lib/time/FormatoHoraContext'
import { DailyPersonRow } from './DailyPersonRow'
import { DayStatusBadge } from './DayStatusBadge'

interface DailyAttendanceTableProps {
  dateISO: string
  rows: DailyAttendanceRow[]
  canWrite: boolean
  pendingCount?: number
  pendingHref?: string
}

interface EditingTarget {
  row: DailyAttendanceRow
  type: MarkType
  /**
   * La marca que se corrige, cuando no es la de la fila: la de un bloque de un
   * dia de varios (SGRH-110). Sin esto el modal tomaria la primera entrada o
   * la ultima salida, que son las unicas que la fila expone.
   */
  mark?: DailyMarkInfo | null
  block?: DailyScheduledBlock
  suggestedTime?: string
}

const MARK_FIELD: Record<
  MarkType,
  keyof Pick<
    DailyAttendanceRow,
    'entrada' | 'inicioReceso' | 'finReceso' | 'inicioAlmuerzo' | 'finAlmuerzo' | 'salida'
  >
> = {
  entrada: 'entrada',
  inicio_receso: 'inicioReceso',
  fin_receso: 'finReceso',
  inicio_almuerzo: 'inicioAlmuerzo',
  fin_almuerzo: 'finAlmuerzo',
  salida: 'salida',
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(`${dateISO}T00:00:00`))
}

/**
 * "10 min antes" / "5 min despues", o null si marco a la hora o no hay hora
 * programada con que comparar.
 */
function diffLabel(diffMinutes: number | null): string | null {
  if (diffMinutes === null || diffMinutes === 0) return null

  return `${formatMinutes(diffMinutes)} ${diffMinutes > 0 ? 'después' : 'antes'}`
}

/** Lo que dice el punto de una marca al tocarlo. */
function markDetail(
  time: string,
  diffMinutes: number | null,
  tardiness: DailyTardiness | null
): string | null {
  if (tardiness) {
    const base = `${tardiness.tipo.nombre}: llegó ${formatMinutes(tardiness.diffMinutes)} tarde.`
    if (!tardiness.isJustified) return base

    return (
      base +
      (tardiness.justification ? ` Justificada: ${tardiness.justification}` : ' Justificada.')
    )
  }

  const label = diffLabel(diffMinutes)

  return label ? `Marcó a las ${time}, ${label} de su hora.` : null
}

/**
 * Punto al lado de la hora que cuenta que paso con esa marca: la tardia y sus
 * minutos, o el desfase cuando no la hay.
 *
 * Reemplaza a los numeros sueltos ("-70", "+728") que se repetian en cada
 * celda: en una tabla de 40 celdas por pantalla eran ruido, y un atraso de
 * doce horas escrito en minutos ni siquiera se entendia. El COLOR ya dice si
 * hay algo que mirar (el del tipo de tardia, o gris cuando es solo
 * contexto); el numero aparece al apuntarlo.
 *
 * Se muestra con el puntero encima, sin tener que hacer clic — leer una fila
 * no deberia costar cuatro clics. El clic queda igual para tactil, donde no
 * hay hover, y el foco lo abre para quien navega con teclado.
 */
function MarkDot({
  time,
  diffMinutes,
  tardiness,
}: {
  time: string
  diffMinutes: number | null
  tardiness: DailyTardiness | null
}) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const { hora } = useFormatHora()
  // markDetail usa la hora solo para armar el texto del tooltip, así que
  // recibe la ya formateada. El `time` crudo no sale de acá.
  const detalle = markDetail(hora(time) ?? time, diffMinutes, tardiness)

  if (!detalle) return null

  // Una tardia justificada deja de pintarse con el color de su banda: se
  // sigue pudiendo consultar, pero ya no reclama atencion.
  const color =
    tardiness && !tardiness.isJustified ? (tardiness.tipo.color ?? DEFAULT_TARDINESS_COLOR) : null

  function abrir(event: { currentTarget: HTMLElement }) {
    const rect = event.currentTarget.getBoundingClientRect()
    // El recuadro se centra en el punto, pero se mantiene dentro de la
    // pantalla: en la ultima columna, centrado a secas, se salia por la
    // derecha y empujaba scroll horizontal en el celular.
    const mitad = Math.min(128, window.innerWidth / 2 - 8)
    const centro = rect.left + rect.width / 2

    setAnchor({
      x: Math.min(Math.max(centro, mitad + 8), window.innerWidth - mitad - 8),
      y: rect.bottom + 6,
    })
  }

  return (
    <span className="inline-flex">
      <button
        type="button"
        onClick={(e) => (anchor ? setAnchor(null) : abrir(e))}
        onMouseEnter={abrir}
        onMouseLeave={() => setAnchor(null)}
        onFocus={abrir}
        onBlur={() => setAnchor(null)}
        aria-expanded={anchor !== null}
        aria-label={detalle}
        className={`flex h-5 w-5 items-center justify-center rounded-full outline-none transition hover:scale-125 focus-visible:ring-2 focus-visible:ring-brand-500/60 motion-reduce:hover:scale-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 ${
          color ? '' : 'text-slate-300 hover:text-slate-500'
        }`}
      >
        <span
          style={color ? { backgroundColor: color } : undefined}
          className={`rounded-full ${color ? 'h-2 w-2 ring-2 ring-white' : 'h-1.5 w-1.5 bg-current'}`}
        />
      </button>
      {/* En un portal y con position fixed: el recuadro vive fuera del
          scroller de la tabla, que si no lo recorta contra su borde — y en
          la ultima columna se salia de la pantalla. */}
      {anchor !== null &&
        createPortal(
          <span
            role="tooltip"
            style={{ top: anchor.y, left: anchor.x }}
            className="pointer-events-none fixed z-50 w-max max-w-[min(16rem,calc(100vw-2rem))] -translate-x-1/2 whitespace-normal rounded-lg bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium leading-snug text-white shadow-lg"
          >
            {detalle}
          </span>,
          document.body
        )}
    </span>
  )
}

function MarkCell({
  mark,
  canWrite,
  onEdit,
  tardiness = null,
  label,
}: {
  mark: DailyMarkInfo | null
  canWrite: boolean
  onEdit: () => void
  tardiness?: DailyTardiness | null
  label?: string
}) {
  return (
    <div className="group/celda flex items-center gap-1.5 whitespace-nowrap">
      {mark ? (
        <span className="inline-flex items-baseline gap-1.5">
          {label && canWrite ? (
            <Button variant="secondary" onClick={onEdit} aria-label={`Corregir marca de ${label}`}>
              <Hora value={mark.time} />
            </Button>
          ) : (
            <span className="text-[13px] font-semibold tabular-nums text-slate-700">
              <Hora value={mark.time} />
            </span>
          )}
          <MarkDot time={mark.time} diffMinutes={mark.diffMinutes} tardiness={tardiness} />
        </span>
      ) : (
        <span className="text-sm text-slate-300">—</span>
      )}
      {canWrite && (!label || !mark) && (
        <IconButton
          onClick={onEdit}
          aria-label={`${mark ? 'Corregir marca' : 'Agregar marca'}${label ? ` de ${label}` : ''}`}
          tone="blue"
          // Aparece al apuntar la celda. Con cuatro marcas por fila y diez
          // filas, tener 40 lapices siempre visibles compite con lo que de
          // verdad se viene a leer, que son las horas.
          //
          // `opacity-0` y no `hidden`: el boton sigue siendo enfocable, asi
          // que quien navega con Tab lo alcanza. Y en tactil no hay hover,
          // por eso `pointer-coarse` lo deja fijo.
          //
          // Se revela con `focus` a secas, NO con `focus-visible`: la regla
          // aca no es "no mostrar anillo al hacer clic con el mouse", es "si
          // tiene el foco, tiene que verse". focus-visible depende de una
          // heuristica del navegador que no matchea en todos los caminos de
          // foco, y cuando no matcheaba el boton quedaba enfocado e
          // invisible — el peor resultado posible para quien usa teclado.
          className={
            label
              ? undefined
              : 'opacity-0 transition-opacity group-hover/celda:opacity-100 group-focus-within/celda:opacity-100 focus:opacity-100 pointer-coarse:opacity-100'
          }
        >
          {mark ? <Pencil className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
        </IconButton>
      )}
    </div>
  )
}

/**
 * Puesto y hora de entrada del turno, bajo el nombre.
 *
 * La hora esperada tuvo columna propia por un rato: se mostraba el desfase
 * ("+4") sin decir contra que. Pero gastar una columna entera en un dato que
 * se repite entre todos los del mismo turno no valia la pena — aca acompaña
 * al nombre, que es donde el gerente ya esta mirando, y libera ancho para las
 * marcas.
 */
function EmployeeMeta({ row }: { row: DailyAttendanceRow }) {
  if (!row.position && !row.expectedStart) return null

  return (
    <p className="mt-0.5 text-[11px] text-slate-500">
      {row.position}
      {row.position && row.expectedStart && <span className="text-slate-300"> · </span>}
      {row.expectedStart && (
        <span className="tabular-nums">
          Entra <Hora value={row.expectedStart} />
        </span>
      )}
    </p>
  )
}

function MarkDetails({
  row,
  canWrite,
  onEditMark,
}: {
  row: DailyAttendanceRow
  canWrite: boolean
  onEditMark: (target: EditingTarget) => void
}) {
  const showRecordedBlocks = row.scheduledBlocks.length !== 2 && row.blocks.length > 1
  const lunchExcess = row.lunchExcessMinutes ?? 0
  const breakExcess = row.breakExcessMinutes ?? 0
  if (
    !row.ausencia &&
    !showRecordedBlocks &&
    !lunchExcess &&
    !breakExcess &&
    !row.duplicateMarksCount
  ) {
    return null
  }

  /** La hora de una marca de bloque: con permiso de escritura, abre su correccion. */
  function blockTime(type: MarkType, mark: DailyMarkInfo) {
    if (!canWrite) return <Hora value={mark.time} />
    return (
      <button
        type="button"
        onClick={() => onEditMark({ row, type, mark })}
        aria-label={`Corregir ${type} de las ${mark.time}`}
        className="rounded pointer-coarse:min-h-11 underline decoration-dotted underline-offset-2 hover:text-brand-700 focus-visible:outline-2 focus-visible:outline-brand-600"
      >
        <Hora value={mark.time} />
      </button>
    )
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {row.ausencia && (
        <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
          {row.ausencia}
        </span>
      )}
      {/* Dia de varios bloques (SGRH-110): la entrada y la salida de la fila
          son las del primero y el ultimo; aca van todos. */}
      {showRecordedBlocks && (
        <span
          title="Bloques del día"
          className="inline-flex max-w-full flex-wrap items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600"
        >
          {row.blocks.map((block, i) => (
            <span key={block.entrada.id}>
              {i > 0 && ' · '}
              {blockTime('entrada', block.entrada)}–
              {block.salida ? blockTime('salida', block.salida) : '…'}
            </span>
          ))}
        </span>
      )}
      {/* Excesos (SGRH-88): el almuerzo contra su duracion programada, el
          receso contra los minutos pagados. 0 no se muestra. */}
      {lunchExcess > 0 && (
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-orange-700">
          Almuerzo +{formatMinutes(lunchExcess)}
        </span>
      )}
      {breakExcess > 0 && (
        <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-orange-700">
          Receso +{formatMinutes(breakExcess)}
        </span>
      )}
      {row.duplicateMarksCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          {row.duplicateMarksCount} marca(s) duplicada(s)
        </span>
      )}
    </div>
  )
}

/** Las marcas en el orden de la jornada, para recorrerlas sin repetirlas. */
const MARK_SLOTS: { type: MarkType; label: string }[] = [
  { type: 'entrada', label: 'Entrada' },
  { type: 'inicio_receso', label: 'Inicio receso' },
  { type: 'fin_receso', label: 'Fin receso' },
  { type: 'inicio_almuerzo', label: 'Inicio almuerzo' },
  { type: 'fin_almuerzo', label: 'Fin almuerzo' },
  { type: 'salida', label: 'Salida' },
]

/**
 * Una marca en movil, como bloque propio en vez de una celda apretada.
 *
 * El bloque ENTERO es el boton, no un lapiz de 12px al lado del texto: en una
 * pantalla tactil apuntarle a ese icono es el gesto que mas falla, y aca el
 * area util pasa a ser toda la tarjeta. Cuando no hay marca, el borde
 * punteado y el "Sin marcar" comunican que ese hueco se puede llenar tocando,
 * que era invisible cuando solo habia un guion.
 */
function MarkTile({
  label,
  actionLabel = label.toLowerCase(),
  mark,
  canWrite,
  onEdit,
  tardiness = null,
}: {
  label: string
  actionLabel?: string
  mark: DailyMarkInfo | null
  canWrite: boolean
  onEdit: () => void
  tardiness?: DailyTardiness | null
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-1">
        <span className={META_LABEL}>{label}</span>
        {canWrite &&
          (mark ? (
            <Pencil className="h-3 w-3 shrink-0 text-slate-400" />
          ) : (
            <Plus className="h-3 w-3 shrink-0 text-slate-400" />
          ))}
      </span>
      {mark ? (
        <span className="mt-1 block">
          <span className="text-sm font-semibold tabular-nums text-slate-800">
            <Hora value={mark.time} />
          </span>
          {/* En movil la tarjeta ENTERA es el boton de corregir, asi que el
              detalle no puede ser otro boton con su recuadro: se escribe.
              Hay lugar, y asi la tardia deja de ser invisible en el celular
              — antes solo se veia en la tabla de escritorio. */}
          {tardiness ? (
            <span className="mt-1 flex min-w-0 items-start gap-1.5">
              <span
                aria-hidden="true"
                style={
                  tardiness.isJustified
                    ? undefined
                    : { backgroundColor: tardiness.tipo.color ?? DEFAULT_TARDINESS_COLOR }
                }
                className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                  tardiness.isJustified ? 'bg-slate-300' : ''
                }`}
              />
              <span
                className={`min-w-0 break-words text-[10px] font-medium ${
                  tardiness.isJustified ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                {tardiness.tipo.nombre} · {formatMinutes(tardiness.diffMinutes)}
                {tardiness.isJustified ? ' · justificada' : ''}
              </span>
            </span>
          ) : (
            diffLabel(mark.diffMinutes) && (
              <span className="mt-1 block text-[10px] font-medium text-slate-400">
                {diffLabel(mark.diffMinutes)}
              </span>
            )
          )}
        </span>
      ) : (
        <span className="mt-1 block text-xs text-slate-400">Sin marcar</span>
      )}
    </>
  )

  const shape = `block w-full rounded-xl border px-3 py-2.5 text-left transition ${
    mark ? 'border-slate-200 bg-white' : 'border-dashed border-slate-200 bg-slate-50/60'
  }`

  if (!canWrite) {
    return <div className={shape}>{body}</div>
  }

  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label={`${mark ? 'Corregir' : 'Agregar'} marca de ${actionLabel}`}
      className={`${shape} outline-none hover:border-brand-300 hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.97] motion-reduce:active:scale-100 pointer-coarse:min-h-11`}
    >
      {body}
    </button>
  )
}

const BLOCK_MARKS = [
  { type: 'entrada', label: 'Entrada' },
  { type: 'salida', label: 'Salida' },
] as const

function SecondBlockLabel({ row, block }: { row: DailyAttendanceRow; block: DailyScheduledBlock }) {
  return (
    <>
      <p className="text-xs font-semibold text-slate-700">2.º bloque</p>
      <p className="break-words text-xs text-slate-500">
        <span className="whitespace-nowrap tabular-nums">
          <Hora value={block.inicio} />–<Hora value={block.fin} />
        </span>
        {block.branchId !== row.branchId &&
          ` · ${block.branchName ?? `Sucursal ${block.branchId}`}`}
      </p>
    </>
  )
}

function MobileMarkDetails({
  row,
  canWrite,
  onEditMark,
}: {
  row: DailyAttendanceRow
  canWrite: boolean
  onEditMark: (target: EditingTarget) => void
}) {
  const secondBlock = row.scheduledBlocks.length === 2 ? row.scheduledBlocks[1] : undefined
  const firstBlock = secondBlock ? row.scheduledBlocks[0] : undefined
  const slots = MARK_SLOTS.map(({ type, label }) => {
    if (firstBlock && (type === 'entrada' || type === 'salida')) {
      return { type, label, block: firstBlock, mark: firstBlock[type] }
    }
    return { type, label, block: undefined, mark: row[MARK_FIELD[type]] }
  })
  const marked =
    slots.filter(({ mark }) => mark !== null).length +
    Number(Boolean(secondBlock?.entrada)) +
    Number(Boolean(secondBlock?.salida))

  return (
    <div className="space-y-2 border-t border-slate-100 px-2 py-2.5">
      <div className="grid grid-cols-2 gap-2">
        {slots.map(({ type, label, block, mark }) => (
          <MarkTile
            key={type}
            label={label}
            mark={mark}
            canWrite={canWrite}
            onEdit={() => onEditMark({ row, type, mark, block })}
            tardiness={
              type === 'entrada'
                ? row.tardiness
                : type === 'fin_almuerzo'
                  ? row.lunchTardiness
                  : null
            }
          />
        ))}
      </div>
      {secondBlock && (
        <section className="space-y-2 border-t border-slate-100 pt-2">
          <SecondBlockLabel row={row} block={secondBlock} />
          <div className="grid grid-cols-2 gap-2">
            {BLOCK_MARKS.map(({ type, label }) => (
              <MarkTile
                key={type}
                label={label}
                actionLabel={`${label.toLowerCase()} del 2.º bloque`}
                mark={secondBlock[type]}
                canWrite={canWrite}
                onEdit={() =>
                  onEditMark({ row, type, mark: secondBlock[type], block: secondBlock })
                }
                tardiness={type === 'entrada' ? row.secondBlockTardiness : null}
              />
            ))}
          </div>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium tabular-nums text-slate-500">
          {marked} de {MARK_SLOTS.length + (secondBlock ? BLOCK_MARKS.length : 0)} marcas
        </span>
        <MarkDetails row={row} canWrite={canWrite} onEditMark={onEditMark} />
      </div>
    </div>
  )
}

const PAGE_SIZE = 10
const MOBILE_GROUP: Record<DayStatusKind, number> = {
  sin_marcar: 1,
  sin_salida: 1,
  en_jornada: 1,
  por_llegar: 1,
  ya_salio: 2,
  justificada: 2,
  libre: 3,
  sin_programacion: 3,
}

function compareMobileRows(a: DailyAttendanceRow, b: DailyAttendanceRow) {
  const groupA = a.status.needsAttention ? 0 : MOBILE_GROUP[a.status.kind]
  const groupB = b.status.needsAttention ? 0 : MOBILE_GROUP[b.status.kind]
  return (
    groupA - groupB ||
    (a.expectedStart ?? '24:00').localeCompare(b.expectedStart ?? '24:00') ||
    a.fullName.localeCompare(b.fullName, 'es-CR')
  )
}

const INDICATORS = [
  {
    id: 'missing',
    label: 'Faltan',
    icon: CircleX,
    tone: 'rose',
    matches: (kind: DayStatusKind) => kind === 'sin_marcar',
    emptyMessage: 'Nadie falta por marcar la entrada este día.',
  },
  {
    id: 'missingExit',
    label: 'Sin salida',
    icon: LogOut,
    tone: 'amber',
    matches: (kind: DayStatusKind) => kind === 'sin_salida',
    emptyMessage: 'Nadie quedó sin marcar la salida este día.',
  },
  {
    id: 'arrived',
    label: 'Ya llegaron',
    icon: LogIn,
    tone: 'emerald',
    matches: (kind: DayStatusKind) => kind === 'en_jornada' || kind === 'ya_salio',
    emptyMessage: 'Aún no hay entradas registradas este día.',
  },
] as const

type Indicator = (typeof INDICATORS)[number]['id']
type Segment = 'attention' | 'all'

function DailyAttendanceRows({
  rows,
  canWrite,
  onEditMark,
}: {
  rows: DailyAttendanceRow[]
  canWrite: boolean
  onEditMark: (target: EditingTarget) => void
}) {
  function editBlockMark(
    row: DailyAttendanceRow,
    block: DailyScheduledBlock,
    type: 'entrada' | 'salida'
  ) {
    onEditMark({ row, block, type, mark: block[type] })
  }

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    rows,
    PAGE_SIZE
  )
  const mobileRows = useMemo(() => [...rows].sort(compareMobileRows), [rows])
  const mobilePage = mobileRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    // Filas compactas mientras el contenedor no llegue a 768px REALES
    // (@3xl) y tabla desde ahi: el sidebar mide 256px y se colapsa, asi
    // que el ancho de pantalla no dice cuanto espacio tiene la tabla.
    // `hidden` saca la rama inactiva del arbol de accesibilidad.
    <div className="min-w-0 rounded-xl @3xl:overflow-hidden @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <ul className="space-y-1.5 px-px @3xl:hidden">
        {mobilePage.map((row) => (
          <DailyPersonRow
            key={row.employmentHistoryId}
            row={row}
            canWrite={canWrite}
            onAddMark={(type, block) =>
              onEditMark({
                row,
                type,
                block,
                mark: null,
                suggestedTime: type === 'entrada' ? (row.expectedStart ?? undefined) : undefined,
              })
            }
          >
            <MobileMarkDetails row={row} canWrite={canWrite} onEditMark={onEditMark} />
          </DailyPersonRow>
        ))}
      </ul>

      <div className={`hidden @3xl:block ${TABLE_SCROLL}`}>
        <table className="w-full text-xs">
          <thead className={TABLE_HEAD}>
            <tr>
              <th className={TABLE_TH}>Colaborador</th>
              <th className={TABLE_TH}>Entrada</th>
              <th className={TABLE_TH}>Inicio receso</th>
              <th className={TABLE_TH}>Fin receso</th>
              <th className={TABLE_TH}>Inicio almuerzo</th>
              <th className={TABLE_TH}>Fin almuerzo</th>
              <th className={TABLE_TH}>Salida</th>
              <th className={TABLE_TH}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {paginatedItems.map((row) => {
              const secondBlock = row.scheduledBlocks.length === 2 ? row.scheduledBlocks[1] : null
              const firstBlock = secondBlock ? row.scheduledBlocks[0] : null
              return (
                <Fragment key={row.employmentHistoryId}>
                  <tr className={TABLE_ROW}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar size="sm" fotoUrl={row.fotoUrl} nombre={row.fullName} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{row.fullName}</p>
                          <EmployeeMeta row={row} />
                          <MarkDetails row={row} canWrite={canWrite} onEditMark={onEditMark} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={firstBlock ? firstBlock.entrada : row.entrada}
                        canWrite={canWrite}
                        onEdit={() =>
                          firstBlock
                            ? editBlockMark(row, firstBlock, 'entrada')
                            : onEditMark({ row, type: 'entrada' })
                        }
                        tardiness={row.tardiness}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.inicioReceso}
                        canWrite={canWrite}
                        onEdit={() => onEditMark({ row, type: 'inicio_receso' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.finReceso}
                        canWrite={canWrite}
                        onEdit={() => onEditMark({ row, type: 'fin_receso' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.inicioAlmuerzo}
                        canWrite={canWrite}
                        onEdit={() => onEditMark({ row, type: 'inicio_almuerzo' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.finAlmuerzo}
                        canWrite={canWrite}
                        onEdit={() => onEditMark({ row, type: 'fin_almuerzo' })}
                        tardiness={row.lunchTardiness}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={firstBlock ? firstBlock.salida : row.salida}
                        canWrite={canWrite}
                        onEdit={() =>
                          firstBlock
                            ? editBlockMark(row, firstBlock, 'salida')
                            : onEditMark({ row, type: 'salida' })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <DayStatusBadge status={row.status} size="xs" isHoliday={row.isHoliday} />
                    </td>
                  </tr>
                  {secondBlock && (
                    <tr className={`${TABLE_ROW} bg-slate-50/60`}>
                      <td className="px-3 py-2 pl-9">
                        <SecondBlockLabel row={row} block={secondBlock} />
                      </td>
                      <td className="px-3 py-2">
                        <MarkCell
                          mark={secondBlock.entrada}
                          canWrite={canWrite}
                          label="entrada del 2.º bloque"
                          onEdit={() => editBlockMark(row, secondBlock, 'entrada')}
                          tardiness={row.secondBlockTardiness}
                        />
                      </td>
                      <td colSpan={4} />
                      <td className="px-3 py-2">
                        <MarkCell
                          mark={secondBlock.salida}
                          canWrite={canWrite}
                          label="salida del 2.º bloque"
                          onEdit={() => editBlockMark(row, secondBlock, 'salida')}
                        />
                      </td>
                      <td />
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        page={page}
        totalPages={totalPages}
        onPrevious={goToPreviousPage}
        onNext={goToNextPage}
      />
    </div>
  )
}

export function DailyAttendanceTable({
  dateISO,
  rows,
  canWrite,
  pendingCount = 0,
  pendingHref = '?tab=justificar',
}: DailyAttendanceTableProps) {
  const { isNavigating, goToPreviousDay, goToNextDay, goToDate } = useDateNavigation(dateISO)
  const [editing, setEditing] = useState<EditingTarget | null>(null)
  const [segment, setSegment] = useState<Segment | null>(null)
  const [indicator, setIndicator] = useState<Indicator | null>(null)
  const segmentButton = useRef<HTMLButtonElement>(null)

  const { attentionRows, indicatorGroups } = useMemo(
    () => ({
      attentionRows: rows.filter(({ status }) => status.needsAttention),
      indicatorGroups: INDICATORS.map((item) => ({
        ...item,
        rows: rows.filter(({ status }) => item.matches(status.kind)),
      })),
    }),
    [rows]
  )
  const activeSegment = segment ?? (attentionRows.length > 0 ? 'attention' : 'all')
  const activeIndicator = indicatorGroups.find((item) => item.id === indicator)
  const visibleRows =
    activeIndicator?.rows ?? (activeSegment === 'attention' ? attentionRows : rows)

  return (
    <div className="@container min-w-0 space-y-4">
      {pendingCount > 0 && (
        <Alert tone="info" className="items-center! py-1!">
          <div className="flex flex-wrap items-center gap-x-2">
            <span>
              Tenés {pendingCount} {pendingCount === 1 ? 'incidencia' : 'incidencias'} del mes por
              justificar.
            </span>
            <Link
              href={pendingHref}
              className="inline-flex min-h-7 items-center rounded px-1.5 font-semibold text-brand-700 underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40 pointer-coarse:min-h-11"
            >
              Ver
            </Link>
          </div>
        </Alert>
      )}

      {/* Las etiquetas y los blancos táctiles necesitan espacio para convivir en una fila. */}
      <div className="hidden grid-cols-3 gap-2.5 @md:grid">
        {indicatorGroups.map(({ id, label, icon, tone, rows: groupRows }) => (
          <StatCard
            key={id}
            icon={icon}
            tone={tone}
            label={label}
            value={groupRows.length}
            active={indicator === id}
            onClick={() => setIndicator(indicator === id ? null : id)}
            className="focus-visible:ring-2 focus-visible:ring-brand-600/40!"
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <div className="min-w-0">
            <h2 className="text-sm font-bold capitalize text-slate-900">{formatDay(dateISO)}</h2>
            <p className="truncate text-xs text-slate-500">Marcas de asistencia del día.</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <IconButton onClick={goToPreviousDay} disabled={isNavigating} aria-label="Día anterior">
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
            <IconButton onClick={goToNextDay} disabled={isNavigating} aria-label="Día siguiente">
              <ChevronRight className="h-4 w-4" />
            </IconButton>
            <DatePickerButton
              value={dateISO}
              onChange={goToDate}
              // "Hoy" es el de Costa Rica, no el del navegador: una tablet con
              // la zona mal configurada marcaria el dia equivocado.
              todayISO={todayInCostaRica()}
              disabled={isNavigating}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="Filtrar colaboradores"
            className="inline-flex max-w-full rounded-xl bg-slate-100 p-0.5 text-xs font-semibold"
          >
            {(
              [
                ['attention', `Requieren atención (${attentionRows.length})`],
                ['all', `Todos (${rows.length})`],
              ] as const
            ).map(([value, label]) => {
              const selected = !activeIndicator && activeSegment === value
              return (
                <button
                  key={value}
                  ref={activeSegment === value ? segmentButton : undefined}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setSegment(value)
                    setIndicator(null)
                  }}
                  className={`min-h-9 rounded-[10px] px-3 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-600/40 pointer-coarse:min-h-11 ${
                    selected
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
          {activeIndicator && (
            <div role="group" aria-label="Filtro de indicador" className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">
                {activeIndicator.label} ({activeIndicator.rows.length})
              </span>
              <Button
                variant="secondary"
                onClick={() => {
                  setIndicator(null)
                  segmentButton.current?.focus()
                }}
              >
                Quitar filtro
              </Button>
            </div>
          )}
        </div>
      </div>

      {visibleRows.length > 0 ? (
        // La página anterior pertenece a otro conjunto de resultados.
        <DailyAttendanceRows
          key={activeIndicator?.id ?? activeSegment}
          rows={visibleRows}
          canWrite={canWrite}
          onEditMark={setEditing}
        />
      ) : activeIndicator || activeSegment === 'attention' ? (
        <EmptyState
          icon={CircleCheck}
          variant="no-results"
          size="sm"
          title="Todo en orden"
          description={
            activeIndicator?.emptyMessage ?? 'Nadie necesita que hagás algo en este día.'
          }
        />
      ) : (
        <EmptyState
          icon={Users}
          title="No hay colaboradores activos en esta sucursal"
          description="Verificá que existan contratos activos asignados a esta sucursal."
        />
      )}

      {editing &&
        (() => {
          const mark =
            editing.mark === undefined ? editing.row[MARK_FIELD[editing.type]] : editing.mark
          return (
            <ManualMarkModal
              employmentHistoryId={editing.row.employmentHistoryId}
              employeeId={editing.row.employeeId}
              employeeName={editing.row.fullName}
              sucursalId={editing.block?.branchId ?? editing.row.branchId}
              tipo={editing.type}
              markId={mark?.id ?? null}
              currentFechaHora={mark ? `${dateISO} ${mark.time}:00` : null}
              defaultDateISO={dateISO}
              defaultTime={
                (editing.type === 'salida' ? editing.block?.fin : editing.block?.inicio) ??
                editing.suggestedTime
              }
              onClose={() => setEditing(null)}
            />
          )
        })()}
    </div>
  )
}
