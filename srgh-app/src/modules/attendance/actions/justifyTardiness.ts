'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { nowInCostaRica } from '@/modules/attendance/lib/time'
import { justifyTardinessSchema, type JustifyTardinessInput } from '@/modules/attendance/types'

export type JustifyTardinessResult = { ok: true } | { ok: false; error: string }

interface MarkRow {
  mar_id: number
  mar_tipo: string
  sgrh_historial_laboral: { lab_empleado_id: number } | null
}

/**
 * Avisa al colaborador que un encargado toco la justificacion de su tardanza.
 * Es "mejor esfuerzo": si falla, no deshace el cambio que ya se guardo — mismo
 * criterio que el resto de notificaciones del proyecto (ver saveManualMark).
 *
 * Se notifica en los dos sentidos. Poner la justificacion es una buena
 * noticia, pero QUITARLA le devuelve una tardanza al conteo del mes y puede
 * acercarlo a la advertencia: enterarse por sorpresa seria peor.
 */
async function notifyEmployee(
  supabase: Awaited<ReturnType<typeof createClient>>,
  empresaId: number | undefined,
  employeeId: number | null,
  justificada: boolean
) {
  if (!empresaId || !employeeId) return

  await supabase.from('sgrh_notificaciones').insert({
    ntf_empresa_id: empresaId,
    ntf_empleado_id: employeeId,
    ntf_tipo_notificacion: 'informacion',
    ntf_canal: 'app',
    ntf_titulo: justificada ? 'Tardanza justificada' : 'Justificacion retirada',
    ntf_mensaje: justificada
      ? 'Un encargado marco una de tus tardanzas como justificada: deja de contar para el mes.'
      : 'Un encargado retiro la justificacion de una de tus tardanzas: vuelve a contar para el mes.',
  })
}

/**
 * Declara que una tardanza no es responsabilidad del colaborador — el sistema
 * fallo y no pudo marcar estando ya en tienda, o cualquier otro caso que el
 * encargado o el administrador analicen (SGRH-87).
 *
 * La tardanza justificada SIGUE VIENDOSE en el reporte; lo unico que cambia es
 * que no suma al conteo del mes ni dispara la advertencia. Ocultarla seria
 * perder la trazabilidad de que el atraso existio.
 *
 * Con `justificada: false` se revierte, y las cuatro columnas vuelven a null
 * juntas: el CHECK de la migracion no admite una justificacion a medias.
 */
export async function justifyTardiness(
  input: JustifyTardinessInput
): Promise<JustifyTardinessResult> {
  const parsed = justifyTardinessSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Datos invalidos.' }
  }

  const claims = await requirePermission(PERMISOS.ASISTENCIA_WRITE)
  const meta = claims.app_metadata as { usr_id?: number; empresa_id?: number }

  // Sin usuario no se puede justificar: el CHECK de la base exige saber QUIEN
  // lo hizo, y una justificacion anonima no se puede auditar.
  if (!meta.usr_id) {
    return { ok: false, error: 'No se pudo determinar el usuario que justifica.' }
  }

  const { markId, justificada, motivo } = parsed.data
  const supabase = await createClient()

  // La RLS (marcas_select) ya acota a las sucursales visibles: si la marca es
  // de otra tienda, aca no aparece y se corta antes de intentar el update.
  const { data: mark, error: errMark } = await supabase
    .from('sgrh_marcas_asistencia')
    .select('mar_id, mar_tipo, sgrh_historial_laboral ( lab_empleado_id )')
    .eq('mar_id', markId)
    .maybeSingle<MarkRow>()

  if (errMark) {
    return { ok: false, error: 'No se pudo cargar la marca.' }
  }

  if (!mark) {
    return { ok: false, error: 'La marca no existe o no pertenece a tus sucursales.' }
  }

  // Solo la entrada y el regreso del almuerzo pueden llegar tarde (SGRH-88).
  // Una salida o un receso no tienen tardanza que justificar, y dejar pasar
  // eso llenaria la tabla de filas que ningun reporte lee.
  if (mark.mar_tipo !== 'entrada' && mark.mar_tipo !== 'fin_almuerzo') {
    return {
      ok: false,
      error: 'Solo se puede justificar la entrada o el regreso del almuerzo.',
    }
  }

  const payload = justificada
    ? {
        mar_tardia_justificada: true,
        mar_tardia_justificacion: motivo,
        mar_tardia_justificada_por_id: meta.usr_id,
        mar_tardia_justificada_at: nowInCostaRica(),
      }
    : {
        mar_tardia_justificada: false,
        mar_tardia_justificacion: null,
        mar_tardia_justificada_por_id: null,
        mar_tardia_justificada_at: null,
      }

  const { error } = await supabase
    .from('sgrh_marcas_asistencia')
    .update(payload)
    .eq('mar_id', markId)

  if (error) {
    return { ok: false, error: 'No se pudo guardar la justificacion.' }
  }

  await notifyEmployee(
    supabase,
    meta.empresa_id,
    mark.sgrh_historial_laboral?.lab_empleado_id ?? null,
    justificada
  )

  revalidatePath('/attendance')

  return { ok: true }
}
