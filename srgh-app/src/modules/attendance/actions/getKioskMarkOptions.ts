'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { allowedNextMarks, type MarkType } from '@/modules/attendance/lib/marks'
import { loadDayJourney, resolveKioskSucursalIds } from '@/modules/attendance/lib/dayJourney'
import { findWorkableDay } from '@/modules/attendance/lib/workingDay'
import { todayInCostaRica } from '@/modules/attendance/lib/time'

export type GetKioskMarkOptionsResult =
  { ok: true; allowed: MarkType[] } | { ok: false; error: string }

const employeeIdSchema = z.number().int().positive()

/**
 * Que marcas puede hacer AHORA este colaborador en este kiosco (SGRH-88): el
 * kiosco pinta solo esos botones. Es la mitad visible de la regla; la otra
 * mitad, la que de verdad protege, es la misma validacion en
 * registerKioskMark.
 *
 * Mismo permiso que marcar: quien no puede marcar no tiene por que preguntar.
 */
export async function getKioskMarkOptions(employeeId: number): Promise<GetKioskMarkOptionsResult> {
  if (!employeeIdSchema.safeParse(employeeId).success) {
    return { ok: false, error: 'Colaborador invalido.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as {
    usr_id?: number
    empresa_id?: number
    sucursal_ids?: number[] | null
  }

  if (!meta.empresa_id) {
    return { ok: false, error: 'No se pudo determinar la empresa del kiosco.' }
  }

  const supabase = await createClient()
  const sucursalIds = await resolveKioskSucursalIds(supabase, meta)

  if (!sucursalIds || sucursalIds.length === 0) {
    return { ok: false, error: 'Este kiosco no tiene una sucursal asignada.' }
  }

  const hoy = todayInCostaRica()
  const turno = await findWorkableDay(supabase, hoy, employeeId, sucursalIds)

  if (!turno) {
    return { ok: false, error: 'No tienes turno asignado en esta sucursal hoy.' }
  }

  const jornada = await loadDayJourney(supabase, turno.employmentHistoryId, hoy)

  if (!jornada.ok) {
    return { ok: false, error: jornada.error }
  }

  return { ok: true, allowed: allowedNextMarks(jornada.journey) }
}
