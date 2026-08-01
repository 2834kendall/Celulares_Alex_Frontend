import { z } from 'zod'

export interface RubroRow {
  areaId: number
  criterioId: number | null
  nombre: string
  descripcion: string
  activo: boolean
}

export const rubroSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(3, 'El nombre debe tener al menos 3 caracteres.')
    .max(80, 'El nombre no puede superar los 80 caracteres.'),
  descripcion: z
    .string()
    .trim()
    .min(3, 'La descripcion debe tener al menos 3 caracteres.')
    .max(200, 'La descripcion no puede superar los 200 caracteres.'),
})

export type RubroInput = z.infer<typeof rubroSchema>

/** Notas cualitativas de una evaluacion, serializadas en eve_observaciones. */
export interface EvaluationNotes {
  fortalezas: string[]
  mejoras: string[]
  comentarios: string
}

export interface EvaluationDetail {
  id: number
  fecha: string
  periodo: string
  tipo: string
  promedio: number | null
  resultado: string | null
  evaluador: string | null
  /** Puntaje por criterio (criterioId -> nota 0-10). */
  scores: Record<number, number>
  /** Observacion del evaluador por criterio (criterioId -> texto). */
  observations: Record<number, string>
  notes: EvaluationNotes
}

export interface CollaboratorRow {
  labId: number
  empId: number
  fullName: string
  idNumber: string
  position: string | null
  branchId: number
  branchName: string
  /** Ultima evaluacion registrada (la vigente). */
  evaluation: EvaluationDetail | null
  /** Historico completo de evaluaciones, de la mas reciente a la mas antigua. */
  history: EvaluationDetail[]
}

export interface BranchOption {
  id: number
  name: string
}

/** Tipos de evaluacion usados por la empresa (hoja "Datos Generales"). */
export const EVALUATION_TYPES = ['Mensual', 'Sorpresa'] as const

const scoreSchema = z
  .object({
    criterioId: z.number().int().positive(),
    puntaje: z
      .number({ message: 'Ingrese una nota de 0 a 10.' })
      .int('La nota debe ser un numero entero.')
      .min(0, 'La nota minima es 0.')
      .max(10, 'La nota maxima es 10.')
      .nullable(),
    observacion: z.string().trim().max(300, 'Maximo 300 caracteres por observacion.'),
    noAplica: z.boolean(),
  })
  .refine((s) => s.noAplica || s.puntaje !== null, {
    message: 'Ingrese la nota del rubro o marquelo como no aplica.',
    path: ['puntaje'],
  })

export const evaluationSchema = z
  .object({
    labId: z.number({ message: 'Seleccione un colaborador.' }).int().positive(),
    tipo: z.enum(EVALUATION_TYPES, { message: 'Seleccione el tipo de evaluacion.' }),
    periodoInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione la fecha de inicio.'),
    periodoFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Seleccione la fecha de fin.'),
    scores: z.array(scoreSchema).min(1, 'Debe calificar al menos un rubro.'),
    fortalezas: z.array(z.string().trim().max(200)).max(20),
    mejoras: z.array(z.string().trim().max(200)).max(20),
    comentarios: z.string().trim().max(600, 'Maximo 600 caracteres.'),
  })
  .refine((v) => v.periodoFin >= v.periodoInicio, {
    message: 'La fecha de fin debe ser posterior a la de inicio.',
    path: ['periodoFin'],
  })
  .refine((v) => v.scores.some((s) => !s.noAplica), {
    message: 'Debe calificar al menos un rubro que aplique.',
    path: ['scores'],
  })

export type EvaluationInput = z.infer<typeof evaluationSchema>

export const evaluationNotesSchema = z.object({
  fortalezas: z.array(z.string().trim().max(200)).max(20),
  mejoras: z.array(z.string().trim().max(200)).max(20),
  comentarios: z.string().trim().max(600, 'Maximo 600 caracteres.'),
})
