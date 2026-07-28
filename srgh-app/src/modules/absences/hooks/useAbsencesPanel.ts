'use client'

import { useState } from 'react'
import { createAusencia } from '@/modules/absences/actions/createAusencia'
import { updateAusencia } from '@/modules/absences/actions/updateAusencia'
import { deleteAusencia } from '@/modules/absences/actions/deleteAusencia'
import type { AusenciaTypeRow } from '@/modules/absences/types'
import type { AusenciaWeekRow } from '@/modules/absences/actions/getAusenciasForWeek'

interface UseAbsencesPanelParams {
  ausenciaTypes: AusenciaTypeRow[]
}

const EMPTY_FORM = {
  employmentHistoryId: '',
  tipoAusenciaId: '',
  fechaInicio: '',
  fechaFin: '',
  numeroBoletaCcss: '',
  observaciones: '',
}

export function useAbsencesPanel({ ausenciaTypes }: UseAbsencesPanelParams) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const selectedType = ausenciaTypes.find((t) => String(t.tau_id) === form.tipoAusenciaId) ?? null

  function setField<K extends keyof typeof EMPTY_FORM>(key: K, value: (typeof EMPTY_FORM)[K]) {
    setSuccessMessage(null)
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function startEdit(ausencia: AusenciaWeekRow) {
    setFormError(null)
    setSuccessMessage(null)
    setEditingId(ausencia.ausenciaId)
    setForm({
      employmentHistoryId: String(ausencia.employmentHistoryId),
      tipoAusenciaId: String(ausencia.tipoAusenciaId),
      fechaInicio: ausencia.fechaInicio,
      fechaFin: ausencia.fechaFin,
      numeroBoletaCcss: ausencia.numeroBoletaCcss ?? '',
      observaciones: ausencia.observaciones ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setFormError(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit() {
    setFormError(null)
    setSuccessMessage(null)

    const employmentHistoryId = Number(form.employmentHistoryId)
    const tipoAusenciaId = Number(form.tipoAusenciaId)

    if (!employmentHistoryId) {
      setFormError('Seleccione un colaborador.')
      return
    }
    if (!tipoAusenciaId) {
      setFormError('Seleccione un tipo de incapacidad o licencia.')
      return
    }
    if (!form.fechaInicio || !form.fechaFin) {
      setFormError('Indique la fecha de inicio y la fecha final.')
      return
    }

    const payload = {
      employmentHistoryId,
      tipoAusenciaId,
      fechaInicio: form.fechaInicio,
      fechaFin: form.fechaFin,
      numeroBoletaCcss: form.numeroBoletaCcss.trim() || undefined,
      observaciones: form.observaciones.trim() || undefined,
    }

    setIsSubmitting(true)
    const result = editingId
      ? await updateAusencia(editingId, payload)
      : await createAusencia(payload)
    setIsSubmitting(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    const wasEditing = editingId !== null
    setEditingId(null)
    setForm(EMPTY_FORM)
    setSuccessMessage(
      wasEditing
        ? 'Cambios guardados. La matriz de horarios ya los refleja.'
        : 'Registro guardado. La matriz de horarios ya refleja este cambio.'
    )
  }

  function requestDelete(ausenciaId: number) {
    setDeleteError(null)
    setConfirmingDeleteId(ausenciaId)
  }

  function cancelDelete() {
    setConfirmingDeleteId(null)
  }

  async function confirmDelete() {
    if (confirmingDeleteId === null) return
    const id = confirmingDeleteId
    setConfirmingDeleteId(null)
    setDeletingId(id)
    const result = await deleteAusencia(id)
    setDeletingId(null)
    if (!result.ok) setDeleteError(result.error)
    else if (editingId === id) cancelEdit()
  }

  return {
    form,
    setField,
    selectedType,
    editingId,
    startEdit,
    cancelEdit,
    isSubmitting,
    formError,
    successMessage,
    handleSubmit,
    confirmingDeleteId,
    deletingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  }
}
