'use client'

import { useState } from 'react'
import { Loader2, Save } from 'lucide-react'
import type { EvaluationNotes } from '@/modules/evaluations/types'
import { updateEvaluationNotes } from '@/modules/evaluations/actions/updateEvaluationNotes'
import { Modal } from '@/components/ui/Modal'
import { NotesListInput } from './NotesListInput'
import { Button } from '@/components/ui/Button'
import { SPINNER } from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'

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

// Pop-up para completar las notas cualitativas de una evaluacion ya registrada.
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
          <Alert>
            <div>{error}</div>
          </Alert>
        )}

        {field === 'comentarios' ? (
          <textarea
            rows={4}
            value={comentarios}
            disabled={isSaving}
            onChange={(e) => setComentarios(e.target.value)}
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:bg-slate-50"
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

        <Button
          onClick={handleSave}
          disabled={
            isSaving || (field === 'comentarios' ? !comentarios.trim() : items.length === 0)
          }
          size="lg"
          block
        >
          {isSaving ? (
            <>
              <Loader2 className={SPINNER} /> Guardando
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" /> Guardar
            </>
          )}
        </Button>
      </div>
    </Modal>
  )
}
