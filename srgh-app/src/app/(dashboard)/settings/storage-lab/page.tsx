import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { listLabDocuments } from '@/modules/storage/actions/listLabDocuments'
import { listLabFiles } from '@/modules/storage/actions/listLabFiles'
import { StorageLab } from '@/modules/storage/components/StorageLab'

/**
 * Laboratorio TEMPORAL del core de storage (SGRH-60, fases 1A/1B). Se elimina
 * cuando la fase 2 integre la foto real en el módulo de empleados.
 */
export default async function StorageLabPage() {
  await requirePermission(PERMISOS.EMPLEADOS_WRITE)

  const [files, documents] = await Promise.all([listLabFiles(), listLabDocuments()])

  return (
    <StorageLab
      items={files.ok ? files.items : []}
      listError={files.ok ? null : files.error}
      documents={documents.ok ? documents.items : []}
      documentsError={documents.ok ? null : documents.error}
    />
  )
}
