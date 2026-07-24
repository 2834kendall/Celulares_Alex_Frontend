'use client'

import { AlertTriangle, Coins, FileSpreadsheet, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ConceptoNominaRow } from '@/modules/payroll/types'
import { CONCEPTOS_PLANILLA } from '@/modules/payroll/lib/planilla'
import { deleteConcepto } from '@/modules/payroll/actions/deleteConcepto'
import { useCrudList } from '@/modules/payroll/hooks/useCrudList'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from './ConfirmDialog'
import { ConceptoForm } from './ConceptoForm'

interface ConceptosListProps {
  conceptos: ConceptoNominaRow[]
  canWrite: boolean
}

const TIPO_LABELS: Record<string, string> = {
  ingreso: 'Ingreso',
  deduccion: 'Deducción',
  patronal: 'Carga patronal',
}

const USADOS_POR_PLANTILLA = new Set<string>([
  ...CONCEPTOS_PLANILLA.ingresos,
  CONCEPTOS_PLANILLA.deduccion,
])

export function ConceptosList({ conceptos, canWrite }: ConceptosListProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<ConceptoNominaRow>(deleteConcepto)

  const {
    page,
    totalPages,
    paginatedItems: paginatedConceptos,
    goToPreviousPage,
    goToNextPage,
  } = usePagination(conceptos, 8)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Conceptos de nómina</h2>
          <p className="truncate text-xs text-slate-500">
            Catálogo global de ingresos, deducciones y cargas patronales usados al procesar la
            planilla.
          </p>
        </div>
        {canWrite && (
          <button
            onClick={() => setEditing('new')}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Plus className="h-3.5 w-3.5" /> Nuevo concepto
          </button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-800">
        <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <p>
          Los conceptos marcados con{' '}
          <span className="font-semibold">&ldquo;Usado por la plantilla de Excel&rdquo;</span> son
          las columnas fijas de la planilla (Base, Feriado, Comisión, Horas extra, Ajuste y el
          rebajo de CCSS). Puedes editar su nombre y tipo, pero si desactivas o eliminas alguno la
          subida de Excel dejará de encontrarlo hasta que lo recrees con el mismo código.
        </p>
      </div>

      {deleteError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-500" />
          <div>{deleteError}</div>
        </div>
      )}

      {editing && (
        <div className="relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <button
            onClick={() => setEditing(null)}
            aria-label="Cerrar formulario"
            className="absolute right-3.5 top-3.5 rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <h3 className="mb-3 pr-8 text-sm font-bold text-slate-900">
            {editing === 'new' ? 'Nuevo concepto' : `Editar: ${editing.con_nombre}`}
          </h3>
          <ConceptoForm
            concepto={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {conceptos.length === 0 ? (
        <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
            <Coins className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">No hay conceptos de nómina</p>
            <p className="mt-1 max-w-sm text-xs text-slate-500">
              Crea el primero (por ejemplo, BASE o CCSS_OBRERA) para poder procesar planillas.
            </p>
          </div>
          {canWrite && (
            <button
              onClick={() => setEditing('new')}
              className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Crear el primero
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Código</th>
                  <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                  <th className="px-3 py-2 text-left font-semibold">Tipo</th>
                  <th className="px-3 py-2 text-left font-semibold">Afecta bruto</th>
                  <th className="px-3 py-2 text-left font-semibold">Afecta CCSS</th>
                  <th className="px-3 py-2 text-left font-semibold">Estado</th>
                  {canWrite && <th className="px-3 py-2 text-right font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedConceptos.map((concepto) => (
                  <tr
                    key={concepto.con_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === concepto.con_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2 font-medium text-slate-800">
                      <div className="flex items-center gap-1.5">
                        {concepto.con_codigo}
                        {USADOS_POR_PLANTILLA.has(concepto.con_codigo) && (
                          <span
                            title="Usado por la plantilla de Excel"
                            className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700"
                          >
                            Excel
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{concepto.con_nombre}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {TIPO_LABELS[concepto.con_tipo] ?? concepto.con_tipo}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {concepto.con_afecta_salario_bruto ? 'Sí' : 'No'}
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {concepto.con_afecta_base_ccss ? 'Sí' : 'No'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${
                          concepto.con_activo
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-slate-50 text-slate-600 ring-slate-200'
                        }`}
                      >
                        {concepto.con_activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditing(concepto)}
                            aria-label="Editar"
                            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => requestDelete(concepto.con_id)}
                            disabled={deletingId === concepto.con_id}
                            aria-label="Eliminar"
                            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-rose-50 hover:text-rose-600 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </div>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar concepto"
          message="Si el concepto ya se usó en alguna planilla, se desactivará en vez de borrarse para no perder el historial. Si no se ha usado, se elimina de forma permanente."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
