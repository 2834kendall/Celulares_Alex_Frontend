import { z } from 'zod'
import type { Database } from '@/types/database.types'
import { MARK_TYPES } from '@/modules/attendance/lib/marks'

export type MarkRow = Database['public']['Tables']['sgrh_marcas_asistencia']['Row']

/**
 * mar_tipo es varchar en la base de datos (el CHECK de la migracion no genera
 * un enum en los tipos de Supabase), asi que la union vive aca y se valida
 * con este esquema en cada lectura/escritura — igual que el resto del
 * proyecto trata columnas de texto con reglas cerradas.
 */
export const marcaTipoSchema = z.enum(MARK_TYPES)

export const METODOS_VERIFICACION = ['FACIAL', 'MANUAL'] as const
export const metodoVerificacionSchema = z.enum(METODOS_VERIFICACION)

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/
/** "YYYY-MM-DD HH:mm:ss" naive, el mismo formato que escribe lib/time.ts. */
const naiveTimestampRegex = /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/

/**
 * Corregir una marca existente o agregar una que nunca se registro. `markId`
 * distingue los dos casos: null = crear, numero = actualizar esa fila.
 * `fecha`/`hora` son la hora REAL del evento (la que ingresa el gerente),
 * nunca la hora en que se hace la correccion — ver decisiones de SGRH-21.
 */
export const manualMarkSchema = z.object({
  markId: z.number().int().positive().nullable(),
  employmentHistoryId: z.number().int().positive(),
  employeeId: z.number().int().positive(),
  sucursalId: z.number().int().positive(),
  tipo: marcaTipoSchema,
  fecha: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
  hora: z.string().regex(timeRegex, 'Formato de hora invalido (HH:mm).'),
  observacion: z
    .string('La justificacion es requerida.')
    .trim()
    .min(10, 'Escriba una justificacion de al menos 10 caracteres.')
    .max(500, 'Maximo 500 caracteres.'),
})

export type ManualMarkInput = z.input<typeof manualMarkSchema>

/**
 * Marca del kiosco: el empleado NO inicia sesion, el dispositivo si (cuenta
 * KIOSCO). Trae solo lo que el kiosco puede saber — a que empleado se marca,
 * el tipo, coordenadas (opcionales, si el navegador las cede) y el ticket
 * que prueba que Face ID lo reconocio.
 *
 * Sin PIN desde SGRH-88: el unico camino es el rostro. Si Face ID falla, la
 * marca la registra el encargado desde el panel (decision del cliente).
 */
export const kioskMarkSchema = z.object({
  employeeId: z.number().int().positive(),
  tipo: marcaTipoSchema,
  latitud: z.number().min(-90).max(90).nullable(),
  longitud: z.number().min(-180).max(180).nullable(),
  dispositivoId: z.string().trim().max(100).nullable(),
  // Ticket HMAC emitido por verifyFace cuando el rostro hizo MATCH.
  // Obligatorio: sin rostro verificado no hay marca desde el kiosco.
  ticketFacial: z.string().min(1).max(500),
  // Hora REAL del evento, no la de su registro en el servidor. Solo la manda
  // la cola offline al sincronizar: la tablet marco sin red y esa hora es la
  // unica verdadera. Una marca en linea la deja en null y el servidor estampa
  // su propio reloj, que en ese caso son el mismo instante.
  fechaHora: z
    .string()
    .regex(naiveTimestampRegex, 'Formato de fecha y hora invalido.')
    .nullable()
    .default(null),
})

export type KioskMarkInput = z.input<typeof kioskMarkSchema>

/**
 * Vector facial cifrado en el cliente (AES-256-GCM, Web Crypto) antes de
 * viajar al Server Action. La foto nunca sale del dispositivo: esto es solo
 * el embedding numerico, y ni siquiera ese viaja en claro.
 */
export const encryptedVectorSchema = z.object({
  iv: z.string().min(1).max(64),
  data: z.string().min(1).max(10_000),
})

export type EncryptedVectorInput = z.input<typeof encryptedVectorSchema>

export const verifyFaceSchema = z.object({
  vector: encryptedVectorSchema,
  dispositivoId: z.string().trim().max(100).nullable(),
})

export type VerifyFaceInput = z.input<typeof verifyFaceSchema>

export const enrollFaceSchema = z.object({
  employeeId: z.number().int().positive(),
  vector: encryptedVectorSchema,
})

export type EnrollFaceInput = z.input<typeof enrollFaceSchema>

/**
 * Resumen mensual de tardias/ausencias (panel del gerente). `fecha` es
 * cualquier dia dentro del mes a consultar — el servidor calcula los limites
 * del mes calendario a partir de ella, igual que el "?date=" del panel diario.
 */
export const getMonthlyAttendanceSummarySchema = z.object({
  fecha: z.string().regex(dateRegex, 'Formato de fecha invalido (YYYY-MM-DD).'),
})

export type GetMonthlyAttendanceSummaryInput = z.input<typeof getMonthlyAttendanceSummarySchema>

/** Minimo del motivo, igual que la justificacion de una correccion manual. */
const MOTIVO_MINIMO = 10

/**
 * Marcar (o desmarcar) una tardanza como justificada (SGRH-87). `markId` es la
 * marca de ENTRADA que llego tarde.
 *
 * El mismo esquema cubre poner y quitar: con `justificada: false` el motivo
 * sobra y se limpia. Cuando se justifica, el motivo es obligatorio — la razon
 * de existir de esto es dejar por escrito POR QUE no cuenta, y una
 * justificacion sin motivo no se puede auditar despues.
 */
export const justifyTardinessSchema = z
  .object({
    markId: z.number().int().positive(),
    justificada: z.boolean(),
    motivo: z.string().trim().max(500, 'Maximo 500 caracteres.').nullable().default(null),
  })
  .refine((v) => !v.justificada || (v.motivo !== null && v.motivo.length >= MOTIVO_MINIMO), {
    message: `Escriba un motivo de al menos ${MOTIVO_MINIMO} caracteres.`,
    path: ['motivo'],
  })

export type JustifyTardinessInput = z.input<typeof justifyTardinessSchema>
