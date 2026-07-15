'use client'

import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import type { RubroRow } from '@/modules/evaluations/types'
import { deleteRubro } from '@/modules/evaluations/actions/deleteRubro'
import { useCrudList } from '@/modules/evaluations/hooks/useCrudList'
import { normalizeSearchText } from '@/components/ui/SearchSelect'
import { ConfirmDialog } from './ConfirmDialog'
import { Modal } from './Modal'
import { RubroForm } from './RubroForm'

interface RubrosManagerProps {
  rubros: RubroRow[]
  canWrite: boolean
}

export function RubrosManager({ rubros, canWrite }: RubrosManagerProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<RubroRow>(deleteRubro)

  const [query, setQuery] = useState('')

  const visibleRubros = useMemo(() => {
    const q = normalizeSearchText(query.trim())
    if (!q) return rubros
    return rubros.filter(
      (r) =>
        normalizeSearchText(r.nombre).includes(q) || normalizeSearchText(r.descripcion).includes(q)
    )
  }, [rubros, query])

  const isEditing = editing !== null && editing !== 'new'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">
            Gestión de rubros y criterios de evaluación
          </h2>
          <p className="text-xs text-slate-500">
            Defina, edite o elimine las competencias y rubros de desempeño que se evalúan en cada
            colaborador.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rubros.length > 0 && (
            <div className="flex w-56 max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition focus-within:border-blue-600 focus-within:ring-4 focus-within:ring-blue-600/10">
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar rubro…"
                aria-label="Buscar rubro"
                className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => setEditing('new')}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
            >
              <Plus className="h-3.5 w-3.5" /> Crear rubro
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <ClipboardList className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Rubros activos</p>
            <p className="text-base font-bold tabular-nums text-slate-900">{rubros.length}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Aplicación</p>
            <p className="truncate text-xs font-semibold text-slate-900">
              Cada rubro se refleja en las nuevas evaluaciones y en la vista individual
            </p>
          </div>
        </div>
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

      <div className="min-w-0 space-y-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Rubros activos en evaluaciones
        </h3>

        {rubros.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                Todavía no hay rubros definidos
              </p>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                Cree el primer rubro para poder calificar a los colaboradores en las evaluaciones de
                desempeño.
              </p>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={() => setEditing('new')}
                className="mt-1 flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" /> Crear el primer rubro
              </button>
            )}
          </div>
        ) : visibleRubros.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-8 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
              <Search className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500">
              Ningún rubro coincide con &ldquo;{query.trim()}&rdquo;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRubros.map((rubro) => (
              <div
                key={rubro.areaId}
                className={`group flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-blue-300 hover:shadow-sm ${
                  deletingId === rubro.areaId ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900">{rubro.nombre}</p>
                    <p className="mt-0.5 text-[11px] leading-4 text-slate-500">
                      {rubro.descripcion || 'Sin descripción.'}
                    </p>
                  </div>
                </div>
                {canWrite && (
                  <div className="mt-2.5 flex items-center justify-end gap-1 border-t border-slate-100 pt-2">
                    <button
                      type="button"
                      onClick={() => setEditing(rubro)}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-blue-600 outline-none transition hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => requestDelete(rubro.areaId)}
                      disabled={deletingId === rubro.areaId}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-rose-600 outline-none transition hover:bg-rose-50 focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {editing !== null && (
        <Modal
          title={isEditing ? `Editar rubro: ${editing.nombre}` : 'Crear rubro'}
          subtitle={
            isEditing
              ? 'Actualice el nombre o la descripción del rubro de evaluación.'
              : 'Los rubros nuevos aparecen de inmediato como criterios en la vista individual y en las próximas evaluaciones.'
          }
          onClose={() => setEditing(null)}
        >
          <RubroForm
            key={isEditing ? editing.areaId : 'new'}
            rubro={isEditing ? editing : undefined}
            onSuccess={() => setEditing(null)}
          />
        </Modal>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar rubro"
          message="El rubro dejará de aparecer en las evaluaciones. Si ya tiene calificaciones asociadas se desactivará para conservar el historial."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
