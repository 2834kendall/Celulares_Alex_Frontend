'use client'

import { useState } from 'react'
import { Settings } from 'lucide-react'
import type { RubroSeleccionRow } from '@/modules/recruitment/types'
import { RubrosSeleccionManager } from './RubrosSeleccionManager'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'

interface CriteriaAdminButtonProps {
  rubros: RubroSeleccionRow[]
}

/** Botón que abre la administración del catálogo de criterios de puntaje (CATALOGOS_WRITE). */
export function CriteriaAdminButton({ rubros }: CriteriaAdminButtonProps) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Settings className="h-3.5 w-3.5" /> Criterios de puntaje
      </Button>
      {open && (
        <Modal title="Criterios de puntaje" onClose={() => setOpen(false)}>
          <RubrosSeleccionManager rubros={rubros} canWrite />
        </Modal>
      )}
    </>
  )
}
