'use client'

import { useMemo, useState } from 'react'
import { Inbox, MessagesSquare, Plus, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import type { CatalogoItem } from '@/modules/employees/types'
import { PostulacionCard } from './PostulacionCard'
import { NuevoCandidatoForm } from './NuevoCandidatoForm'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { cn } from '@/lib/utils/cn'

interface RecruitmentBoardProps {
  postulaciones: PostulacionBoardItem[]
  tiposIdentificacion: CatalogoItem[]
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  canWrite: boolean
}

const FASES: { id: 1 | 2 | 3; label: string; icon: LucideIcon }[] = [
  { id: 1, label: 'Postulados', icon: Inbox },
  { id: 2, label: 'En evaluación', icon: MessagesSquare },
  { id: 3, label: 'Decisión', icon: UserPlus },
]

/**
 * Tablero de selección de 3 columnas (postulados / en evaluación /
 * decisión). "Contratar" y "Descartar" no viven en el tablero: se hacen
 * desde la ficha del candidato, donde está el historial completo de la
 * postulación.
 *
 * Desktop: 3 columnas lado a lado. Móvil: una columna a la vez con pestañas
 * propias (no el Tabs sincronizado con la URL — acá es solo un filtro de
 * vista, no una sección distinta de la página).
 */
export function RecruitmentBoard({
  postulaciones,
  tiposIdentificacion,
  puestos,
  sucursales,
  canWrite,
}: RecruitmentBoardProps) {
  const [showModal, setShowModal] = useState(false)
  const [faseMovil, setFaseMovil] = useState<1 | 2 | 3>(1)

  const porFase = useMemo(() => {
    const grupos: Record<1 | 2 | 3, PostulacionBoardItem[]> = { 1: [], 2: [], 3: [] }
    for (const p of postulaciones) {
      grupos[p.etapaFase].push(p)
    }
    return grupos
  }, [postulaciones])

  function renderColumna(fase: 1 | 2 | 3) {
    const items = porFase[fase]
    if (items.length === 0) {
      return <EmptyState icon={FASES[fase - 1].icon} title="Sin postulaciones en esta fase." />
    }
    return (
      <div className="space-y-2">
        {items.map((p) => (
          <PostulacionCard key={p.posId} postulacion={p} />
        ))}
      </div>
    )
  }

  return (
    <div className="@container min-w-0 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {/* El plural pierde la tilde: postulación → postulaciones. */}
          {postulaciones.length} postulaci{postulaciones.length === 1 ? 'ón' : 'ones'} en proceso
        </p>
        {canWrite && (
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-3.5 w-3.5" /> Nuevo candidato
          </Button>
        )}
      </div>

      {/* Móvil: una columna a la vez */}
      <div className="@lg:hidden">
        <div className="mb-3 flex gap-1.5 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {FASES.map((fase) => (
            <button
              key={fase.id}
              type="button"
              onClick={() => setFaseMovil(fase.id)}
              className={cn(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                faseMovil === fase.id
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200'
                  : 'text-slate-500 hover:text-slate-900'
              )}
            >
              <fase.icon className="h-3.5 w-3.5" aria-hidden="true" />
              {fase.label}
              <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">
                {porFase[fase.id].length}
              </span>
            </button>
          ))}
        </div>
        {renderColumna(faseMovil)}
      </div>

      {/* Desktop: 3 columnas */}
      <div className="hidden @lg:grid @lg:grid-cols-3 @lg:gap-3">
        {FASES.map((fase) => (
          <div key={fase.id} className="min-w-0 space-y-2.5 rounded-xl bg-slate-50 p-2.5">
            <div className="flex items-center justify-between px-1">
              <p className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <fase.icon className="h-3.5 w-3.5" aria-hidden="true" /> {fase.label}
              </p>
              <span className="text-[11px] font-semibold text-slate-400">
                {porFase[fase.id].length}
              </span>
            </div>
            {renderColumna(fase.id)}
          </div>
        ))}
      </div>

      {showModal && (
        <Modal
          title="Nuevo candidato"
          subtitle="Registra al candidato y su primera postulación."
          onClose={() => setShowModal(false)}
        >
          <NuevoCandidatoForm
            tiposIdentificacion={tiposIdentificacion}
            puestos={puestos}
            sucursales={sucursales}
            onSuccess={() => setShowModal(false)}
          />
        </Modal>
      )}
    </div>
  )
}
