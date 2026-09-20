'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireKioskAccess } from '@/modules/attendance/lib/kioskAccess'
import {
  allowedNextMarks,
  isExitWindowOpen,
  isLunchWindowOpen,
  type MarkType,
} from '@/modules/attendance/lib/marks'
import {
  absenceBlocksMarkMessage,
  findApprovedAbsence,
  loadDayJourney,
  resolveKioskSucursalIds,
} from '@/modules/attendance/lib/dayJourney'
import { findWorkableDay } from '@/modules/attendance/lib/workingDay'
import { nowInCostaRica, timeOfDay, todayInCostaRica } from '@/modules/attendance/lib/time'

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

  const claims = await requireKioskAccess()
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
  // Programacion, ausencias y jornada con el cliente admin: la cuenta KIOSCO
  // no puede leer esas tablas (ver lib/kioskAccess.ts). Acotado a las
  // sucursales de la cuenta, ya validadas arriba.
  const admin = createAdminClient()
  const turno = await findWorkableDay(admin, hoy, employeeId, sucursalIds)

  if (!turno) {
    return { ok: false, error: 'No tienes turno asignado en esta sucursal hoy.' }
  }

  const ausencia = await findApprovedAbsence(admin, turno.employmentHistoryId, hoy)

  if (!ausencia.ok) {
    return { ok: false, error: ausencia.error }
  }

  if (ausencia.tipo) {
    return { ok: false, error: absenceBlocksMarkMessage(ausencia.tipo) }
  }

  const jornada = await loadDayJourney(admin, turno.employmentHistoryId, hoy)

  if (!jornada.ok) {
    return { ok: false, error: jornada.error }
  }

  // El almuerzo solo dentro de su ventana y la salida solo cerca de su hora
  // (SGRH-88): la planilla liquida sobre la jornada programada, y una salida
  // marcada por error a media mañana cierra el dia.
  const ahora = timeOfDay(nowInCostaRica())

  return {
    ok: true,
    allowed: allowedNextMarks(jornada.journey, {
      lunchWindowOpen: isLunchWindowOpen(ahora, turno.expectedLunchStart),
      exitWindowOpen: isExitWindowOpen(ahora, turno.expectedEnd),
      breakScheduled: turno.expectedBreakStart !== null,
    }),
  }
}
