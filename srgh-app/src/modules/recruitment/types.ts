// src/modules/recruitment/types.ts
//
// Contrato de datos del módulo Recruitment (SGRH-61).
// Mismas reglas que modules/employees/types.ts:
//  1. Los schemas Zod se tipan contra database.types.ts para que cualquier
//     cambio de schema en Supabase lo detecte el compilador.
//  2. Los tipos de formulario se infieren desde Zod — no se declaran a mano.
//  3. Los view models son el DTO que usan los componentes; nunca exponen
//     columnas internas como cdo_path.

import { z } from 'zod'
import type { Database } from '@/types/database.types'

// ─── Aliases de tipos Supabase ────────────────────────────────────────────────

type CandidatoRow = Database['public']['Tables']['sgrh_candidatos']['Row']
type CandidatoInsert = Database['public']['Tables']['sgrh_candidatos']['Insert']

type PostulacionRow = Database['public']['Tables']['sgrh_postulaciones']['Row']
type PostulacionInsert = Database['public']['Tables']['sgrh_postulaciones']['Insert']

type CandidatoDocumentoRow = Database['public']['Tables']['sgrh_candidato_documentos']['Row']
type CandidatoDocumentoInsert = Database['public']['Tables']['sgrh_candidato_documentos']['Insert']

type PostulacionEtapaRow = Database['public']['Tables']['sgrh_postulacion_etapas']['Row']

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Los inputs HTML emiten '' cuando están vacíos; los campos opcionales de la DB
// esperan null. Mismo helper que modules/employees/types.ts.

const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema)

// ─── Schema de candidato ──────────────────────────────────────────────────────
// cdt_empresa_id queda fuera: lo fija el servidor desde el JWT, nunca el
// cliente (es la columna que aísla candidatos entre empresas).
//
// cdt_tipo_identificacion_id / cdt_numero_identificacion son nullable en la
// DB, pero se piden obligatorios acá: sin identificación el UNIQUE que evita
// registrar dos veces al mismo candidato no tiene nada que comparar. Mismo
// patrón que direccionSchema en employees/types.ts.

