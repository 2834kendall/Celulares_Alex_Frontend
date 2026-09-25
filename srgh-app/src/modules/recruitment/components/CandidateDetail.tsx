'use client'

import { useState } from 'react'
import { Mail, Phone, Plus, UserSquare2 } from 'lucide-react'
import type {
  CandidatoDetalle,
  CriterioSeleccionItem,
  EtapaSeleccionItem,
} from '@/modules/recruitment/types'
import type { CatalogoItem } from '@/modules/employees/types'
import { fullName } from '@/modules/recruitment/lib/format'
import { Avatar } from '@/components/ui/Avatar'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { META_LABEL } from '@/components/ui/styles'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { CandidateDocumentsSection } from './CandidateDocumentsSection'
import { PostulacionPanel } from './PostulacionPanel'
import { NuevaPostulacionForm } from './NuevaPostulacionForm'

interface CandidateDetailProps {
  candidato: CandidatoDetalle
  etapas: EtapaSeleccionItem[]
  criterios: CriterioSeleccionItem[]
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  canWrite: boolean
}

export function CandidateDetail({
  candidato,
  etapas,
  criterios,
  puestos,
  sucursales,
  canWrite,
}: CandidateDetailProps) {
  const [showNuevaPostulacion, setShowNuevaPostulacion] = useState(false)
  const nombre = fullName(candidato)

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader
        backHref="/recruitment"
        backLabel="Volver al tablero"
        title={nombre}
        description="Ficha del candidato: datos, documentos y postulaciones."
      />

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex items-start gap-3">
          <Avatar nombre={nombre} size="lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-base font-bold text-slate-900">{nombre}</p>
            <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
              <div className="min-w-0">
                <dt className={META_LABEL}>
                  <Mail className="mb-0.5 inline h-3 w-3" /> Correo
                </dt>
                <dd className="truncate text-sm text-slate-800">{candidato.cdt_email}</dd>
              </div>
              <div className="min-w-0">
                <dt className={META_LABEL}>
                  <Phone className="mb-0.5 inline h-3 w-3" /> Teléfono
                </dt>
                <dd className="truncate text-sm text-slate-800">{candidato.cdt_telefono ?? '—'}</dd>
              </div>
              <div className="min-w-0">
                <dt className={META_LABEL}>
                  <UserSquare2 className="mb-0.5 inline h-3 w-3" /> Identificación
                </dt>
                <dd className="truncate text-sm text-slate-800">
                  {candidato.tipoIdentificacionNombre} {candidato.cdt_numero_identificacion}
                </dd>
              </div>
              {candidato.cdt_fuente_reclutamiento && (
                <div className="min-w-0">
                  <dt className={META_LABEL}>Fuente</dt>
                  <dd className="truncate text-sm text-slate-800">
                    {candidato.cdt_fuente_reclutamiento}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-slate-900">Documentos</h2>
        <CandidateDocumentsSection
          candidatoId={candidato.cdt_id}
          documentos={candidato.documentos}
          canWrite={canWrite}
        />
      </section>

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">Postulaciones</h2>
          {canWrite && (
            <Button onClick={() => setShowNuevaPostulacion(true)}>
              <Plus className="h-3.5 w-3.5" /> Nueva postulación
            </Button>
          )}
        </div>

        {candidato.postulaciones.length === 0 ? (
          <EmptyState icon={UserSquare2} title="Este candidato todavía no tiene postulaciones." />
        ) : (
          <div className="space-y-3">
            {candidato.postulaciones.map((postulacion) => (
              <PostulacionPanel
                key={postulacion.pos_id}
                candidatoId={candidato.cdt_id}
                postulacion={postulacion}
                etapas={etapas}
                criterios={criterios}
                canWrite={canWrite}
              />
            ))}
          </div>
        )}
      </section>

      {showNuevaPostulacion && (
        <Modal title="Nueva postulación" onClose={() => setShowNuevaPostulacion(false)}>
          <NuevaPostulacionForm
            candidatoId={candidato.cdt_id}
            puestos={puestos}
            sucursales={sucursales}
            onSuccess={() => setShowNuevaPostulacion(false)}
          />
        </Modal>
      )}
    </div>
  )
}
