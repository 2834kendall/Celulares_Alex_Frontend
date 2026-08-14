'use client'

import { Coins, FileSpreadsheet, Pencil, Plus, Trash2, X } from 'lucide-react'
import type { ConceptoNominaRow } from '@/modules/payroll/types'
import { deleteConcepto } from '@/modules/payroll/actions/deleteConcepto'
import { useCrudList } from '@/modules/payroll/hooks/useCrudList'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ConceptoForm } from './ConceptoForm'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import {
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TD_STRONG,
  TABLE_TH,
  TABLE_TH_RIGHT,
  TABLE_WRAP,
} from '@/components/ui/styles'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { Badge } from '@/components/ui/Badge'

interface ConceptosListProps {
  conceptos: ConceptoNominaRow[]
  canWrite: boolean
}

const TIPO_LABELS: Record<string, string> = {
  ingreso: 'Ingreso',
  deduccion: 'Deducción',
  patronal: 'Carga patronal',
}

// Un concepto de tipo "monto manual" (ingreso o deducción) se convierte en
// una columna editable de la plantilla de Excel; los de "% del bruto" y
// "horas extra automático" se calculan solos, no son una columna.
const ES_COLUMNA_EXCEL = new Set(['monto_manual_ingreso', 'monto_manual_deduccion'])

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
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo concepto
          </Button>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs text-blue-800">
        <FileSpreadsheet className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
        <p>
          Todo concepto <span className="font-semibold">activo</span> aparece en la próxima
          plantilla de Excel que se descargue. Los marcados con{' '}
          <span className="font-semibold">&ldquo;Excel&rdquo;</span> (ingreso o deducción de monto
          manual) salen como una columna que se llena a mano; los demás (% del bruto, horas extra
          automático) se calculan solos, igual que en la edición manual. Si desactivas un concepto,
          deja de aparecer en la próxima planilla.
        </p>
      </div>

      {deleteError && (
        <Alert>
          <div>{deleteError}</div>
        </Alert>
      )}

      {editing && (
        <div className="relative rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm sm:p-4">
          <IconButton
            onClick={() => setEditing(null)}
            aria-label="Cerrar formulario"
            className="absolute right-3.5 top-3.5"
          >
            <X className="h-3.5 w-3.5" />
          </IconButton>
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
        <EmptyState
          icon={Coins}
          title="No hay conceptos de nómina"
          description="Crea el primero (por ejemplo, BASE o CCSS_OBRERA) para poder procesar planillas."
          action={
            canWrite && (
              <Button onClick={() => setEditing('new')} className="mt-1">
                <Plus className="h-3.5 w-3.5" /> Crear el primero
              </Button>
            )
          }
        />
      ) : (
        <div className={TABLE_WRAP}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Código</th>
                  <th className={TABLE_TH}>Nombre</th>
                  <th className={TABLE_TH}>Tipo</th>
                  <th className={TABLE_TH}>Afecta bruto</th>
                  <th className={TABLE_TH}>Afecta CCSS</th>
                  <th className={TABLE_TH}>Estado</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
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
                    <td className={TABLE_TD_STRONG}>
                      <div className="flex items-center gap-1.5">
                        {concepto.con_codigo}
                        {ES_COLUMNA_EXCEL.has(concepto.con_tipo_calculo) && (
                          <span
                            title="Es una columna editable en la plantilla de Excel"
                            className="inline-flex items-center rounded-full bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-blue-700"
                          >
                            Excel
                          </span>
                        )}
                      </div>
                    </td>
                    <td className={TABLE_TD}>{concepto.con_nombre}</td>
                    <td className={TABLE_TD}>
                      {TIPO_LABELS[concepto.con_tipo] ?? concepto.con_tipo}
                    </td>
                    <td className={TABLE_TD}>{concepto.con_afecta_salario_bruto ? 'Sí' : 'No'}</td>
                    <td className={TABLE_TD}>{concepto.con_afecta_base_ccss ? 'Sí' : 'No'}</td>
                    <td className="px-3 py-2">
                      <Badge tone={concepto.con_activo ? 'emerald' : 'slate'}>
                        {concepto.con_activo ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            onClick={() => setEditing(concepto)}
                            aria-label="Editar"
                            tone="blue"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          <IconButton
                            onClick={() => requestDelete(concepto.con_id)}
                            disabled={deletingId === concepto.con_id}
                            aria-label="Eliminar"
                            tone="rose"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </IconButton>
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