export const candidatoSchema = z.object({
  cdt_nombre: z
    .string({ error: 'El nombre es obligatorio' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar 100 caracteres'),

  cdt_apellido_1: z
    .string({ error: 'El primer apellido es obligatorio' })
    .trim()
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(100, 'El apellido no puede superar 100 caracteres'),

  cdt_apellido_2: emptyToNull(
    z.string().trim().max(100, 'El apellido no puede superar 100 caracteres').nullable().optional()
  ),

  cdt_tipo_identificacion_id: z
    .number({ error: 'El tipo de identificación es obligatorio' })
    .int()
    .positive('Seleccione un tipo de identificación válido'),

  cdt_numero_identificacion: z
    .string({ error: 'El número de identificación es obligatorio' })
    .trim()
    .min(1, 'El número de identificación es obligatorio')
    .max(30, 'Máximo 30 caracteres'),

  cdt_email: z.email('Correo electrónico inválido'),

  cdt_telefono: emptyToNull(
    z
      .string()
      .regex(/^\+?[\d\s\-()]{7,20}$/, 'Número de teléfono inválido')
      .nullable()
      .optional()
  ),

  cdt_fuente_reclutamiento: emptyToNull(
    z.string().trim().max(100, 'Máximo 100 caracteres').nullable().optional()
  ),
}) satisfies z.ZodType<Omit<CandidatoInsert, 'cdt_id' | 'cdt_created_at' | 'cdt_empresa_id'>>

export type CandidatoInput = z.infer<typeof candidatoSchema>

// ─── Schema de postulación ────────────────────────────────────────────────────
// pos_candidato_id / pos_empresa_id / pos_estado_final / pos_etapa_actual_id /
// pos_empleado_id / pos_motivo_descarte / pos_fecha_cierre /
// pos_puntaje_promedio quedan fuera: los administra el servidor a lo largo
// del embudo, nunca el formulario de alta.

export const postulacionSchema = z.object({
  pos_puesto_id: z
    .number({ error: 'El puesto es obligatorio' })
    .int()
    .positive('Seleccione un puesto válido'),

  pos_sucursal_id: z.preprocess(
    (value) => (value === '' || (typeof value === 'number' && Number.isNaN(value)) ? null : value),
    z.number().int().positive('Seleccione una sucursal válida').nullable().optional()
  ),

  pos_observaciones: emptyToNull(
    z.string().trim().max(300, 'Máximo 300 caracteres').nullable().optional()
  ),
}) satisfies z.ZodType<
  Omit<
    PostulacionInsert,
    | 'pos_id'
    | 'pos_created_at'
    | 'pos_candidato_id'
    | 'pos_empresa_id'
    | 'pos_estado_final'
    | 'pos_fecha_postula'
    | 'pos_etapa_actual_id'
    | 'pos_empleado_id'
    | 'pos_motivo_descarte'
    | 'pos_fecha_cierre'
    | 'pos_puntaje_promedio'
  >
>

export type PostulacionInput = z.infer<typeof postulacionSchema>

// ─── Schema combinado: alta de candidato + primera postulación ──────────────
// El botón "Nuevo candidato" del tablero crea ambos en un solo submit.

export const nuevoCandidatoSchema = z.object({
  candidato: candidatoSchema,
  postulacion: postulacionSchema,
})

export type NuevoCandidatoInput = z.infer<typeof nuevoCandidatoSchema>

// ─── Schema de metadata de documento de candidato ────────────────────────────
// Igual que documentoMetadataSchema en employees: solo lo que captura el
// usuario. cdo_path/cdo_mime/cdo_creado_por los completa el servidor.

export const candidatoDocumentoMetadataSchema = z.object({
  cdo_tipo: z.enum(['CV', 'CEDULA', 'REFERENCIA', 'TITULO', 'OTRO'], {
    error: 'Seleccione el tipo de documento',
  }),

  cdo_nombre: z
    .string({ error: 'El nombre del documento es obligatorio' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(150, 'Máximo 150 caracteres'),
}) satisfies z.ZodType<
  Omit<
    CandidatoDocumentoInsert,
    | 'cdo_id'
    | 'cdo_empresa_id'
    | 'cdo_candidato_id'
    | 'cdo_path'
    | 'cdo_mime'
    | 'cdo_creado_por'
    | 'cdo_created_at'
  >
>

export type CandidatoDocumentoMetadataInput = z.infer<typeof candidatoDocumentoMetadataSchema>

// ─── Schema de avance de etapa ────────────────────────────────────────────────
// Llama a la RPC registrar_etapa_postulacion. pet_responsable_id lo fija el
// servidor desde el JWT (usr_id), nunca el cliente.

export const avanzarEtapaSchema = z.object({
  postulacionId: z.number().int().positive(),
  etapaId: z.number({ error: 'Seleccione una etapa' }).int().positive(),
  resultado: z.enum(['aprobado', 'rechazado', 'pendiente'], {
    error: 'Seleccione un resultado',
  }),
  notas: emptyToNull(z.string().trim().max(300, 'Máximo 300 caracteres').nullable().optional()),
  fecha: z
    .string({ error: 'La fecha es obligatoria' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),
})

export type AvanzarEtapaInput = z.infer<typeof avanzarEtapaSchema>

// ─── Schema de descarte ───────────────────────────────────────────────────────

export const rechazarPostulacionSchema = z.object({
  postulacionId: z.number().int().positive(),
  motivo: z
    .string({ error: 'Indique el motivo del descarte' })
    .trim()
    .min(3, 'Describe brevemente el motivo')
    .max(300, 'Máximo 300 caracteres'),
})

export type RechazarPostulacionInput = z.infer<typeof rechazarPostulacionSchema>

// ─── Schema de puntaje ────────────────────────────────────────────────────────
// Escala 0-10, igual que evaluations/lib/scoring.ts (averageScore /
// classifyScore). psc_no_aplica excluye ese criterio del promedio.

const puntajeCriterioSchema = z
  .object({
    criterioId: z.number().int().positive(),
    puntaje: z.number().min(0, 'Mínimo 0').max(10, 'Máximo 10').nullable(),
    noAplica: z.boolean(),
    observacion: emptyToNull(
      z.string().trim().max(300, 'Máximo 300 caracteres').nullable().optional()
    ),
  })
  .refine((data) => data.noAplica || data.puntaje !== null, {
    message: 'Ingrese un puntaje o marque "No aplica"',
    path: ['puntaje'],
  })

export const guardarPuntajesSchema = z.object({
  postulacionId: z.number().int().positive(),
  puntajes: z.array(puntajeCriterioSchema).min(1, 'No hay criterios activos para calificar'),
})

export type GuardarPuntajesInput = z.infer<typeof guardarPuntajesSchema>

// ─── View Model — Ítem de catálogo (reexportado por conveniencia) ───────────

export interface CatalogoItem {
  id: number
  nombre: string
}

// ─── Rubro de selección (área + criterio) ────────────────────────────────────
// Mismo concepto "rubro" que evaluations/types.ts (RubroRow / rubroSchema):
// un área y su criterio se editan como una sola unidad desde la pantalla de
// catálogos, para que Edwin pueda agregar o modificar criterios sin tocar
// código.

export interface RubroSeleccionRow {
  areaId: number
  criterioId: number | null
  nombre: string
  descripcion: string
  activo: boolean
}

export const rubroSeleccionSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres.')
    .max(80, 'El nombre no puede superar los 80 caracteres.'),
  descripcion: z
    .string()
    .trim()
    .min(3, 'La descripción debe tener al menos 3 caracteres.')
    .max(200, 'La descripción no puede superar los 200 caracteres.'),
})

export type RubroSeleccionInput = z.infer<typeof rubroSeleccionSchema>

// ─── View Model — Etapa del embudo ───────────────────────────────────────────

export interface EtapaSeleccionItem {
  id: number
  nombre: string
  orden: number
  fase: 1 | 2 | 3
}

// ─── View Model — Criterio de puntaje ────────────────────────────────────────

export interface CriterioSeleccionItem {
  id: number
  descripcion: string
  areaId: number
  areaNombre: string
}

// ─── View Model — Documento de candidato ─────────────────────────────────────
// Nunca expone cdo_path: la descarga se pide por cdo_id y el servidor firma
// la URL al vuelo.

export type CandidatoDocumento = Pick<
  CandidatoDocumentoRow,
  'cdo_id' | 'cdo_candidato_id' | 'cdo_tipo' | 'cdo_nombre' | 'cdo_mime' | 'cdo_created_at'
>

// ─── Documento pendiente del formulario (solo cliente) ───────────────────────
// Antes de crear el candidato no hay cdo_candidato_id: el archivo y su
// metadata viven en memoria y se suben con el candidatoId que devuelve
// createCandidate — mismo patrón que DocumentoPendiente en employees.

export interface CandidatoDocumentoPendiente {
  key: string
  file: File
  metadata: CandidatoDocumentoMetadataInput
}

// ─── View Model — Ítem de lista de candidatos ────────────────────────────────

export type CandidatoListItem = Pick<
  CandidatoRow,
  | 'cdt_id'
  | 'cdt_nombre'
  | 'cdt_apellido_1'
  | 'cdt_apellido_2'
  | 'cdt_email'
  | 'cdt_telefono'
  | 'cdt_numero_identificacion'
>

// ─── View Model — Etapa recorrida por una postulación ────────────────────────

export type PostulacionEtapaItem = Pick<
  PostulacionEtapaRow,
  'pet_id' | 'pet_etapa_id' | 'pet_fecha' | 'pet_resultado' | 'pet_notas'
> & {
  etapaNombre: string
  responsableNombre: string | null
}

// ─── View Model — Puntaje por criterio ───────────────────────────────────────

export interface PuntajeCriterioItem {
  criterioId: number
  criterioDescripcion: string
  areaNombre: string
  puntaje: number | null
  noAplica: boolean
  observacion: string | null
}

// ─── View Model — Postulación con su detalle ─────────────────────────────────
// DTO de una tarjeta del tablero / de la sección de postulaciones en la
// ficha del candidato.

export type PostulacionDetalle = Pick<
  PostulacionRow,
  | 'pos_id'
  | 'pos_estado_final'
  | 'pos_fecha_postula'
  | 'pos_fecha_cierre'
  | 'pos_motivo_descarte'
  | 'pos_observaciones'
  | 'pos_puntaje_promedio'
  | 'pos_empleado_id'
> & {
  puestoNombre: string
  sucursalNombre: string | null
  etapaActual: EtapaSeleccionItem | null
  etapas: PostulacionEtapaItem[]
  puntajes: PuntajeCriterioItem[]
}

// ─── View Model — Detalle de candidato ───────────────────────────────────────
// DTO para /recruitment/candidates/[id].

// Los campos se listan uno por uno en vez de heredar CandidatoRow entero:
// cdt_cv_url sigue existiendo en la tabla (la base original guarda URLs ahí
// y la migración SGRH-61 no las borra), pero está deprecada — los archivos
// del candidato viven en sgrh_candidato_documentos. Sacarla del DTO evita
// que se filtre a la UI por herencia.
export type CandidatoDetalle = Pick<
  CandidatoRow,
  | 'cdt_id'
  | 'cdt_empresa_id'
  | 'cdt_nombre'
  | 'cdt_apellido_1'
  | 'cdt_apellido_2'
  | 'cdt_email'
  | 'cdt_telefono'
  | 'cdt_numero_identificacion'
  | 'cdt_tipo_identificacion_id'
  | 'cdt_fuente_reclutamiento'
  | 'cdt_created_at'
> & {
  tipoIdentificacionNombre: string
  documentos: CandidatoDocumento[]
  postulaciones: PostulacionDetalle[]
}
