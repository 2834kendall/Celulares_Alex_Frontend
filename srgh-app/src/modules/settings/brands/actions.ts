'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { branchAdmin } from '../branches/access'
import { brandSchema, type BrandInput, type BrandSettings } from './types'
import { aparienciaSchema, type AparienciaInput } from '../lib/apariencia'
import { getStorageProvider } from '@/lib/storage'
import { TTL_FOTO } from '@/lib/storage/containers'
import { buildBrandLogoPath } from '@/lib/storage/paths'
import { validateUpload } from '@/lib/storage/validation'
import { storageErrorMessage } from '@/modules/storage/lib/storageErrors'

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
type Simple = { ok: true } | { ok: false; error: string }

const idSchema = z.number().int().positive()

/** Errores de la RPC con mensaje pensado para la UI (validación y permiso). */
const MENSAJE_PROPIO = ['23514', '42501']

function refresh() {
  revalidatePath('/settings/profile')
  revalidatePath('/settings/branches')
  // El tema y el nombre de la marca se ven en el shell de toda la app.
  revalidatePath('/', 'layout')
}

/**
 * Marcas de la empresa del JWT con sus sucursales y el logo ya firmado. Lee
 * con el cliente admin, como `getBranchSettings`: `branchAdmin` ya validó en
 * vivo al administrador, y cada consulta filtra explícitamente por la
 * empresa del JWT.
 */
export async function getBrandSettings(): Promise<Result<BrandSettings>> {
  const { admin, empresa } = await branchAdmin()
  const [marcas, sucursales] = await Promise.all([
    admin
      .from('sgrh_marcas_comerciales')
      .select('*')
      .eq('mco_empresa_id', empresa)
      .order('mco_nombre'),
    admin
      .from('sgrh_sucursales')
      .select('suc_id, suc_nombre, suc_activa, suc_marca_id')
      .eq('suc_empresa_id', empresa)
      .order('suc_nombre'),
  ])
  if (marcas.error || sucursales.error)
    return {
      ok: false,
      error:
        'No se pudieron cargar las marcas. Comprobá que la migración de marcas esté aplicada y reintentá.',
    }

  const provider = getStorageProvider()
  const brands = await Promise.all(
    (marcas.data ?? []).map(async (m) => {
      const signed = m.mco_logo_path
        ? await provider.getSignedUrl('LOGO_EMPRESA', m.mco_logo_path, TTL_FOTO)
        : null
      return {
        ...m,
        sucursales: (sucursales.data ?? [])
          .filter((s) => s.suc_marca_id === m.mco_id)
          .map(({ suc_id, suc_nombre, suc_activa }) => ({ suc_id, suc_nombre, suc_activa })),
        logoUrl: signed?.ok ? signed.data : null,
      }
    })
  )
  return { ok: true, data: { brands } }
}

/** Crea (id null) o actualiza nombre y estado de una marca. */
export async function saveBrand(id: number | null, input: BrandInput): Promise<Result<number>> {
  if (id !== null && !idSchema.safeParse(id).success) return { ok: false, error: 'Marca inválida.' }
  const parsed = brandSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { admin, empresa, actor } = await branchAdmin()
  const result = await admin.rpc('sgrh_save_brand', {
    p_actor: actor,
    p_empresa: empresa,
    // gen types no refleja que la RPC acepta NULL (= crear).
    p_id: id as number,
    p_data: parsed.data,
  })
  if (result.error)
    return {
      ok: false,
      error: MENSAJE_PROPIO.includes(result.error.code)
        ? result.error.message
        : 'No se pudo guardar la marca.',
    }
  refresh()
  return { ok: true, data: result.data }
}

/** Colores de la marca (null = heredar el tema de la empresa). */
export async function saveBrandApariencia(id: number, input: AparienciaInput): Promise<Simple> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Marca inválida.' }
  const parsed = aparienciaSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  const { admin, empresa, actor } = await branchAdmin()
  const { error } = await admin.rpc('sgrh_save_brand', {
    p_actor: actor,
    p_empresa: empresa,
    p_id: id,
    p_data: {
      mco_color_acento: parsed.data.colorAcento,
      mco_color_sidebar: parsed.data.colorSidebar,
    },
  })
  if (error)
    return {
      ok: false,
      error: MENSAJE_PROPIO.includes(error.code)
        ? error.message
        : 'No se pudo guardar la apariencia.',
    }
  refresh()
  return { ok: true }
}

