'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { RubroSeleccionRow } from '@/modules/recruitment/types'
import { deleteCriterioSeleccion } from '@/modules/recruitment/actions/deleteCriterioSeleccion'
import { useCrudList } from '@/modules/recruitment/hooks/useCrudList'
import { normalizeSearchText } from '@/components/ui/SearchSelect'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { RubroSeleccionForm } from './RubroSeleccionForm'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

interface RubrosSeleccionManagerProps {
  rubros: RubroSeleccionRow[]
  canWrite: boolean
}

/** Administración del catálogo de criterios de puntaje (SGRH-61), mismo layout que RubrosManager en evaluations. */
export function RubrosSeleccionManager({ rubros, canWrite }: RubrosSeleccionManagerProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<RubroSeleccionRow>(deleteCriterioSeleccion)

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
    <div className="@container space-y-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-900">Criterios de puntaje de candidatos</h2>
        <p className="text-xs text-slate-500">
          Defina, edite o elimine los criterios con los que RRHH compara candidatos de una misma
          postulación.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rubros.length > 0 && (
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-slate-300 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/10 pointer-coarse:min-h-11">
            <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar criterio…"
              aria-label="Buscar criterio"
              className="min-w-0 flex-1 bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400"
            />
          </div>
        )}
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Crear criterio
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2">
        <StatCard icon={ClipboardList} label="Criterios activos" value={rubros.length} hoverable />
        <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-slate-300">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium text-slate-500">Aplicación</p>
            <p className="truncate text-xs font-semibold text-slate-900">
              Cada criterio aparece de inmediato en el puntaje de las postulaciones
            </p>
          </div>
        </div>
      </div>

      {deleteError && (
        <Alert>
          <div>{deleteError}</div>
        </Alert>
      )}

      <div className="min-w-0 space-y-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Criterios activos en el puntaje
        </h3>

        {rubros.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Todavía no hay criterios definidos"
            description="Cree el primer criterio para poder calificar y comparar candidatos."
            action={
              canWrite && (
                <Button onClick={() => setEditing('new')} className="mt-1">
                  <Plus className="h-3.5 w-3.5" /> Crear el primer criterio
                </Button>
              )
            }
          />
        ) : visibleRubros.length === 0 ? (
          <EmptyState icon={Search} title={`Ningún criterio coincide con “${query.trim()}”.`} />
        ) : (
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRubros.map((rubro) => (
              <div
                key={rubro.areaId}
                className={`group flex flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,.04)] transition hover:border-brand-300 hover:shadow-sm ${
                  deletingId === rubro.areaId ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-brand-600"
                    style={
                      rubro.color
                        ? { backgroundColor: rubro.color, color: '#1e293b' }
                        : { backgroundColor: 'var(--color-brand-50, #eff6ff)' }
                    }
                  >
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900">{rubro.nombre}</p>
                      {/* El peso solo se anuncia cuando NO es el normal: un
                          "×1" en todas las tarjetas sería ruido. */}
                      {rubro.peso !== 1 && (
                        <Badge tone="amber" size="xs">
                          ×{rubro.peso}
                        </Badge>
                      )}
                    </div>
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
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 outline-none transition hover:bg-brand-50 focus-visible:ring-2 focus-visible:ring-brand-500/60"
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
          title={isEditing ? `Editar criterio: ${editing.nombre}` : 'Crear criterio'}
          subtitle={
            isEditing
              ? 'Actualice el nombre o la descripción del criterio de selección.'
              : 'Los criterios nuevos aparecen de inmediato en el puntaje de las postulaciones activas.'
          }
          onClose={() => setEditing(null)}
        >
          <RubroSeleccionForm
            key={isEditing ? editing.areaId : 'new'}
            rubro={isEditing ? editing : undefined}
            onSuccess={() => setEditing(null)}
          />
        </Modal>
      )}

      {confirmingId !== null && (
        <ConfirmDialog
          title="Eliminar criterio"
          message="El criterio dejará de aparecer en el puntaje. Si ya tiene calificaciones asociadas se desactivará para conservar el historial."
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
