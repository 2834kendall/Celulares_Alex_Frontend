'use client'

import { useState } from 'react'
import { AlertTriangle, Loader2, Save } from 'lucide-react'
import type { EvaluationNotes } from '@/modules/evaluations/types'
import { updateEvaluationNotes } from '@/modules/evaluations/actions/updateEvaluationNotes'
import { Modal } from './Modal'
import { NotesListInput } from './NotesListInput'

export type NotesField = 'fortalezas' | 'mejoras' | 'comentarios'

const FIELD_META: Record<NotesField, { title: string; subtitle: string; placeholder: string }> = {
  fortalezas: {
    title: 'Agregar puntos fuertes',
    subtitle: 'Registre las fortalezas detectadas en la evaluación de este colaborador.',
    placeholder: 'Ej: Compromiso con las guardias',
  },
  mejoras: {
    title: 'Agregar aspectos a mejorar',
    subtitle: 'Registre los aspectos a mejorar detectados para este colaborador.',
    placeholder: 'Ej: Orden',
  },
  comentarios: {
    title: 'Agregar comentarios de liderazgo',
    subtitle: 'Observaciones generales sobre la proyección del colaborador.',
    placeholder: 'Ej: Colaborador con excelente proyección interna...',
  },
}

interface EditNotesModalProps {
  evaluationId: number
  field: NotesField
  notes: EvaluationNotes
  onClose: () => void
}

/** Pop-up para completar las notas cualitativas de una evaluacion ya registrada. */
export function EditNotesModal({ evaluationId, field, notes, onClose }: EditNotesModalProps) {
  const [items, setItems] = useState<string[]>(field === 'comentarios' ? [] : notes[field])
  const [comentarios, setComentarios] = useState(notes.comentarios)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const meta = FIELD_META[field]

  async function handleSave() {
    setError(null)
    setIsSaving(true)
    const updated: EvaluationNotes =
      field === 'comentarios' ? { ...notes, comentarios } : { ...notes, [field]: items }
    const result = await updateEvaluationNotes(evaluationId, updated)
    setIsSaving(false)

    if (!result.ok) {
      setError(result.error)
      return
    }

    // revalidatePath('/evaluations') en la accion ya refresca la vista.
    onClose()
  }

  return (
    <Modal title={meta.title} subtitle={meta.subtitle} onClose={onClose}>
      <div className="space-y-3">
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
            <div>{error}</div>
          </div>
        )}

        {field === 'comentarios' ? (
          <textarea
            rows={4}
            value={comentarios}
            disabled={isSaving}
            onChange={(e) => setComentarios(e.target.value)}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50"
            placeholder={meta.placeholder}
          />
        ) : (
          <NotesListInput
            label={field === 'fortalezas' ? 'Puntos fuertes' : 'Aspectos a mejorar'}
            placeholder={meta.placeholder}
            items={items}
            disabled={isSaving}
            onChange={setItems}
          />
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={
            isSaving || (field === 'comentarios' ? !comentarios.trim() : items.length === 0)
          }
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm outline-none transition-all hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" /> Guardar
            </>
          )}
        </button>
      </div>
    </Modal>
  )
}
