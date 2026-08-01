import { createSupabaseStorageProvider } from '@/lib/storage/supabase-provider'
import type { StorageProvider } from '@/lib/storage/types'

/**
 * LA COSTURA del desacople: todo el código de negocio obtiene el storage por
 * esta función y depende solo del port (types.ts). Cambiar de proveedor
 * (S3/R2/Azure) es escribir otro adapter y cambiar este return — nada más.
 */
export function getStorageProvider(): StorageProvider {
  return createSupabaseStorageProvider()
}