/** Ruta del logo actual de una marca de la empresa, o un error si no es suya. */
async function currentLogo(
  admin: Awaited<ReturnType<typeof branchAdmin>>['admin'],
  empresa: number,
  id: number
): Promise<Result<string | null>> {
  const { data, error } = await admin
    .from('sgrh_marcas_comerciales')
    .select('mco_logo_path')
    .eq('mco_id', id)
    .eq('mco_empresa_id', empresa)
    .maybeSingle()
  if (error || !data) return { ok: false, error: 'No se encontró la marca.' }
  return { ok: true, data: data.mco_logo_path }
}

/**
 * Sube y asigna el logo de una marca. Mismo orden que `setCompanyLogo`:
 * 1) validar por magic bytes, 2) subir, 3) guardar la ruta (si falla, se
 * revierte la subida), 4) borrar el logo anterior best-effort.
 *
 * La ruta se arma con el empresa_id del JWT: la policy del bucket compara el
 * primer segmento contra get_empresa_id(), y la RPC rechaza otra carpeta.
 */
export async function setBrandLogo(id: number, formData: FormData): Promise<Simple> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Marca inválida.' }
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona un archivo.' }
  }

  const { admin, empresa, actor } = await branchAdmin()
  const bytes = new Uint8Array(await file.arrayBuffer())
  const check = validateUpload(bytes, 'LOGO_EMPRESA')
  if (!check.ok) return { ok: false, error: storageErrorMessage(check.error) }

  const previous = await currentLogo(admin, empresa, id)
  if (!previous.ok) return previous

  const provider = getStorageProvider()
  const uploaded = await provider.upload({
    container: 'LOGO_EMPRESA',
    path: buildBrandLogoPath(empresa, id, check.extension),
    body: bytes,
    contentType: check.mimeType,
  })
  if (!uploaded.ok) return { ok: false, error: storageErrorMessage(uploaded.error) }

  const newPath = uploaded.data.path
  const { error } = await admin.rpc('sgrh_save_brand', {
    p_actor: actor,
    p_empresa: empresa,
    p_id: id,
    p_data: { mco_logo_path: newPath },
  })
  if (error) {
    // Nadie llegó a referenciar el objeto recién subido: se revierte.
    await provider.remove('LOGO_EMPRESA', [newPath])
    return { ok: false, error: 'No se pudo guardar el logo.' }
  }

  if (previous.data) {
    const removed = await provider.remove('LOGO_EMPRESA', [previous.data])
    if (!removed.ok) {
      console.error(`setBrandLogo: no se pudo borrar el logo anterior (path=${previous.data})`)
    }
  }
  refresh()
  return { ok: true }
}

/**
 * Borra una marca sin sucursales. La regla la decide la RPC, no la pantalla: la
 * lista que el usuario tiene abierta puede estar vieja. El logo se borra
 * best-effort después: la fila ya no lo referencia.
 */
export async function deleteBrand(id: number): Promise<Simple> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Marca inválida.' }
  const { admin, empresa, actor } = await branchAdmin()

  const { data: logoPath, error } = await admin.rpc('sgrh_delete_brand', {
    p_actor: actor,
    p_empresa: empresa,
    p_id: id,
  })
  if (error) {
    return {
      ok: false,
      error: MENSAJE_PROPIO.includes(error.code) ? error.message : 'No se pudo eliminar la marca.',
    }
  }

  if (logoPath) {
    const removed = await getStorageProvider().remove('LOGO_EMPRESA', [logoPath])
    if (!removed.ok) {
      console.error(`deleteBrand: no se pudo borrar el logo (path=${logoPath})`)
    }
  }
  refresh()
  return { ok: true }
}

/**
 * Quita el logo de una marca: primero se suelta la referencia (la fuente de
 * verdad) y después se borra el objeto best-effort. Sin logo propio, el shell
 * muestra el de la empresa.
 */
export async function removeBrandLogo(id: number): Promise<Simple> {
  if (!idSchema.safeParse(id).success) return { ok: false, error: 'Marca inválida.' }
  const { admin, empresa, actor } = await branchAdmin()

  const previous = await currentLogo(admin, empresa, id)
  if (!previous.ok) return previous
  if (!previous.data) return { ok: true }

  const { error } = await admin.rpc('sgrh_save_brand', {
    p_actor: actor,
    p_empresa: empresa,
    p_id: id,
    p_data: { mco_logo_path: null },
  })
  if (error) return { ok: false, error: 'No se pudo quitar el logo.' }

  const removed = await getStorageProvider().remove('LOGO_EMPRESA', [previous.data])
  if (!removed.ok) {
    console.error(`removeBrandLogo: no se pudo borrar el objeto (path=${previous.data})`)
  }
  refresh()
  return { ok: true }
}
