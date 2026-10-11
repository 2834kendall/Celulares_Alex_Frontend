'use client'

import { useState } from 'react'
import { Camera, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CompanyLogo } from '@/components/ui/CompanyLogo'
import { ImageUploadModal } from '@/components/ui/ImageUploadModal'
import { InfoItem, SectionCard } from '@/components/ui/ProfileSection'
import type { TerritorioCatalogo } from '@/modules/employees/types'
import { removeCompanyLogo } from '@/modules/settings/actions/removeCompanyLogo'
import { setCompanyLogo } from '@/modules/settings/actions/setCompanyLogo'
import type { CompanyProfile } from '@/modules/settings/types'
import { CompanyProfileForm } from './CompanyProfileForm'

interface CompanyProfilePanelProps {
  profile: CompanyProfile
  territorio: TerritorioCatalogo
}

/** Nombres de la ubicación a partir del distrito (provincia y cantón se derivan). */
function ubicacion(territorio: TerritorioCatalogo, distritoId: number | undefined) {
  const distrito = territorio.distritos.find((d) => d.id === distritoId)
  const canton = territorio.cantones.find((c) => c.id === distrito?.cantonId)
  const provincia = territorio.provincias.find((p) => p.id === canton?.provinciaId)
  return {
    provincia: provincia?.nombre ?? '—',
    canton: canton?.nombre ?? '—',
    distrito: distrito?.nombre ?? '—',
    codigoPostal: distrito?.codigoPostal ?? '—',
  }
}

/**
 * Datos de la empresa con el mismo patrón que el perfil del empleado: se lee
 * por defecto y "Editar" activa el formulario. El logo, como la foto del
 * empleado, solo se cambia en modo edición (botón de cámara sobre el logo).
 */
export function CompanyProfilePanel({ profile, territorio }: CompanyProfilePanelProps) {
  const [editing, setEditing] = useState(false)
  const [editingLogo, setEditingLogo] = useState(false)

  const nombre = profile.org_nombre_fantasia ?? profile.org_nombre_social
  const lugar = ubicacion(territorio, profile.direccion?.dir_distrito_id)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative shrink-0">
            <CompanyLogo logoUrl={profile.logoUrl} nombre={nombre} size="xl" />
            {editing && (
              <button
                type="button"
                onClick={() => setEditingLogo(true)}
                aria-label="Cambiar logo"
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-sm outline-none transition hover:bg-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{nombre}</p>
            <p className="truncate text-xs text-slate-500">
              {profile.org_nombre_social} · Cédula jurídica {profile.org_cedula_juridica}
            </p>
          </div>
        </div>
        {!editing && (
          <Button onClick={() => setEditing(true)} className="shrink-0">
            <Pencil className="h-3.5 w-3.5" /> Editar
          </Button>
        )}
      </div>

      {editing ? (
        <CompanyProfileForm
          profile={profile}
          territorio={territorio}
          onSuccess={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <SectionCard title="Identidad">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label="Razón social" value={profile.org_nombre_social} />
              <InfoItem label="Nombre comercial" value={profile.org_nombre_fantasia ?? '—'} />
              <InfoItem label="Cédula jurídica" value={profile.org_cedula_juridica} />
              <InfoItem
                label="Representante legal"
                value={profile.org_representante_legal ?? '—'}
              />
              <InfoItem
                label="Actividad económica (CIIU)"
                value={profile.org_actividad_economica_ciiu ?? '—'}
              />
            </dl>
          </SectionCard>

          <SectionCard title="Contacto">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoItem label="Correo corporativo" value={profile.org_email_corporativo ?? '—'} />
              <InfoItem label="Teléfono" value={profile.org_telefono ?? '—'} />
            </dl>
          </SectionCard>

          <SectionCard title="Dirección">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Provincia" value={lugar.provincia} />
              <InfoItem label="Cantón" value={lugar.canton} />
              <InfoItem label="Distrito" value={lugar.distrito} />
              <InfoItem label="Código postal" value={lugar.codigoPostal} />
              <div className="sm:col-span-2 lg:col-span-4">
                <InfoItem
                  label="Señas exactas"
                  value={profile.direccion?.dir_senas_exactas || '—'}
                  wrap
                />
              </div>
            </dl>
          </SectionCard>
        </>
      )}

      {editingLogo && (
        <ImageUploadModal
          title="Logo de la empresa"
          currentUrl={profile.logoUrl}
          onClose={() => setEditingLogo(false)}
          onSave={setCompanyLogo}
          onRemove={removeCompanyLogo}
          dropzone={{
            container: 'LOGO_EMPRESA',
            shape: 'square',
            label: 'Subir logo de la empresa',
          }}
          copy={{
            saved: 'Logo actualizado.',
            removed: 'Logo eliminado.',
            removeAction: 'Quitar logo',
            removeConfirmTitle: '¿Quitar el logo?',
            removeConfirmMessage: 'El menú volverá a mostrar la inicial de la empresa.',
          }}
        />
      )}
    </div>
  )
}
