import { Construction } from 'lucide-react'
import { StatePanel } from '@/components/ui/StatePanel'

interface ModulePlaceholderProps {
  title: string
  description?: string
}

/**
 * Contenido temporal para zonas cuyo modulo aun esta en desarrollo.
 * Cada equipo lo reemplaza con los componentes reales de su modulo
 * (src/modules/<dominio>/components) cuando construya la funcionalidad.
 *
 * Usa la escena de "vacío" (todavía no hay nada) y no la de "sin acceso": hoy
 * lo ve, por ejemplo, el empleado en Nómina mientras su vista de comprobantes
 * no existe. No le falta un permiso, le falta la pantalla.
 */
export function ModulePlaceholder({ title, description }: ModulePlaceholderProps) {
  return (
    <StatePanel
      kind="empty"
      icon={<Construction width={24} height={24} />}
      title={title}
      description={description ?? 'Este módulo está en construcción. Pronto estará disponible.'}
    />
  )
}
