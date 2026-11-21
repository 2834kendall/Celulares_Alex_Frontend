'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { branchAdmin } from './access'
import {
  branchSchema,
  kioskLoginSchema,
  kioskPasswordSchema,
  kioskSchema,
  type BranchBrand,
  type BranchInput,
  type BranchSettings,
  type Kiosk,
  type KioskInput,
} from './types'
import { PERMISOS } from '@/lib/permissions/catalog'
import { internalKioskEmail } from '@/lib/kiosk/internalEmail'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

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

type KioskAccount = Pick<
  Kiosk,
  'kio_id' | 'kio_email' | 'kio_usuario_id' | 'kio_estado' | 'kio_sucursal_id'
>

function accountError(error: { code?: string; message?: string }) {
  if (error.code === 'weak_password')
    return 'La contraseña no cumple la política de seguridad de la cuenta.'
  if (error.code === 'email_address_invalid')
    return 'Supabase rechazó el correo interno del kiosco. Revisá la variable KIOSK_EMAIL_DOMAIN.'
  return 'No se pudo guardar el acceso del kiosco. Reintentá.'
}

/**
 * Gives the kiosk account the password chosen by the administrator (SGRH-111).
 *
 * Without an account yet, it creates the Auth user already confirmed (no email
 * is sent) and links it. An account that already exists (a KIOSCO account from
 * before SGRH-111) is linked first, so the RPC validates it, and only then gets
 * the new password. A password change on a linked kiosk closes its sessions.
 */
async function grantKioskAccess(
  admin: Admin,
  empresa: number,
  actor: string,
  k: KioskAccount,
  password: string
): Promise<Result> {
  if (k.kio_estado === 'bloqueado')
    return { ok: false, error: 'Habilitá el kiosco antes de cambiar su acceso.' }
  let usrId = k.kio_usuario_id
  if (!usrId) {
    const branch = await admin
      .from('sgrh_sucursales')
      .select('suc_id')
      .eq('suc_id', k.kio_sucursal_id)
      .eq('suc_empresa_id', empresa)
      .eq('suc_activa', true)
      .maybeSingle()
    if (branch.error || !branch.data) return { ok: false, error: 'La sucursal no está activa.' }
    const created = await admin.auth.admin.createUser({
      email: k.kio_email,
      password,
      email_confirm: true,
    })
    const existed =
      !!created.error &&
      (created.error.code === 'email_exists' || /already/i.test(created.error.message ?? ''))
    if (created.error && !existed) return { ok: false, error: accountError(created.error) }
    const user = await admin
      .from('sgrh_usuarios')
      .select('usr_id')
      .eq('usr_email', k.kio_email)
      .maybeSingle()
    if (user.error || !user.data)
      return {
        ok: false,
        error: 'La cuenta del kiosco todavía no está disponible. Reintentá en un momento.',
      }
    const linked = await admin.rpc('sgrh_manage_kiosk', {
      p_actor: actor,
      p_empresa: empresa,
      p_action: 'vincular',
      p_id: k.kio_id,
      p_data: { usuario_id: user.data.usr_id },
    })
    if (linked.error) return { ok: false, error: linked.error.message }
    // A brand-new account already has this password and no sessions.
    if (!existed) return { ok: true, data: undefined }
    usrId = user.data.usr_id
  }
  const account = await admin
    .from('sgrh_usuarios')
    .select('usr_auth_id')
    .eq('usr_id', usrId)
    .maybeSingle()
  if (account.error || !account.data?.usr_auth_id)
    return { ok: false, error: 'No se encontró la cuenta del kiosco.' }
  const updated = await admin.auth.admin.updateUserById(account.data.usr_auth_id, { password })
  if (updated.error) return { ok: false, error: accountError(updated.error) }
  const recorded = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: 'clave',
    p_id: k.kio_id,
    p_data: {},
  })
  if (recorded.error)
    return {
      ok: false,
      error:
        'La contraseña cambió, pero no se pudieron cerrar las sesiones abiertas. Volvé a guardarla.',
    }
  return { ok: true, data: undefined }
}

/**
 * Registers a kiosk with its username and password. The kiosk is saved first;
 * if its account cannot be created, it stays pending and the error comes back
 * in `accessError`, so the administrator retries with "Definir contraseña"
 * instead of registering it twice.
 */
export async function createKiosk(
  input: KioskInput
): Promise<Result<{ id: string; accessError?: string }>> {
  const parsed = kioskSchema.safeParse(input)
  if (!parsed.success)
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Revisá los datos del kiosco.',
    }
  const { admin, empresa, actor } = await branchAdmin(true)
  const { password, ...data } = parsed.data
  const kioskEmail = internalKioskEmail()
  const r = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: 'crear',
    // gen types no refleja que la RPC acepta NULL (= crear).
    p_id: null as unknown as string,
    p_data: { ...data, email: kioskEmail },
  })
  if (r.error)
    return {
      ok: false,
      error:
        r.error.code === '23505'
          ? 'Ese usuario o esa cuenta ya están registrados en otro kiosco.'
          : r.error.message,
    }
  const access = await grantKioskAccess(
    admin,
    empresa,
    actor,
    {
      kio_id: r.data,
      kio_email: kioskEmail,
      kio_usuario_id: null,
      kio_estado: 'pendiente',
      kio_sucursal_id: data.sucursal_id,
    },
    password
  )
  refresh()
  return { ok: true, data: { id: r.data, accessError: access.ok ? undefined : access.error } }
}

/** Defines or changes the kiosk password; a change signs out every device. */
export async function setKioskPassword(id: string, password: string): Promise<Result> {
  if (!kioskId.safeParse(id).success) return { ok: false, error: 'Kiosco inválido.' }
  const parsed = kioskPasswordSchema.safeParse(password)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { admin, empresa, actor } = await branchAdmin(true)
  const { data: k, error } = await admin
    .from('sgrh_kioscos')
    .select('kio_id,kio_email,kio_usuario_id,kio_estado,kio_sucursal_id')
    .eq('kio_id', id)
    .eq('kio_empresa_id', empresa)
    .single()
  if (error || !k) return { ok: false, error: 'Kiosco no encontrado.' }
  try {
    const r = await grantKioskAccess(admin, empresa, actor, k, parsed.data)
    if (r.ok) refresh()
    return r
  } catch (e) {
    return failure(e)
  }
}

export async function setKioskLogin(id: string, login: string): Promise<Result> {
  if (!kioskId.safeParse(id).success) return { ok: false, error: 'Kiosco inválido.' }
  const parsed = kioskLoginSchema.safeParse(login)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }
  const { admin, empresa, actor } = await branchAdmin(true)
  const r = await admin.rpc('sgrh_manage_kiosk', {
    p_actor: actor,
    p_empresa: empresa,
    p_action: 'usuario',
    p_id: id,
    p_data: { login: parsed.data },
  })
  if (r.error)
    return {
      ok: false,
      error: r.error.code === '23505' ? 'Ese usuario ya está en uso. Elegí otro.' : r.error.message,
    }
  refresh()
  return { ok: true, data: undefined }
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
