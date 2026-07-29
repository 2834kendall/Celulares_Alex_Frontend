'use client'

import { useState } from 'react'
import { createAusenciasBulk } from '@/modules/absences/actions/createAusenciasBulk'
import { updateAusencia } from '@/modules/absences/actions/updateAusencia'
import { deleteAusencia } from '@/modules/absences/actions/deleteAusencia'
import type { AusenciaTypeRow } from '@/modules/absences/types'
import type { AusenciaWeekRow } from '@/modules/absences/actions/getAusenciasForWeek'

interface UseAbsencesPanelParams {
  ausenciaTypes: AusenciaTypeRow[]
}

export interface AusenciaRange {
  fechaInicio: string
  fechaFin: string
}

const EMPTY_RANGE: AusenciaRange = { fechaInicio: '', fechaFin: '' }

const EMPTY_FORM = {
  employmentHistoryId: '',
  tipoAusenciaId: '',
  /** Una incapacidad puede cubrir periodos no continuos; siempre hay al menos uno. */
  ranges: [EMPTY_RANGE] as AusenciaRange[],
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

  function setRangeField(index: number, key: keyof AusenciaRange, value: string) {
    setSuccessMessage(null)
    setForm((prev) => ({
      ...prev,
      ranges: prev.ranges.map((range, i) => (i === index ? { ...range, [key]: value } : range)),
    }))
  }

  function addRange() {
    setSuccessMessage(null)
    setForm((prev) => ({ ...prev, ranges: [...prev.ranges, { ...EMPTY_RANGE }] }))
  }

  /** Nunca deja el formulario sin periodos: el ultimo se vacia en vez de quitarse. */
  function removeRange(index: number) {
    setSuccessMessage(null)
    setForm((prev) => ({
      ...prev,
      ranges:
        prev.ranges.length === 1 ? [{ ...EMPTY_RANGE }] : prev.ranges.filter((_, i) => i !== index),
    }))
  }

  function startEdit(ausencia: AusenciaWeekRow) {
    setFormError(null)
    setSuccessMessage(null)
    setEditingId(ausencia.ausenciaId)
    setForm({
      employmentHistoryId: String(ausencia.employmentHistoryId),
      tipoAusenciaId: String(ausencia.tipoAusenciaId),
      ranges: [{ fechaInicio: ausencia.fechaInicio, fechaFin: ausencia.fechaFin }],
      numeroBoletaCcss: ausencia.numeroBoletaCcss ?? '',
      observaciones: ausencia.observaciones ?? '',
    })
  }

  function cancelEdit() {
    setEditingId(null)
    setFormError(null)
    setForm({ ...EMPTY_FORM, ranges: [{ ...EMPTY_RANGE }] })
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
    if (form.ranges.some((range) => !range.fechaInicio || !range.fechaFin)) {
      setFormError('Indique la fecha de inicio y la fecha final de cada periodo.')
      return
    }

    if (form.ranges.some((range) => range.fechaFin < range.fechaInicio)) {
      setFormError('La fecha final debe ser igual o posterior a la fecha de inicio.')
      return
    }

    const common = {
      employmentHistoryId,
      tipoAusenciaId,
      numeroBoletaCcss: form.numeroBoletaCcss.trim() || undefined,
      observaciones: form.observaciones.trim() || undefined,
    }

    setIsSubmitting(true)
    // Al editar se trabaja sobre un unico registro, que es un solo periodo.
    const result = editingId
      ? await updateAusencia(editingId, { ...common, ...form.ranges[0] })
      : await createAusenciasBulk({ ...common, ranges: form.ranges })
    setIsSubmitting(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    const wasEditing = editingId !== null
    const savedRanges = form.ranges.length
    setEditingId(null)
    setForm({ ...EMPTY_FORM, ranges: [{ ...EMPTY_RANGE }] })
    setSuccessMessage(
      wasEditing
        ? 'Cambios guardados. La matriz de horarios ya los refleja.'
        : savedRanges > 1
          ? `${savedRanges} periodos guardados. La matriz de horarios ya refleja este cambio.`
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
    setRangeField,
    addRange,
    removeRange,
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
