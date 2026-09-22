'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import type {
  CandidatoDetalle,
  CandidatoDocumento,
  EtapaSeleccionItem,
  PostulacionDetalle,
  PostulacionEtapaItem,
  PuntajeCriterioItem,
} from '@/modules/recruitment/types'

interface CandidatoQueryRow {
  cdt_id: number
  cdt_nombre: string
  cdt_apellido_1: string
  cdt_apellido_2: string | null
  cdt_email: string
  cdt_telefono: string | null
  cdt_numero_identificacion: string | null
  cdt_tipo_identificacion_id: number | null
  cdt_fuente_reclutamiento: string | null
  cdt_empresa_id: number
  cdt_created_at: string
  sgrh_cat_tipos_identificacion: { tid_nombre: string } | null
}

interface PostulacionQueryRow {
  pos_id: number
  pos_estado_final: string
  pos_fecha_postula: string
  pos_fecha_cierre: string | null
  pos_motivo_descarte: string | null
  pos_observaciones: string | null
  pos_puntaje_promedio: number | null
  pos_empleado_id: number | null
  pos_etapa_actual_id: number | null
  sgrh_cat_puestos: { pue_nombre: string } | null
  sgrh_sucursales: { suc_nombre: string } | null
  sgrh_cat_etapas_seleccion: {
    eta_id: number
    eta_nombre: string
    eta_orden: number
    eta_fase: number | null
  } | null
}

interface EtapaHistorialQueryRow {
  pet_id: number
  pet_postulacion_id: number
  pet_etapa_id: number
  pet_fecha: string
  pet_resultado: string | null
  pet_notas: string | null
  sgrh_cat_etapas_seleccion: { eta_nombre: string } | null
  sgrh_usuarios: { usr_email: string } | null
}

interface PuntajeQueryRow {
  psc_postulacion_id: number
  psc_criterio_id: number
  psc_puntaje: number | null
  psc_no_aplica: boolean
  psc_observacion: string | null
  sgrh_cat_criterios_seleccion: {
    cri_descripcion: string
    sgrh_cat_areas_seleccion: { are_nombre: string } | null
  } | null
}

export type GetCandidateDetailResult =
  { ok: true; data: CandidatoDetalle } | { ok: false; error: string; notFound?: boolean }

/**
 * Ficha completa del candidato: datos, documentos y cada postulación con su
 * historial de etapas y puntaje. RLS ya limita las filas a la empresa del
 * usuario, así que un candidatoId de otra empresa simplemente no aparece
 * (mismo criterio "no existe bajo RLS" que getEmployeeDetail).
 */
