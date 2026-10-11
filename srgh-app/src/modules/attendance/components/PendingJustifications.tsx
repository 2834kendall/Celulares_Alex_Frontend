'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, ClipboardCheck, Loader2 } from 'lucide-react'
import type { MonthlyEmployeeSummary } from '@/modules/attendance/actions/getMonthlyAttendanceSummary'
import {
  buildJustificationQueue,
  type JustificationItem,
} from '@/modules/attendance/lib/pendingJustifications'
import { IncidentRow } from '@/modules/attendance/components/IncidentRow'
import { JustifyTardinessModal } from '@/modules/attendance/components/JustifyTardinessModal'
import { JustifyAbsenceModal } from '@/modules/attendance/components/JustifyAbsenceModal'
import { useMonthNavigation } from '@/modules/attendance/hooks/useMonthNavigation'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { IconButton } from '@/components/ui/IconButton'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'

interface PendingJustificationsProps {
  /** "YYYY-MM-01" — el mismo mes que el resumen mensual. */
  monthISO: string
  rows: MonthlyEmployeeSummary[]
  /** ASISTENCIA_WRITE: justificar tardias. */
  canWrite: boolean
  /** AUSENCIAS_APPROVE: justificar una ausencia es registrar una ausencia aprobada. */
  canJustifyAbsences: boolean
}

type View = 'pendientes' | 'resueltas'

function formatMonth(monthISO: string) {
  const label = new Intl.DateTimeFormat('es-CR', { month: 'long', year: 'numeric' }).format(
    new Date(`${monthISO}T00:00:00`)
  )
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function itemKey(item: JustificationItem) {
  return `${item.kind}-${item.employmentHistoryId}-${item.date}-${item.kind === 'tardia' ? item.day.kind : ''}`
}

/**
 * Bandeja "Por justificar" (SGRH-88): todas las tardias y ausencias del mes
 * que el encargado todavia no resolvio, de todo el personal, en una sola
 * lista con su boton. Separada del resumen mensual a pedido del cliente: el
 * resumen es para consultar como va cada persona; esto es la lista de tareas.
 *
 * "Resueltas" muestra lo ya justificado del mes, para revisar o corregir el
 * motivo de una tardia. Una ausencia justificada no se deshace desde aca:
 * puede cubrir varios dias (una incapacidad), y se maneja en Horarios.
 */
export function PendingJustifications({
  monthISO,
  rows,
  canWrite,
  canJustifyAbsences,
}: PendingJustificationsProps) {
  const { isNavigating, goToPreviousMonth, goToNextMonth } = useMonthNavigation(monthISO)
  const [view, setView] = useState<View>('pendientes')
  const [justifying, setJustifying] = useState<JustificationItem | null>(null)

  const { pending, resolved } = buildJustificationQueue(rows)
  const items = view === 'pendientes' ? pending : resolved

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    items,
    15
  )

  function actionFor(item: JustificationItem) {
    if (item.kind === 'tardia' && canWrite) {
      return (
        <Button
          size="sm"
          variant={item.day.isJustified ? 'secondary' : 'primary'}
          onClick={() => setJustifying(item)}
        >
          {item.day.isJustified ? 'Ver motivo' : 'Justificar'}
        </Button>
      )
    }
    if (item.kind === 'ausencia' && canJustifyAbsences) {
      return (
        <Button size="sm" onClick={() => setJustifying(item)}>
          Justificar
        </Button>
      )
    }
    return undefined
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton onClick={goToPreviousMonth} disabled={isNavigating} aria-label="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </IconButton>
          <h2 className="min-w-0 truncate px-1 text-sm font-bold text-slate-900">
            {formatMonth(monthISO)}
          </h2>
          <IconButton onClick={goToNextMonth} disabled={isNavigating} aria-label="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </IconButton>
          {isNavigating && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
        </div>

        <div
          role="group"
          aria-label="Ver pendientes o resueltas"
          className="inline-flex shrink-0 rounded-xl bg-slate-100 p-0.5 text-xs font-semibold"
        >
          {(
            [
              ['pendientes', `Pendientes (${pending.length})`],
              ['resueltas', `Resueltas (${resolved.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={view === value}
              onClick={() => setView(value)}
              className={`min-h-9 rounded-[10px] px-3 outline-none transition focus-visible:ring-2 focus-visible:ring-brand-600/40 pointer-coarse:min-h-11 ${
                view === value
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            view === 'pendientes'
              ? 'No hay nada pendiente de justificar este mes'
              : 'Todavia no se justifico nada este mes'
          }
          description={
            view === 'pendientes'
              ? 'Las tardias y ausencias nuevas van a aparecer aca.'
              : 'Lo que justifiques desde Pendientes va a quedar aca.'
          }
        />
      ) : (
        <div className="space-y-2">
          <ul className="space-y-1.5">
            {paginatedItems.map((item) => (
              <IncidentRow key={itemKey(item)} item={item} showName action={actionFor(item)} />
            ))}
          </ul>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </div>
      )}

      {justifying?.kind === 'tardia' && (
        <JustifyTardinessModal
          markId={justifying.day.markId!}
          employeeName={justifying.employeeName}
          dateISO={justifying.day.date}
          tipoNombre={justifying.day.tipo.nombre}
          kind={justifying.day.kind}
          diffMinutes={justifying.day.diffMinutes}
          isJustified={justifying.day.isJustified}
          currentJustification={justifying.day.justification}
          onClose={() => setJustifying(null)}
        />
      )}

      {justifying?.kind === 'ausencia' && (
        <JustifyAbsenceModal
          employmentHistoryId={justifying.employmentHistoryId}
          employeeName={justifying.employeeName}
          dateISO={justifying.date}
          onClose={() => setJustifying(null)}
        />
      )}
    </div>
  )
}
