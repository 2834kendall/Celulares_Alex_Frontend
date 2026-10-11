'use client'

import { useState } from 'react'
import { FileText, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import type { AusenciaTypeRow } from '@/modules/absences/types'
import { deleteTipoAusencia } from '@/modules/absences/actions/deleteTipoAusencia'
import { useCrudList } from '@/modules/absences/hooks/useCrudList'
import { CODIGOS_DEL_SISTEMA } from '@/modules/absences/lib/tipoAusenciaErrors'
import { TipoAusenciaForm } from './TipoAusenciaForm'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Badge } from '@/components/ui/Badge'
import { Alert } from '@/components/ui/Alert'
import { Pagination } from '@/components/ui/Pagination'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  TABLE_DESKTOP_WRAP,
  TABLE_HEAD,
  TABLE_TD,
  TABLE_TH,
  TABLE_TH_RIGHT,
  INPUT,
} from '@/components/ui/styles'

const PAGE_SIZE = 10

// Minusculas y sin tildes: "licencia" encuentra "Licencia" y "Médica" se busca como "medica".
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matches(tipo: AusenciaTypeRow, query: string): boolean {
  const haystack = normalize(
    [tipo.tau_nombre, tipo.tau_codigo, tipo.tau_referencia_legal ?? ''].join(' ')
  )
  return query.split(/\s+/).every((term) => haystack.includes(term))
}

function patronoLabel(tipo: AusenciaTypeRow): string {
  if (tipo.tau_paga_empleador_dias === 0 && tipo.tau_porcentaje_pago_empleador === 0)
    return 'No paga'
  const dias = tipo.tau_paga_empleador_dias
  const pct = `${tipo.tau_porcentaje_pago_empleador}%`
  return dias > 0 ? `${dias} ${dias === 1 ? 'día' : 'días'} al ${pct}` : `${pct} del salario`
}

function subsidioLabel(tipo: AusenciaTypeRow): string {
  if (tipo.tau_paga_ccss_desde_dia === null || tipo.tau_porcentaje_subsidio_ccss === null)
    return '—'
  return `Desde el día ${tipo.tau_paga_ccss_desde_dia} al ${tipo.tau_porcentaje_subsidio_ccss}%`
}

function Flags({ tipo }: { tipo: AusenciaTypeRow }) {
  return (
    <div className="flex flex-wrap gap-1">
      {tipo.tau_requiere_documento_ccss && (
        <Badge tone="blue" size="xs">
          Boleta CCSS
        </Badge>
      )}
      {tipo.tau_descuenta_vacaciones && (
        <Badge tone="amber" size="xs">
          Descuenta vacaciones
        </Badge>
      )}
      {tipo.tau_es_protegida && (
        <Badge tone="emerald" size="xs">
          Protegida
        </Badge>
      )}
      {tipo.tau_es_intradia && (
        <Badge tone="slate" size="xs">
          Por horas
        </Badge>
      )}
    </div>
  )
}

interface TiposAusenciaListProps {
  tipos: AusenciaTypeRow[]
  canWrite: boolean
}

