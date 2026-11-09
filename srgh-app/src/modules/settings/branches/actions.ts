'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { branchAdmin } from './access'
import {
  branchSchema,
  kioskSchema,
  type BranchBrand,
  type BranchInput,
  type BranchSettings,
  type KioskInput,
  type LegacyKiosk,
} from './types'
import { PERMISOS } from '@/lib/permissions/catalog'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { resendInvitation } from '@/modules/users/actions/resendInvitation'

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string }
const idSchema = z.number().int().positive()
const kioskId = z.uuid()
const failure = (error: unknown): { ok: false; error: string } => ({
  ok: false,
  error: error instanceof Error ? error.message : 'No se pudo completar la operación.',
})
function refresh() {
  revalidatePath('/settings/branches')
  revalidatePath('/settings/profile')
  revalidatePath('/employees')
  revalidatePath('/', 'layout')
}

type Admin = Awaited<ReturnType<typeof branchAdmin>>['admin']

/** Marcas de la empresa para el select de sucursal (activas e inactivas). */
async function loadBrands(admin: Admin, empresa: number) {
  const { data, error } = await admin
    .from('sgrh_marcas_comerciales')
    .select('mco_id, mco_nombre, mco_activa')
    .eq('mco_empresa_id', empresa)
    .order('mco_nombre')
  const brands: BranchBrand[] = (data ?? []).map((x) => ({
    id: x.mco_id,
    nombre: x.mco_nombre,
    activa: x.mco_activa,
  }))
  return { data: brands, error }
}

/** Solo las marcas, para la pantalla de alta (no necesita kioscos ni auditoría). */
export async function getBranchBrands(): Promise<Result<BranchBrand[]>> {
  const { admin, empresa } = await branchAdmin()
  const r = await loadBrands(admin, empresa)
  if (r.error) return { ok: false, error: 'No se pudieron cargar las marcas. Reintentá.' }
  return { ok: true, data: r.data }
}

export async function getBranchSettings(): Promise<Result<BranchSettings>> {
  const { admin, empresa, claims } = await branchAdmin()
  let canManageKiosks = ((claims.app_metadata as { permisos?: string[] }).permisos ?? []).includes(
    PERMISOS.USUARIOS_WRITE
  )
  if (canManageKiosks) {
    const check = await admin.rpc('sgrh_assert_branch_admin', {
      p_actor: claims.sub,
      p_empresa: empresa,
      p_kioscos: true,
    })
    canManageKiosks = !check.error
  }
  const b = await admin
    .from('sgrh_sucursales')
    .select('*, sgrh_direcciones(dir_distrito_id,dir_senas_exactas)')
    .eq('suc_empresa_id', empresa)
    .order('suc_nombre')
  if (b.error) return { ok: false, error: 'No se pudieron cargar las sucursales. Reintentá.' }
  const [k, dependencies, a, m] = await Promise.all([
    canManageKiosks
      ? admin.from('sgrh_kioscos').select('*').eq('kio_empresa_id', empresa).order('kio_created_at')
      : Promise.resolve({ data: [], error: null }),
    Promise.all(
      (b.data ?? []).map(async (s) => {
        const [contracts, programs] = await Promise.all([
          admin
            .from('sgrh_historial_laboral')
            .select('lab_id', { count: 'exact', head: true })
            .eq('lab_empresa_id', empresa)
            .eq('lab_sucursal_id', s.suc_id)
            .is('lab_fecha_fin', null),
          admin
            .from('sgrh_programacion_semanal')
            .select('prg_id', { count: 'exact', head: true })
            .eq('prg_sucursal_id', s.suc_id)
            .gte('prg_fecha', todayInCostaRica()),
        ])
        return {
          id: s.suc_id,
          contracts: contracts.count ?? 0,
          programs: programs.count ?? 0,
          error: contracts.error ?? programs.error,
        }
      })
    ),
    admin
      .from('sgrh_config_auditoria')
      .select('*')
      .eq('aud_empresa_id', empresa)
      .order('aud_created_at', { ascending: false })
      .limit(25),
    loadBrands(admin, empresa),
  ])
  if ([k, a, m, ...dependencies].some((r) => r.error))
    return {
      ok: false,
      error:
        'No se pudo cargar la configuración. Comprobá que la migración SGRH-103 esté aplicada y reintentá.',
    }
  const legacy: LegacyKiosk[] = []
  if (canManageKiosks) {
    const u = await admin
      .from('sgrh_usuarios_empresa_rol')
      .select(
        'uer_usuario_id,uer_sucursal_id,sgrh_usuarios(usr_id,usr_email,usr_empleado_id),sgrh_cat_roles(rol_codigo)'
      )
      .eq('uer_empresa_id', empresa)
      .eq('uer_activo', true)
    if (u.error) return { ok: false, error: 'No se pudieron consultar las cuentas existentes.' }
    for (const row of u.data ?? []) {
      const user = row.sgrh_usuarios
      if (
        row.sgrh_cat_roles?.rol_codigo !== 'KIOSCO' ||
        !user ||
        user.usr_empleado_id ||
        k.data?.some((x) => x.kio_usuario_id === user.usr_id)
      )
        continue
      const entry = legacy.find((x) => x.id === user.usr_id)
      if (entry) entry.sucursales.push(row.uer_sucursal_id)
      else
        legacy.push({ id: user.usr_id, email: user.usr_email, sucursales: [row.uer_sucursal_id] })
    }
  }
  return {
    ok: true,
    data: {
      branches: (b.data ?? []).map((s) => ({
        ...s,
        direccion: s.sgrh_direcciones,
        contratos: dependencies.find((d) => d.id === s.suc_id)?.contracts ?? 0,
        programaciones: dependencies.find((d) => d.id === s.suc_id)?.programs ?? 0,
      })),
      brands: m.data,
      kiosks: k.data ?? [],
      legacy,
      audit: a.data ?? [],
      canManageKiosks,
    },
  }
}

