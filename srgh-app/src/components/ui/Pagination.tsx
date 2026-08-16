'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { IconButton } from '@/components/ui/IconButton'

interface PaginationProps {
  page: number
  totalPages: number
  onPrevious: () => void
  onNext: () => void
}

/** Prev/next footer shown under a table once it has more than one page. */
export function Pagination({ page, totalPages, onPrevious, onNext }: PaginationProps) {
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
      <p className="text-[11px] text-slate-500">
        Página {page} de {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <IconButton onClick={onPrevious} disabled={page <= 1} aria-label="Página anterior">
          <ChevronLeft className="h-3.5 w-3.5" />
        </IconButton>
        <IconButton onClick={onNext} disabled={page >= totalPages} aria-label="Página siguiente">
          <ChevronRight className="h-3.5 w-3.5" />
        </IconButton>
      </div>
    </div>
  )
}
