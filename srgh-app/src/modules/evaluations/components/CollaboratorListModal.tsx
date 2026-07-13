'use client'

import { UserRound } from 'lucide-react'
import type { CollaboratorRow } from '@/modules/evaluations/types'
import { initialsOf } from '@/modules/evaluations/lib/scoring'
import { usePagination } from '@/modules/evaluations/hooks/usePagination'
import { Modal } from './Modal'
import { Pagination } from '@/components/ui/Pagination'
import { ScoreBadge } from './ScoreBadge'

interface CollaboratorListModalProps {
  title: string
  subtitle: string
  emptyMessage: string
  collaborators: CollaboratorRow[]
  onClose: () => void
  onSelect: (labId: number) => void
}

/** Listado emergente de colaboradores (pendientes, bajo rendimiento), paginado a 8. */
export function CollaboratorListModal({
  title,
  subtitle,
  emptyMessage,
  collaborators,
  onClose,
  onSelect,
}: CollaboratorListModalProps) {
  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    collaborators,
    8
  )

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      {collaborators.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <UserRound className="h-4 w-4" />
          </div>
          <p className="text-xs text-slate-500">{emptyMessage}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <ul className="divide-y divide-slate-100">
            {paginatedItems.map((c) => (
              <li key={c.labId}>
                <button
                  type="button"
                  onClick={() => onSelect(c.labId)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left outline-none transition hover:bg-slate-50 focus-visible:bg-blue-50"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold text-blue-700">
                    {initialsOf(c.fullName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {c.fullName}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      {c.position ?? 'Sin puesto'} • {c.branchName}
                    </span>
                  </span>
                  <ScoreBadge score={c.evaluation?.promedio ?? null} />
                </button>
              </li>
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
    </Modal>
  )
}
