'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAnyPermission } from '@/lib/auth/require-permission'
import { getSelectorMarca } from '@/lib/empresa/contexto-activo'
import {
  MARCA_CONTEXTO_COOKIE,
  MARCA_CONTEXTO_MAX_AGE,
  serializarMarcaContexto,
} from '@/lib/empresa/marca-contexto-cookie'
import { PERMISOS_DATOS_POR_MARCA } from '@/lib/permissions/zones'

export type SetContextoMarcaResult = { ok: true } | { ok: false; error: string }

const idSchema = z.number().int().positive().nullable()

/**
 * Elige la marca con la que se filtran los listados, o vuelve a "Todas" con
 * `null`. El id que llega del cliente se valida contra las marcas que esta cuenta
 * puede elegir. Aun así la cookie no da acceso a nada: la RLS sigue leyendo solo
 * el JWT, y cada lectura la vuelve a validar.
 */
export async function setContextoMarca(marcaId: number | null): Promise<SetContextoMarcaResult> {
  if (!idSchema.safeParse(marcaId).success) {
    return { ok: false, error: 'Marca inválida.' }
  }

  const claims = await requireAnyPermission(PERMISOS_DATOS_POR_MARCA)
  const usrId = (claims.app_metadata as { usr_id?: number })?.usr_id
  const store = await cookies()

  if (marcaId === null) {
    store.delete(MARCA_CONTEXTO_COOKIE)
    revalidatePath('/', 'layout')
    return { ok: true }
  }

  const { marcas } = await getSelectorMarca()
  if (!usrId || !marcas.some((marca) => marca.id === marcaId)) {
    return { ok: false, error: 'No podés filtrar por esa marca.' }
  }

  store.set(MARCA_CONTEXTO_COOKIE, serializarMarcaContexto(usrId, marcaId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MARCA_CONTEXTO_MAX_AGE,
  })

  revalidatePath('/', 'layout')
  return { ok: true }
}
