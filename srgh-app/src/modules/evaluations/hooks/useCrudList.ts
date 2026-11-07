'use client'

import { useState, type SetStateAction } from 'react'
import { useConfirmLeave } from '@/hooks/useUnsavedChanges'

type DeleteResult = { ok: true } | { ok: false; error: string }

/**
 * Estado compartido de las listas CRUD del modulo (rubros): panel de edicion
 * inline, confirmacion de borrado y su error.
 */
export function useCrudList<T>(deleteAction: (id: number) => Promise<DeleteResult>) {
  const [editing, setEditingState] = useState<T | 'new' | null>(null)
  const confirmLeave = useConfirmLeave()
  const setEditing = (value: SetStateAction<T | 'new' | null>) =>
    confirmLeave(() => setEditingState(value))
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
    try {
      const result = await deleteAction(id)
      if (!result.ok) setDeleteError(result.error)
    } catch {
      setDeleteError('No se pudo eliminar. Reintentá.')
    } finally {
      setDeletingId(null)
    }
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
