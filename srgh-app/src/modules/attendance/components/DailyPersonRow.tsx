'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Hora } from '@/components/ui/Hora'
import { IconButton } from '@/components/ui/IconButton'
import type {
  DailyAttendanceRow,
  DailyMarkInfo,
  DailyScheduledBlock,
} from '@/modules/attendance/actions/getDailyAttendance'
import type { DayStatusKind } from '@/modules/attendance/lib/dayStatus'
import { DayStatusBadge } from './DayStatusBadge'

type ActionMark = 'entrada' | 'salida'

const PRIMARY_ACTION = {
  sin_marcar: 'entrada',
  sin_salida: 'salida',
  en_jornada: 'salida',
  ya_salio: null,
  por_llegar: 'entrada',
  justificada: null,
  libre: null,
  sin_programacion: null,
} satisfies Record<DayStatusKind, ActionMark | null>

interface DailyPersonRowProps {
  row: DailyAttendanceRow
  canWrite: boolean
  onAddMark: (type: ActionMark, block?: DailyScheduledBlock) => void
  children: ReactNode
}

function latestMark(row: DailyAttendanceRow) {
  const entries = row.blocks.map((block) => block.entrada)
  const exits = row.blocks.map((block) => block.salida)
  for (const block of row.scheduledBlocks) {
    if (block.entrada) entries.push(block.entrada)
    exits.push(block.salida)
  }

  const candidates: [label: string, mark: DailyMarkInfo | null][] = [
    ...[row.entrada, ...entries].map((mark): [string, DailyMarkInfo | null] => ['Entró', mark]),
    ['Inició el receso', row.inicioReceso],
    ['Volvió del receso', row.finReceso],
    ['Inició el almuerzo', row.inicioAlmuerzo],
    ['Volvió del almuerzo', row.finAlmuerzo],
    ...[row.salida, ...exits].map((mark): [string, DailyMarkInfo | null] => ['Salió', mark]),
  ]

  let latest: { label: string; time: string } | null = null
  for (const [label, mark] of candidates) {
    if (mark && (!latest || mark.time >= latest.time)) latest = { label, time: mark.time }
  }
  return latest
}

function blockForAction(blocks: DailyScheduledBlock[], action: ActionMark) {
  return action === 'entrada'
    ? blocks.find((block) => !block.entrada)
    : blocks.findLast((block) => block.entrada && !block.salida)
}

export function DailyPersonRow({ row, canWrite, onAddMark, children }: DailyPersonRowProps) {
  const [expanded, setExpanded] = useState(false)
  const id = useId()
  const detailsId = `${id}-details`
  const summaryId = `${id}-summary`
  const action = canWrite ? PRIMARY_ACTION[row.status.kind] : null
  const lastMark = latestMark(row)
  const time = lastMark?.time ?? row.expectedStart

  return (
    <li className="min-w-0 rounded-xl bg-white ring-1 ring-slate-200/70">
      <div className="flex min-w-0 items-center gap-1 pr-1.5">
        <IconButton
          aria-label={`Detalle de ${row.fullName}`}
          aria-describedby={summaryId}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded(!expanded)}
          className="relative min-h-16! min-w-0 flex-1 gap-1.5 rounded-xl! text-left active:scale-100!"
        >
          <Avatar size="sm" fotoUrl={row.fotoUrl} nombre={row.fullName} />
          <span className="min-w-0 flex-1">
            {/* El nombre envuelve en vez de cortarse: el apellido es lo que
                distingue a dos personas en la lista. */}
            <span className="block break-words pr-5 text-sm font-semibold text-slate-900">
              {row.fullName}
            </span>
            <span id={summaryId} className="block">
              {row.position && (
                <span className="block truncate text-[11px] leading-4 text-slate-500">
                  {row.position}
                </span>
              )}
              <span className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
                <DayStatusBadge status={row.status} isHoliday={row.isHoliday} />
                {time && (
                  <span className="text-[11px] tabular-nums text-slate-600">
                    {lastMark?.label ?? 'Entra'} <Hora value={time} />
                  </span>
                )}
              </span>
            </span>
          </span>
          <ChevronDown
            className={`absolute right-1.5 top-2 size-3.5 transition-transform motion-reduce:transition-none ${expanded ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </IconButton>
        {action && (
          <Button
            variant="secondary"
            onClick={() => onAddMark(action, blockForAction(row.scheduledBlocks, action))}
            className="min-h-11 shrink-0 px-2! pointer-coarse:min-h-11"
          >
            {action === 'entrada' ? 'Agregar entrada' : 'Agregar salida'}
          </Button>
        )}
      </div>
      <div id={detailsId} hidden={!expanded}>
        {expanded && children}
      </div>
    </li>
  )
}
