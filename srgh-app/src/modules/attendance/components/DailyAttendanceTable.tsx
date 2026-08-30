'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  Users,
} from 'lucide-react'
import type {
  DailyAttendanceRow,
  DailyMarkInfo,
} from '@/modules/attendance/actions/getDailyAttendance'
import { useDateNavigation } from '@/modules/attendance/hooks/useDateNavigation'
import { usePagination } from '@/hooks/usePagination'
import { Avatar } from '@/components/ui/Avatar'
import { Pagination } from '@/components/ui/Pagination'
import { ManualMarkModal } from '@/modules/attendance/components/ManualMarkModal'
import type { MarkType } from '@/modules/attendance/lib/marks'
import { IconButton } from '@/components/ui/IconButton'
import { DatePickerButton } from '@/components/ui/DatePickerButton'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { META_LABEL, TABLE_HEAD, TABLE_ROW, TABLE_SCROLL, TABLE_TH } from '@/components/ui/styles'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

interface DailyAttendanceTableProps {
  dateISO: string
  rows: DailyAttendanceRow[]
  canWrite: boolean
}

interface EditingTarget {
  row: DailyAttendanceRow
  tipo: MarkType
}

const MARK_FIELD: Record<
  MarkType,
  keyof Pick<DailyAttendanceRow, 'entrada' | 'salida' | 'inicioAlmuerzo' | 'finAlmuerzo'>
> = {
  entrada: 'entrada',
  salida: 'salida',
  inicio_almuerzo: 'inicioAlmuerzo',
  fin_almuerzo: 'finAlmuerzo',
}