export async function saveBranch(id: number | null, input: BranchInput): Promise<Result<number>> {
  if (id !== null && !idSchema.safeParse(id).success)
    return { ok: false, error: 'Sucursal inválida.' }
  const parsed = branchSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { admin, empresa, actor } = await branchAdmin()
  const { direccion, ...data } = parsed.data
  const result = await admin.rpc('sgrh_save_branch', {
    p_actor: actor,
    p_empresa: empresa,
    // gen types no refleja que la RPC acepta NULL (= crear).
    p_id: id as number,
    p_data: data,
    p_direccion: direccion,
  })
  if (result.error)
    return {
      ok: false,
      error: ['23514', '42501'].includes(result.error.code)
        ? result.error.message
        : 'No se pudo guardar la sucursal. Revisá los datos de dirección.',
    }
  refresh()
  return { ok: true, data: result.data }
}

export async function createKiosk(input: KioskInput): Promise<Result<string>> {
  const parsed = kioskSchema.safeParse(input)
  if (!parsed.success)
    return { ok: false, error: 'Revisá el nombre, correo y sucursal del kiosco.' }
  const { admin, empresa, actor } = await branchAdmin(true)
  const r = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: 'crear',
    // gen types no refleja que la RPC acepta NULL (= crear).
    p_id: null as unknown as string,
    p_data: parsed.data,
  })
  if (r.error)
    return {
      ok: false,
      error:
        r.error.code === '23505' ? 'Ese correo ya está registrado como kiosco.' : r.error.message,
    }
  refresh()
  return { ok: true, data: r.data }
}

export async function setKioskState(id: string, active: boolean): Promise<Result> {
  if (!kioskId.safeParse(id).success || typeof active !== 'boolean')
    return { ok: false, error: 'Kiosco inválido.' }
  const { admin, empresa, actor } = await branchAdmin(true)
  const r = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: active ? 'activar' : 'bloquear',
    p_id: id,
    p_data: {},
  })
  if (r.error) return { ok: false, error: r.error.message }
  refresh()
  return { ok: true, data: undefined }
}

export async function moveKiosk(id: string, branch: number): Promise<Result> {
  if (!kioskId.safeParse(id).success || !idSchema.safeParse(branch).success)
    return { ok: false, error: 'Asignación inválida.' }
  const { admin, empresa, actor } = await branchAdmin(true)
  const r = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: 'mover',
    p_id: id,
    p_data: { sucursal_id: branch },
  })
  if (r.error) return { ok: false, error: r.error.message }
  refresh()
  return { ok: true, data: undefined }
}

export async function renameKiosk(id: string, name: string): Promise<Result> {
  if (!kioskId.safeParse(id).success || !z.string().trim().min(2).max(80).safeParse(name).success)
    return { ok: false, error: 'Revisá el nombre del kiosco.' }
  const { admin, empresa, actor } = await branchAdmin(true)
  const r = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: 'renombrar',
    p_id: id,
    p_data: { nombre: name.trim() },
  })
  if (r.error) return { ok: false, error: r.error.message }
  refresh()
  return { ok: true, data: undefined }
}