// Catalogo global de incapacidades, licencias y permisos: lo leen todas las empresas.
export function TiposAusenciaList({ tipos, canWrite }: TiposAusenciaListProps) {
  const {
    editing,
    setEditing,
    deletingId,
    confirmingId,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useCrudList<AusenciaTypeRow>(deleteTipoAusencia)

  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const normalizedQuery = normalize(query)
  const filtrados = normalizedQuery ? tipos.filter((t) => matches(t, normalizedQuery)) : tipos
  const totalPages = Math.max(1, Math.ceil(filtrados.length / PAGE_SIZE))
  // Tras borrar o filtrar puede sobrar una pagina: se acota en vez de mostrar una vacia.
  const currentPage = Math.min(page, totalPages)
  const visibles = filtrados.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const confirmando = tipos.find((t) => t.tau_id === confirmingId)
  // El tipo del que depende la nómina no se ofrece borrar: la action lo rechazaría igual.
  const puedeBorrar = (tipo: AusenciaTypeRow) => canWrite && !CODIGOS_DEL_SISTEMA[tipo.tau_codigo]

  return (
    <div className="@container space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-slate-900">Tipos de incapacidad y permisos</h2>
          <p className="text-xs text-slate-500">
            Se eligen al registrar una ausencia en Horarios. Los cambios aplican a todas las
            sucursales.
          </p>
        </div>
        {canWrite && (
          <Button onClick={() => setEditing('new')} className="shrink-0">
            <Plus className="h-3.5 w-3.5" /> Nuevo tipo
          </Button>
        )}
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
            {editing === 'new' ? 'Nuevo tipo de ausencia' : `Editar: ${editing.tau_nombre}`}
          </h3>
          <TipoAusenciaForm
            // La key reinicia el formulario al saltar de un tipo a otro.
            key={editing === 'new' ? 'new' : editing.tau_id}
            tipo={editing === 'new' ? undefined : editing}
            onSuccess={() => setEditing(null)}
          />
        </div>
      )}

      {tipos.length > 0 && (
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setPage(1)
            }}
            aria-label="Buscar tipo de ausencia"
            placeholder="Buscar por nombre, código o referencia legal"
            className={`${INPUT} pl-9`}
          />
        </div>
      )}

      {tipos.length === 0 ? (
        !editing && (
          <EmptyState
            icon={FileText}
            title="No hay tipos de ausencia"
            description="Sin tipos no se puede registrar ninguna incapacidad ni permiso."
            action={
              canWrite && (
                <Button onClick={() => setEditing('new')} className="mt-1">
                  <Plus className="h-3.5 w-3.5" /> Crear el primero
                </Button>
              )
            }
          />
        )
      ) : filtrados.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Sin resultados"
          description={`No hay tipos que coincidan con "${query.trim()}".`}
        />
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/* Movil: tarjeta por tipo */}
          <ul className="space-y-3 @3xl:hidden">
            {visibles.map((tipo) => (
              <li
                key={tipo.tau_id}
                className={`space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${
                  deletingId === tipo.tau_id ? 'opacity-50' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{tipo.tau_nombre}</p>
                  <p className="font-mono text-[11px] text-slate-400">{tipo.tau_codigo}</p>
                </div>
                <dl className="space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Patrono</dt>
                    <dd className="tabular-nums">{patronoLabel(tipo)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">CCSS / INS</dt>
                    <dd className="tabular-nums">{subsidioLabel(tipo)}</dd>
                  </div>
                </dl>
                <Flags tipo={tipo} />
                {canWrite && (
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <IconButton onClick={() => setEditing(tipo)} aria-label="Editar" tone="blue">
                      <Pencil className="h-3.5 w-3.5" />
                    </IconButton>
                    {puedeBorrar(tipo) && (
                      <IconButton
                        onClick={() => requestDelete(tipo.tau_id)}
                        disabled={deletingId === tipo.tau_id}
                        aria-label="Eliminar"
                        tone="rose"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </IconButton>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className={TABLE_DESKTOP_WRAP}>
            <table className="w-full text-xs">
              <thead className={TABLE_HEAD}>
                <tr>
                  <th className={TABLE_TH}>Tipo</th>
                  <th className={TABLE_TH}>Patrono</th>
                  <th className={TABLE_TH}>CCSS / INS</th>
                  <th className={TABLE_TH}>Características</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {visibles.map((tipo) => (
                  <tr
                    key={tipo.tau_id}
                    className={`border-t border-slate-100 transition hover:bg-slate-50/70 ${
                      deletingId === tipo.tau_id ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{tipo.tau_nombre}</p>
                      <p className="font-mono text-[10px] text-slate-400">{tipo.tau_codigo}</p>
                    </td>
                    <td className={`${TABLE_TD} tabular-nums`}>{patronoLabel(tipo)}</td>
                    <td className={`${TABLE_TD} tabular-nums`}>{subsidioLabel(tipo)}</td>
                    <td className="px-3 py-2">
                      <Flags tipo={tipo} />
                    </td>
                    {canWrite && (
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            onClick={() => setEditing(tipo)}
                            aria-label="Editar"
                            tone="blue"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </IconButton>
                          {puedeBorrar(tipo) && (
                            <IconButton
                              onClick={() => requestDelete(tipo.tau_id)}
                              disabled={deletingId === tipo.tau_id}
                              aria-label="Eliminar"
                              tone="rose"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={currentPage}
            totalPages={totalPages}
            onPrevious={() => setPage(currentPage - 1)}
            onNext={() => setPage(currentPage + 1)}
          />
        </div>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Eliminar tipo de ausencia"
          message={`Se eliminará "${confirmando.tau_nombre}" del catálogo. Si ya hay ausencias registradas con este tipo, no se podrá eliminar.`}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}