export async function getCandidateDetail(candidatoId: number): Promise<GetCandidateDetailResult> {
  if (!Number.isInteger(candidatoId) || candidatoId <= 0) {
    return { ok: false, error: 'Candidato no encontrado.', notFound: true }
  }

  await requirePermission(PERMISOS.RECLUTAMIENTO_READ)

  const supabase = await createClient()

  const { data: candidato, error: errCandidato } = await supabase
    .from('sgrh_candidatos')
    .select(
      `
      cdt_id, cdt_nombre, cdt_apellido_1, cdt_apellido_2, cdt_email, cdt_telefono,
      cdt_numero_identificacion, cdt_tipo_identificacion_id, cdt_fuente_reclutamiento,
      cdt_empresa_id, cdt_created_at,
      sgrh_cat_tipos_identificacion ( tid_nombre )
    `
    )
    .eq('cdt_id', candidatoId)
    .maybeSingle()
    .returns<CandidatoQueryRow>()

  if (errCandidato || !candidato) {
    return { ok: false, error: 'Candidato no encontrado.', notFound: true }
  }

  const { data: documentos, error: errDocumentos } = await supabase
    .from('sgrh_candidato_documentos')
    .select('cdo_id, cdo_candidato_id, cdo_tipo, cdo_nombre, cdo_mime, cdo_created_at')
    .eq('cdo_candidato_id', candidatoId)
    .order('cdo_created_at', { ascending: false })
    .returns<CandidatoDocumento[]>()

  if (errDocumentos) {
    return { ok: false, error: 'No se pudieron cargar los documentos del candidato.' }
  }

  const { data: postulaciones, error: errPostulaciones } = await supabase
    .from('sgrh_postulaciones')
    .select(
      `
      pos_id, pos_estado_final, pos_fecha_postula, pos_fecha_cierre, pos_motivo_descarte,
      pos_observaciones, pos_puntaje_promedio, pos_empleado_id, pos_etapa_actual_id,
      sgrh_cat_puestos ( pue_nombre ),
      sgrh_sucursales ( suc_nombre ),
      sgrh_cat_etapas_seleccion ( eta_id, eta_nombre, eta_orden, eta_fase )
    `
    )
    .eq('pos_candidato_id', candidatoId)
    .order('pos_fecha_postula', { ascending: false })
    .returns<PostulacionQueryRow[]>()

  if (errPostulaciones) {
    return { ok: false, error: 'No se pudieron cargar las postulaciones.' }
  }

  const posIds = (postulaciones ?? []).map((p) => p.pos_id)

  let etapasPorPostulacion = new Map<number, PostulacionEtapaItem[]>()
  let puntajesPorPostulacion = new Map<number, PuntajeCriterioItem[]>()

  if (posIds.length > 0) {
    const { data: etapasHistorial, error: errEtapas } = await supabase
      .from('sgrh_postulacion_etapas')
      .select(
        `
        pet_id, pet_postulacion_id, pet_etapa_id, pet_fecha, pet_resultado, pet_notas,
        sgrh_cat_etapas_seleccion ( eta_nombre ),
        sgrh_usuarios ( usr_email )
      `
      )
      .in('pet_postulacion_id', posIds)
      .order('pet_fecha', { ascending: true })
      .returns<EtapaHistorialQueryRow[]>()

    if (errEtapas) {
      return { ok: false, error: 'No se pudo cargar el historial de etapas.' }
    }

    etapasPorPostulacion = new Map()
    for (const row of etapasHistorial ?? []) {
      const item: PostulacionEtapaItem = {
        pet_id: row.pet_id,
        pet_etapa_id: row.pet_etapa_id,
        pet_fecha: row.pet_fecha,
        pet_resultado: row.pet_resultado,
        pet_notas: row.pet_notas,
        etapaNombre: row.sgrh_cat_etapas_seleccion?.eta_nombre ?? '—',
        responsableNombre: row.sgrh_usuarios?.usr_email ?? null,
      }
      const lista = etapasPorPostulacion.get(row.pet_postulacion_id) ?? []
      lista.push(item)
      etapasPorPostulacion.set(row.pet_postulacion_id, lista)
    }

    const { data: puntajes, error: errPuntajes } = await supabase
      .from('sgrh_postulacion_puntajes')
      .select(
        `
        psc_postulacion_id, psc_criterio_id, psc_puntaje, psc_no_aplica, psc_observacion,
        sgrh_cat_criterios_seleccion ( cri_descripcion, sgrh_cat_areas_seleccion ( are_nombre ) )
      `
      )
      .in('psc_postulacion_id', posIds)
      .returns<PuntajeQueryRow[]>()

    if (errPuntajes) {
      return { ok: false, error: 'No se pudo cargar el puntaje.' }
    }

    puntajesPorPostulacion = new Map()
    for (const row of puntajes ?? []) {
      const item: PuntajeCriterioItem = {
        criterioId: row.psc_criterio_id,
        criterioDescripcion: row.sgrh_cat_criterios_seleccion?.cri_descripcion ?? '—',
        areaNombre: row.sgrh_cat_criterios_seleccion?.sgrh_cat_areas_seleccion?.are_nombre ?? '—',
        puntaje: row.psc_puntaje,
        noAplica: row.psc_no_aplica,
        observacion: row.psc_observacion,
      }
      const lista = puntajesPorPostulacion.get(row.psc_postulacion_id) ?? []
      lista.push(item)
      puntajesPorPostulacion.set(row.psc_postulacion_id, lista)
    }
  }

  const postulacionesDetalle: PostulacionDetalle[] = (postulaciones ?? []).map((row) => {
    const etapaActual: EtapaSeleccionItem | null = row.sgrh_cat_etapas_seleccion
      ? {
          id: row.sgrh_cat_etapas_seleccion.eta_id,
          nombre: row.sgrh_cat_etapas_seleccion.eta_nombre,
          orden: row.sgrh_cat_etapas_seleccion.eta_orden,
          fase: (row.sgrh_cat_etapas_seleccion.eta_fase ?? 1) as 1 | 2 | 3,
        }
      : null

    return {
      pos_id: row.pos_id,
      pos_estado_final: row.pos_estado_final,
      pos_fecha_postula: row.pos_fecha_postula,
      pos_fecha_cierre: row.pos_fecha_cierre,
      pos_motivo_descarte: row.pos_motivo_descarte,
      pos_observaciones: row.pos_observaciones,
      pos_puntaje_promedio: row.pos_puntaje_promedio,
      pos_empleado_id: row.pos_empleado_id,
      puestoNombre: row.sgrh_cat_puestos?.pue_nombre ?? '—',
      sucursalNombre: row.sgrh_sucursales?.suc_nombre ?? null,
      etapaActual,
      etapas: etapasPorPostulacion.get(row.pos_id) ?? [],
      puntajes: puntajesPorPostulacion.get(row.pos_id) ?? [],
    }
  })

  const { sgrh_cat_tipos_identificacion, ...candidatoBase } = candidato

  const data: CandidatoDetalle = {
    ...candidatoBase,
    tipoIdentificacionNombre: sgrh_cat_tipos_identificacion?.tid_nombre ?? '—',
    documentos: documentos ?? [],
    postulaciones: postulacionesDetalle,
  }

  return { ok: true, data }
}