/** Invitation and linking are intentionally separate, recoverable steps. */
export async function provisionKiosk(
  id: string,
  mode: 'invitar' | 'vincular' | 'reenviar' | 'recuperar'
): Promise<Result> {
  if (
    !kioskId.safeParse(id).success ||
    !['invitar', 'vincular', 'reenviar', 'recuperar'].includes(mode)
  )
    return { ok: false, error: 'Acción inválida.' }
  const { admin, empresa, actor } = await branchAdmin(true)
  const { data: k, error } = await admin
    .from('sgrh_kioscos')
    .select('*')
    .eq('kio_id', id)
    .eq('kio_empresa_id', empresa)
    .single()
  if (error || !k) return { ok: false, error: 'Kiosco no encontrado.' }
  if (k.kio_estado === 'bloqueado')
    return { ok: false, error: 'Activá el kiosco antes de gestionar su acceso.' }
  const branch = await admin
    .from('sgrh_sucursales')
    .select('suc_id')
    .eq('suc_id', k.kio_sucursal_id)
    .eq('suc_empresa_id', empresa)
    .eq('suc_activa', true)
    .maybeSingle()
  if (branch.error || !branch.data) return { ok: false, error: 'La sucursal no está activa.' }
  try {
    if (mode === 'reenviar') {
      if (!k.kio_usuario_id)
        return { ok: false, error: 'Completá primero el vínculo de la cuenta.' }
      const r = await resendInvitation(k.kio_usuario_id)
      if (!r.ok) return r
    } else if (mode === 'recuperar') {
      if (!k.kio_usuario_id)
        return { ok: false, error: 'Completá primero el vínculo de la cuenta.' }
      const { error: authError } = await admin.auth.resetPasswordForEmail(k.kio_email)
      if (authError) return { ok: false, error: 'No se pudo enviar el correo de recuperación.' }
    } else {
      if (mode === 'invitar') {
        const existing = await admin
          .from('sgrh_usuarios')
          .select('usr_id,usr_auth_id,usr_activo,usr_empleado_id')
          .eq('usr_email', k.kio_email)
          .maybeSingle()
        if (existing.error) return { ok: false, error: 'No se pudo comprobar el correo.' }
        if (existing.data) {
          if (existing.data.usr_auth_id)
            return {
              ok: false,
              error: 'La cuenta ya existe. Usá Completar vínculo para validarla y asociarla.',
            }
          const assignments = await admin
            .from('sgrh_usuarios_empresa_rol')
            .select('uer_empresa_id,uer_sucursal_id,uer_activo,sgrh_cat_roles(rol_codigo)')
            .eq('uer_usuario_id', existing.data.usr_id)
          const active = assignments.data?.filter((a) => a.uer_activo) ?? []
          if (
            assignments.error ||
            !existing.data.usr_activo ||
            existing.data.usr_empleado_id ||
            active.length !== 1 ||
            active[0].uer_sucursal_id !== k.kio_sucursal_id ||
            !assignments.data?.every(
              (a) => a.uer_empresa_id === empresa && a.sgrh_cat_roles?.rol_codigo === 'KIOSCO'
            )
          )
            return {
              ok: false,
              error:
                'La cuenta pendiente debe ser una cuenta KIOSCO activa, sin empleado y asignada únicamente a esta sucursal.',
            }
          const retry = await resendInvitation(existing.data.usr_id)
          if (!retry.ok) return retry
        } else {
          const invite = await admin.auth.admin.inviteUserByEmail(k.kio_email)
          if (invite.error)
            return {
              ok: false,
              error:
                'No se pudo enviar la invitación. Si la cuenta ya existe, usá Completar vínculo.',
            }
        }
      }
      const user = await admin
        .from('sgrh_usuarios')
        .select('usr_id')
        .eq('usr_email', k.kio_email)
        .single()
      if (user.error || !user.data)
        return {
          ok: false,
          error:
            'La cuenta aún no está disponible. Reintentá Completar vínculo; no creés otro kiosco.',
        }
      const r = await admin.rpc('sgrh_manage_kiosk', {
        p_actor: actor,
        p_empresa: empresa,
        p_action: 'vincular',
        p_id: id,
        p_data: { usuario_id: user.data.usr_id },
      })
      if (r.error) return { ok: false, error: r.error.message }
    }
    refresh()
    return { ok: true, data: undefined }
  } catch (error) {
    return failure(error)
  }
}
