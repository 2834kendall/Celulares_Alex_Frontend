'use client'

import {
  AlertTriangle,
  CalendarHeart,
  CheckCircle2,
  Info,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { SearchSelect } from '@/components/ui/SearchSelect'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAbsencesPanel } from '@/modules/absences/hooks/useAbsencesPanel'
import type { AusenciaTypeRow, EmployeeOption } from '@/modules/absences/types'
import type { AusenciaWeekRow } from '@/modules/absences/actions/getAusenciasForWeek'

interface AbsencesPanelProps {
  employees: EmployeeOption[]
  ausenciaTypes: AusenciaTypeRow[]
  ausencias: AusenciaWeekRow[]
  canManageAbsences: boolean
}

const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

const LABEL_CLASSES = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

function formatRange(fechaInicio: string, fechaFin: string) {
  const format = (iso: string) =>
    new Intl.DateTimeFormat('es-CR', { day: '2-digit', month: 'short', year: 'numeric' }).format(
      new Date(`${iso}T00:00:00`)
    )
  return fechaInicio === fechaFin
    ? format(fechaInicio)
    : `${format(fechaInicio)} – ${format(fechaFin)}`
}

export function AbsencesPanel({
  employees,
  ausenciaTypes,
  ausencias,
  canManageAbsences,
}: AbsencesPanelProps) {
  const {
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
  } = useAbsencesPanel({ ausenciaTypes })

  function employeeName(employmentHistoryId: number) {
    return employees.find((e) => e.employmentHistoryId === employmentHistoryId)?.fullName ?? '—'
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-linear-to-br from-white via-white to-rose-50/40 p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
            <CalendarHeart className="h-4 w-4" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
              Cumplimiento laboral
            </p>
            <h3 className="text-base font-bold tracking-tight text-slate-900">
              Incapacidades y periodos de lactancia
            </h3>
          </div>
        </div>
      </div>

      {canManageAbsences ? (
        <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)] sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-slate-900">
              {editingId ? 'Editar registro' : 'Nuevo registro'}
            </h4>
            {editingId && (
              <button
                type="button"
                onClick={cancelEdit}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-blue-500/60"
              >
                <X className="h-3 w-3" /> Cancelar edición
              </button>
            )}
          </div>

          {formError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
              <p>{formError}</p>
            </div>
          )}

          {successMessage && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <p>{successMessage}</p>
            </div>
          )}

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL_CLASSES}>Colaborador</label>
              <SearchSelect
                ariaLabel="Buscar colaborador"
                className="w-full"
                value={form.employmentHistoryId}
                onChange={(v) => setField('employmentHistoryId', v)}
                options={employees.map((e) => ({
                  value: String(e.employmentHistoryId),
                  label: e.fullName,
                  sublabel: [e.position, e.branchName].filter(Boolean).join(' • '),
                }))}
              />
            </div>

            <div>
              <label className={LABEL_CLASSES} htmlFor="aus_tipo">
                Tipo
              </label>
              <select
                id="aus_tipo"
                className={INPUT_CLASSES}
                value={form.tipoAusenciaId}
                onChange={(e) => setField('tipoAusenciaId', e.target.value)}
              >
                <option value="">Seleccione un tipo</option>
                {ausenciaTypes.map((t) => (
                  <option key={t.tau_id} value={t.tau_id}>
                    {t.tau_nombre}
                  </option>
                ))}
              </select>
              {selectedType && (
                <p className="mt-1 text-[11px] text-slate-500">
                  {selectedType.tau_referencia_legal}
                  {selectedType.tau_referencia_legal && ' · '}
                  {selectedType.tau_es_intradia
                    ? 'Permiso intradía: conserva el horario, no resta horas.'
                    : 'Día completo: reemplaza el horario y no cuenta horas trabajadas.'}
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className={`${LABEL_CLASSES} mb-0`} htmlFor="aus_fecha_inicio_0">
                  {editingId ? 'Periodo' : 'Periodos'}
                </label>
                {!editingId && (
                  <button
                    type="button"
                    onClick={addRange}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                  >
                    <Plus className="h-3 w-3" /> Agregar periodo
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {form.ranges.map((range, index) => (
                  <div key={index} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <label
                        className="mb-0.5 block text-[10px] text-slate-400"
                        htmlFor={`aus_fecha_inicio_${index}`}
                      >
                        Desde
                      </label>
                      <input
                        id={`aus_fecha_inicio_${index}`}
                        type="date"
                        className={`${INPUT_CLASSES} tabular-nums`}
                        value={range.fechaInicio}
                        max={range.fechaFin || undefined}
                        onChange={(e) => setRangeField(index, 'fechaInicio', e.target.value)}
                      />
                    </div>

                    <div className="min-w-0 flex-1">
                      <label
                        className="mb-0.5 block text-[10px] text-slate-400"
                        htmlFor={`aus_fecha_fin_${index}`}
                      >
                        Hasta
                      </label>
                      <input
                        id={`aus_fecha_fin_${index}`}
                        type="date"
                        className={`${INPUT_CLASSES} tabular-nums`}
                        value={range.fechaFin}
                        min={range.fechaInicio || undefined}
                        onChange={(e) => setRangeField(index, 'fechaFin', e.target.value)}
                      />
                    </div>

                    {!editingId && form.ranges.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRange(index)}
                        aria-label={`Quitar periodo ${index + 1}`}
                        className="mb-1 shrink-0 rounded-full p-1.5 text-slate-400 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {!editingId && form.ranges.length > 1 && (
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Cada periodo se guarda como un registro independiente y se puede editar o eliminar
                  por separado.
                </p>
              )}
            </div>

            {selectedType?.tau_requiere_documento_ccss && (
              <div>
                <label className={LABEL_CLASSES} htmlFor="aus_boleta">
                  Numero de boleta CCSS
                </label>
                <input
                  id="aus_boleta"
                  type="text"
                  className={INPUT_CLASSES}
                  value={form.numeroBoletaCcss}
                  onChange={(e) => setField('numeroBoletaCcss', e.target.value)}
                  placeholder="Ej: 1234567890"
                />
              </div>
            )}

            <div className="sm:col-span-2">
              <label className={LABEL_CLASSES} htmlFor="aus_observaciones">
                Observaciones (opcional)
              </label>
              <textarea
                id="aus_observaciones"
                rows={2}
                className={INPUT_CLASSES}
                value={form.observaciones}
                onChange={(e) => setField('observaciones', e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3.5 flex justify-end">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isSubmitting ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Registrar'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>Tu rol no tiene permiso para registrar o eliminar incapacidades y licencias.</p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="border-b border-slate-100 px-4 py-3">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-900">
            Registradas en la semana visible de la matriz
          </h4>
        </div>

        {deleteError && (
          <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600" />
            <p>{deleteError}</p>
          </div>
        )}

        {ausencias.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-500">
            No hay incapacidades ni periodos de lactancia registrados para esta semana.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ausencias.map((a) => (
              <li
                key={a.ausenciaId}
                className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                  deletingId === a.ausenciaId ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">
                    {employeeName(a.employmentHistoryId)}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {a.tipoNombre} · {formatRange(a.fechaInicio, a.fechaFin)}
                    {a.esIntradia ? ' · permiso intradia' : ''}
                  </p>
                </div>
                {canManageAbsences && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(a)}
                      aria-label="Editar"
                      className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(a.ausenciaId)}
                      disabled={deletingId === a.ausenciaId}
                      aria-label="Eliminar"
                      className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {confirmingDeleteId !== null && (
        <ConfirmDialog
          title="Eliminar registro"
          message="Se eliminara esta incapacidad o licencia y la matriz de horarios liberara esos dias. Esta accion no se puede deshacer."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
