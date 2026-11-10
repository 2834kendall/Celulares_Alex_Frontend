'use client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
export default function BranchSettingsError({ reset }: { reset: () => void }) {
  return (
    <div className="space-y-4">
      <PageHeader title="Sucursales y kioscos" />
      <Alert>
        No se pudo cargar esta configuración. Revisá la conexión y que tu cuenta conserve acceso a
        la empresa.
      </Alert>
      <Button onClick={reset}>Volver a intentar</Button>
    </div>
  )
}
