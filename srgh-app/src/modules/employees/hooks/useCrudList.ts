'use client'

import { useState } from 'react'

type DeleteResult = { ok: true } | { ok: false; error: string }

/**
 * Estado compartido de listas CRUD del módulo (documentos): panel de edición
 * y confirmación de borrado. Copia local del mismo hook de evaluations/
 * schedules/payroll — cada módulo lo duplica a propósito en vez de
 * compartirlo cross-módulo (precedente ya establecido en el repo).
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

  // A diferencia del hook original (evaluations/schedules/payroll, que solo
  // muestra el error inline y nunca confirma con un toast), esta copia
  // devuelve el resultado: la sección de documentos necesita saber si borró
  // con éxito para mostrar el toast de confirmación.
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
