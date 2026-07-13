'use client'

import { useMemo, useState } from 'react'

/** Paginacion en cliente sobre un arreglo ya cargado. Se ajusta sola si la lista se reduce. */
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
    goToPreviousPage: () => setPage((p) => Math.max(1, p - 1)),
    goToNextPage: () => setPage((p) => Math.min(totalPages, p + 1)),
  }
}