function formatDay(dateISO: string) {
  return new Intl.DateTimeFormat('es-CR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date(`${dateISO}T00:00:00`))
}

/**
 * Muestra la hora y, solo si viene informada, la diferencia en minutos —
 * como dato neutro (sin colorear "tarde"/"a tiempo"): la tolerancia todavia
 * no esta implementada, y colorear esto seria clasificar sin base.
 */
function MarkCell({
  mark,
  canWrite,
  onEdit,
}: {
  mark: DailyMarkInfo | null
  canWrite: boolean
  onEdit: () => void
}) {
  return (
    <div className="group/celda flex items-center gap-1.5 whitespace-nowrap">
      {mark ? (
        <span className="inline-flex items-baseline gap-1.5">
          <span className="text-[13px] font-semibold tabular-nums text-slate-700">{mark.time}</span>
          {mark.diffMinutes !== null && mark.diffMinutes !== 0 && (
            // Chip neutro, nunca coloreado: separa visualmente el desfase de
            // la hora sin sugerir si estuvo bien o mal. Clasificar es tarea
            // del resumen mensual, que si conoce la tolerancia; aca solo se
            // informa el dato crudo. Sin parentesis, que a 40 celdas por
            // pantalla eran cuatro caracteres de ruido cada uno.
            <span className="rounded bg-slate-100 px-1 py-px text-[10px] font-medium tabular-nums text-slate-500">
              {mark.diffMinutes > 0 ? '+' : ''}
              {mark.diffMinutes}
            </span>
          )}
        </span>
      ) : (
        <span className="text-sm text-slate-300">—</span>
      )}
      {canWrite && (
        <IconButton
          onClick={onEdit}
          aria-label={mark ? 'Corregir marca' : 'Agregar marca'}
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
          className="opacity-0 transition-opacity group-hover/celda:opacity-100 group-focus-within/celda:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
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
 * marcas. Lo rinden las dos ramas, por eso vive aparte.
 */
function EmployeeMeta({ row }: { row: DailyAttendanceRow }) {
  if (!row.position && !row.expectedStart) return null

  return (
    <p className="mt-0.5 text-[11px] text-slate-500">
      {row.position}
      {row.position && row.expectedStart && <span className="text-slate-300"> · </span>}
      {row.expectedStart && <span className="tabular-nums">Entra {row.expectedStart}</span>}
    </p>
  )
}

/**
 * Etiquetas de estado del dia. Vive aparte porque la rendrizan las DOS ramas
 * (cards en movil, tabla en md:) y duplicar las condiciones garantizaba que
 * una se quedara atras al agregar un estado nuevo.
 */
function StatusBadges({ row }: { row: DailyAttendanceRow }) {
  return (
    <>
      {row.isDayOff && (
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
          Dia libre
        </span>
      )}
      {row.isHoliday && (
        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
          Feriado
        </span>
      )}
      {row.isOpen && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
          <AlertTriangle className="h-3 w-3" /> Sin salida
        </span>
      )}
      {row.duplicateMarksCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
          {row.duplicateMarksCount} marca(s) duplicada(s)
        </span>
      )}
    </>
  )
}

/** Las cuatro marcas en el orden de la jornada, para recorrerlas sin repetirlas. */
const MARK_SLOTS: { tipo: MarkType; label: string }[] = [
  { tipo: 'entrada', label: 'Entrada' },
  { tipo: 'inicio_almuerzo', label: 'Inicio almuerzo' },
  { tipo: 'fin_almuerzo', label: 'Fin almuerzo' },
  { tipo: 'salida', label: 'Salida' },
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
  mark,
  canWrite,
  onEdit,
}: {
  label: string
  mark: DailyMarkInfo | null
  canWrite: boolean
  onEdit: () => void
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
        <span className="mt-1 flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-sm font-semibold tabular-nums text-slate-800">{mark.time}</span>
          {mark.diffMinutes !== null && mark.diffMinutes !== 0 && (
            <span className="text-[10px] font-medium tabular-nums text-slate-400">
              {mark.diffMinutes > 0 ? '+' : ''}
              {mark.diffMinutes} min
            </span>
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
      aria-label={`${mark ? 'Corregir' : 'Agregar'} marca de ${label.toLowerCase()}`}
      className={`${shape} outline-none hover:border-brand-300 hover:bg-brand-50/40 focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.97] motion-reduce:active:scale-100`}
    >
      {body}
    </button>
  )
}

export function DailyAttendanceTable({ dateISO, rows, canWrite }: DailyAttendanceTableProps) {
  const { isNavigating, goToPreviousDay, goToNextDay, goToDate } = useDateNavigation(dateISO)
  const [editing, setEditing] = useState<EditingTarget | null>(null)

  const total = rows.length
  const conEntrada = rows.filter((r) => r.entrada !== null).length
  const jornadasAbiertas = rows.filter((r) => r.isOpen).length

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    rows,
    10
  )

  return (
    // `@container`: todo lo de adentro decide contra el ancho REAL disponible,
    // no contra el del viewport. Es la diferencia que importa aca, porque el
    // sidebar mide 256px y ademas se colapsa: a 768px de pantalla el contenido
    // puede tener 512px o 768px segun este abierto o cerrado. Con breakpoints
    // de viewport la tabla aparecia a los 768px de PANTALLA, o sea con 512px
    // reales — mas apretada que en el celular. Asi tambien queda resuelto
    // cualquier tamaño intermedio: tablet, ventana a media pantalla, lo que sea.
    <div className="@container space-y-4">
      {/*
        Una columna o tres, nunca dos. Con `auto-fit` y tres tarjetas, todo
        ancho que da para dos columnas deja la tercera sola ocupando media
        fila — se veia como un error de maquetado. Al medir el contenedor
        (@md = 448px reales) el salto ocurre donde las tres entran de verdad.
      */}
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-3">
        <StatCard icon={Users} label="Colaboradores" value={total} />
        <StatCard
          icon={CalendarDays}
          tone="emerald"
          label="Con entrada marcada"
          value={conEntrada}
        />
        <StatCard
          icon={AlertTriangle}
          tone="amber"
          label="Jornadas sin salida"
          value={jornadasAbiertas}
        />
      </div>

      {/*
        flex-wrap + basis: con los targets tactiles en 44px, los tres botones
        de navegacion mas el titulo ya no entran en una linea angosta. Antes
        de envolver, el titulo se comprime hasta su base de 12rem; pasado ese
        punto los controles bajan enteros en vez de aplastarse.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-sm font-bold capitalize text-slate-900">{formatDay(dateISO)}</h2>
          <p className="truncate text-xs text-slate-500">Marcas de asistencia del dia.</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton onClick={goToPreviousDay} disabled={isNavigating} aria-label="Dia anterior">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
          <IconButton onClick={goToNextDay} disabled={isNavigating} aria-label="Dia siguiente">
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

      {rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No hay colaboradores activos en esta sucursal"
          description="Verifica que existan contratos activos asignados a esta sucursal."
        />
      ) : (
        // El marco (borde, fondo, sombra) aparece recien en `md:`: en movil
        // las tarjetas traen el suyo propio, y envolverlas en TABLE_WRAP
        // dibujaba una caja dentro de otra caja. Por eso no usa el token
        // directo — es el unico listado del proyecto con dos presentaciones.
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            Cards mientras el contenedor no llegue a 768px REALES (@3xl), que
            es lo que esta tabla necesita para sus 6 columnas con un boton de
            correccion por marca. Abajo de eso el scroll horizontal esconde
            los encabezados y hay que adivinar que columna se esta mirando.

            `hidden` es display:none, asi que el navegador saca la rama
            inactiva del arbol de accesibilidad: nunca hay contenido duplicado
            para un lector de pantalla, aunque el markup exista dos veces.
          */}
          <ul className="space-y-3 @3xl:hidden">
            {paginatedItems.map((row, index) => {
              const marcadas = MARK_SLOTS.filter((s) => row[MARK_FIELD[s.tipo]] !== null).length

              return (
                <li
                  key={row.employmentHistoryId}
                  // Entrada escalonada: las tarjetas aparecen en cascada en vez
                  // de todas de golpe, lo que ayuda a leerlas como una lista
                  // ordenada. Se corta a los 6 elementos para que la ultima
                  // tarjeta de una pagina no se haga esperar medio segundo.
                  style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                  className="animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
                >
                  {/*
                    El nombre se queda con el ancho completo y envuelve en vez
                    de cortarse: en una lista de colaboradores el apellido es
                    justo lo que distingue a dos personas, y truncarlo puede
                    dejar dos filas identicas. La hora esperada bajo a la
                    linea de meta, igual que en la tabla.
                  */}
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Avatar size="sm" fotoUrl={row.fotoUrl} nombre={row.fullName} />
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-slate-800">
                        {row.fullName}
                      </p>
                      <EmployeeMeta row={row} />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {MARK_SLOTS.map(({ tipo, label }) => (
                      <MarkTile
                        key={tipo}
                        label={label}
                        mark={row[MARK_FIELD[tipo]]}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo })}
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                    <span className="text-[11px] font-medium tabular-nums text-slate-400">
                      {marcadas} de 4 marcas
                    </span>
                    <StatusBadges row={row} />
                  </div>
                </li>
              )
            })}
          </ul>

          <div className={`hidden @3xl:block ${TABLE_SCROLL}`}>
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Colaborador</th>
                  <th className={TABLE_TH}>Entrada</th>
                  <th className={TABLE_TH}>Inicio almuerzo</th>
                  <th className={TABLE_TH}>Fin almuerzo</th>
                  <th className={TABLE_TH}>Salida</th>
                  <th className={TABLE_TH}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((row) => (
                  <tr key={row.employmentHistoryId} className={TABLE_ROW}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar size="sm" fotoUrl={row.fotoUrl} nombre={row.fullName} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800">{row.fullName}</p>
                          <EmployeeMeta row={row} />
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.entrada}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'entrada' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.inicioAlmuerzo}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'inicio_almuerzo' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.finAlmuerzo}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'fin_almuerzo' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <MarkCell
                        mark={row.salida}
                        canWrite={canWrite}
                        onEdit={() => setEditing({ row, tipo: 'salida' })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap items-center gap-1">
                        <StatusBadges row={row} />
                      </div>
                    </td>
                  </tr>
                ))}
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
      )}

      {editing &&
        (() => {
          const mark = editing.row[MARK_FIELD[editing.tipo]]
          return (
            <ManualMarkModal
              employmentHistoryId={editing.row.employmentHistoryId}
              employeeId={editing.row.employeeId}
              employeeName={editing.row.fullName}
              sucursalId={editing.row.branchId}
              tipo={editing.tipo}
              markId={mark?.id ?? null}
              currentFechaHora={mark ? `${dateISO} ${mark.time}:00` : null}
              defaultDateISO={dateISO}
              onClose={() => setEditing(null)}
            />
          )
        })()}
    </div>
  )
}
