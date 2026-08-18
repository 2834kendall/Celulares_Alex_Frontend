'use client'

import { useState } from 'react'

type DeleteResult = { ok: true } | { ok: false; error: string }

/**
 * Estado compartido de las listas CRUD del modulo (puestos): panel de
 * edicion inline, confirmacion de borrado y su error.
 * Duplicado a proposito de modules/schedules/hooks/useCrudList — cada modulo
 * de negocio es independiente (ver SGRH_Frontend_Architecture.md, seccion 1).
 */
export function useCrudList<T>(deleteAction: (id: number) => Promise<DeleteResult>) {
  const [editing, setEditing] = useState<T | 'new' | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [confirmingId, setConfirmingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function requestDelete(id: number) {
    setConfirmingId(id)
  }

  function cancelDelete() {
    setConfirmingId(null)
  }

  async function confirmDelete() {
    if (confirmingId === null) return
    const id = confirmingId
    setConfirmingId(null)
    setDeleteError(null)
    setDeletingId(id)
    const result = await deleteAction(id)
    setDeletingId(null)
    if (!result.ok) setDeleteError(result.error)
  }

  return {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
