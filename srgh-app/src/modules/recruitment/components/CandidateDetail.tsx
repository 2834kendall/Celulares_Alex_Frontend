'use client'

import { useState } from 'react'
import { FileText, IdCard, Mail, Megaphone, Phone, Plus, UserSquare2 } from 'lucide-react'
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
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { CandidateDocumentsSection } from './CandidateDocumentsSection'
import { CollapsibleSection } from './CollapsibleSection'
import { PostulacionPanel } from './PostulacionPanel'
import { NuevaPostulacionForm } from './NuevaPostulacionForm'

// Correo y teléfono se tocan para escribir o llamar: RRHH suele contactar
// al candidato desde el celular. min-h-11 al tacto para que el enlace tenga
// un blanco de dedo aunque el texto sea chico.
const CONTACT_LINK =
  'inline-flex min-w-0 items-center gap-1.5 rounded font-medium text-brand-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-brand-500/60 pointer-coarse:min-h-11'
const CONTACT_TEXT = 'inline-flex min-w-0 items-center gap-1.5 text-slate-600'

interface CandidateDetailProps {
  candidato: CandidatoDetalle
  etapas: EtapaSeleccionItem[]
  criterios: CriterioSeleccionItem[]
  puestos: CatalogoItem[]
  sucursales: CatalogoItem[]
  canWrite: boolean
}

/**
 * Ficha del candidato.
 *
 * Compacta a propósito: los datos de contacto van en una sola línea, y las
 * postulaciones (con sus acciones arriba) quedan a la vista sin scroll. Lo
 * que se consulta menos —documentos, puntaje, historial— va en secciones
 * plegables que muestran solo su resumen.
 */
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
  const docs = candidato.documentos.length

  return (
    <div className="min-w-0 space-y-4">
      <PageHeader backHref="/recruitment" backLabel="Volver al tablero" title={nombre} />

      <div className="rounded-xl border border-slate-200 bg-white px-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
        <div className="flex items-center gap-3 py-3.5">
          <Avatar nombre={nombre} size="md" />
          <div className="min-w-0 flex-1">
            <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              {candidato.cdt_telefono && (
                <li className="min-w-0">
                  <a
                    href={`tel:${candidato.cdt_telefono.replace(/[^\d+]/g, '')}`}
                    className={CONTACT_LINK}
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {candidato.cdt_telefono}
                  </a>
                </li>
              )}
              {candidato.cdt_email && (
                <li className="min-w-0">
                  <a href={`mailto:${candidato.cdt_email}`} className={CONTACT_LINK}>
                    <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{candidato.cdt_email}</span>
                  </a>
                </li>
              )}
              {candidato.cdt_numero_identificacion && (
                <li className={CONTACT_TEXT} title={candidato.tipoIdentificacionNombre}>
                  <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="sr-only">{candidato.tipoIdentificacionNombre}:</span>
                  {candidato.cdt_numero_identificacion}
                </li>
              )}
              {candidato.cdt_fuente_reclutamiento && (
                <li className={CONTACT_TEXT}>
                  <Megaphone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <span className="sr-only">Fuente:</span>
                  {candidato.cdt_fuente_reclutamiento}
                </li>
              )}
            </ul>
          </div>
        </div>

        <CollapsibleSection
          title="Documentos"
          icon={FileText}
          summary={docs === 0 ? 'Ninguno' : `${docs} ${docs === 1 ? 'archivo' : 'archivos'}`}
        >
          <CandidateDocumentsSection
            candidatoId={candidato.cdt_id}
            documentos={candidato.documentos}
            canWrite={canWrite}
          />
        </CollapsibleSection>
      </div>

      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            {candidato.postulaciones.length === 1 ? 'Postulación' : 'Postulaciones'}
          </h2>
          {canWrite && (
            <Button variant="secondary" onClick={() => setShowNuevaPostulacion(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nueva postulación
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
