'use client'

import { useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import type { RubroRow } from '@/modules/evaluations/types'
import { deleteRubro } from '@/modules/evaluations/actions/deleteRubro'
import { useCrudList } from '@/modules/evaluations/hooks/useCrudList'
import { normalizeSearchText } from '@/components/ui/SearchSelect'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { RubroForm } from './RubroForm'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { EmptyState } from '@/components/ui/EmptyState'
import { StatCard } from '@/components/ui/StatCard'

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
    // @container: el buscador y el grid de metricas de abajo miden el
    // contenedor real, no el viewport (mismo criterio que el resto del
    // modulo desde que se le metio responsive).
    <div className="@container space-y-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-900">
          Gestión de rubros y criterios de evaluación
        </h2>
        <p className="text-xs text-slate-500">
          Defina, edite o elimine las competencias y rubros de desempeño que se evalúan en cada
          colaborador.
        </p>
      </div>

      {/*
        Antes el buscador tenia w-56 fijo: junto al boton "Crear rubro" en la
        misma fila, ese ancho fijo era justo lo que sobraba para no entrar en
        una pantalla angosta y forzaba el envoltorio feo. `flex-1 basis-56`
        deja que se comprima con el resto en vez de empujar todo a su propia
        fila.
      */}
      <div className="flex flex-wrap items-center gap-2">
        {rubros.length > 0 && (
          <div className="flex min-w-0 flex-1 basis-56 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm transition hover:border-slate-300 focus-within:border-brand-600 focus-within:ring-4 focus-within:ring-brand-600/10 pointer-coarse:min-h-11">
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
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Crear rubro
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-2">
        <StatCard icon={ClipboardList} label="Rubros activos" value={rubros.length} hoverable />
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
        <Alert>
          <div>{deleteError}</div>
        </Alert>
      )}

      <div className="min-w-0 space-y-2.5">
        <h3 className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Rubros activos en evaluaciones
        </h3>

        {rubros.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Todavía no hay rubros definidos"
            description="Cree el primer rubro para poder calificar a los colaboradores en las evaluaciones de desempeño."
            action={
              canWrite && (
                <Button onClick={() => setEditing('new')} className="mt-1">
                  <Plus className="h-3.5 w-3.5" /> Crear el primer rubro
                </Button>
              )
            }
          />
        ) : visibleRubros.length === 0 ? (
          <EmptyState icon={Search} title={`Ningún rubro coincide con “${query.trim()}”.`} />
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
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
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
