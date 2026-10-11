'use client'

import { useState } from 'react'

type DeleteResult = { ok: true } | { ok: false; error: string }

/**
 * Estado compartido de las listas CRUD del módulo (criterios de selección):
 * panel de edición inline, confirmación de borrado y su error. Mismo hook
 * que evaluations/hooks/useCrudList.ts — se duplica en vez de importarse
 * cruzado porque es genérico y cada módulo es dueño de sus propios hooks.
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

  // Devuelve el resultado (como el hook de employees) para que quien llama
  // pueda confirmar con un toast: antes un borrado exitoso no decía nada.
  async function confirmDelete(): Promise<DeleteResult> {
    if (confirmingId === null) return { ok: false, error: 'Nada que eliminar.' }
    const id = confirmingId
    setConfirmingId(null)
    setDeleteError(null)
    setDeletingId(id)
    const result = await deleteAction(id)
    setDeletingId(null)
    if (!result.ok) setDeleteError(result.error)
    return result
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
