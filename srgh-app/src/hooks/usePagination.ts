'use client'

import { useMemo, useState } from 'react'

/** Client-side pagination over an already-loaded array. Clamps automatically when items shrink. */
export function usePagination<T>(items: T[], pageSize = 8) {
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const safePage = Math.min(page, totalPages)

  const paginatedItems = useMemo(
    () => items.slice((safePage - 1) * pageSize, safePage * pageSize),
    [items, safePage, pageSize]
  )

  return {
    page: safePage,
    totalPages,
    paginatedItems,
    // Navegar desde safePage (no desde el estado interno): si la lista se
    // encogió por un filtro, el estado puede estar fuera de rango y el primer
    // click quedaría muerto.
    goToPreviousPage: () => setPage(Math.max(1, safePage - 1)),
    goToNextPage: () => setPage(Math.min(totalPages, safePage + 1)),
  }
}
