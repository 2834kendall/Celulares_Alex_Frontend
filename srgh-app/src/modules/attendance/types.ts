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
 * el tipo, coordenadas (opcionales, si el navegador las cede) y el PIN de
 * respaldo (opcional, si la camara "fallo" — hoy mockeada por un selector).
 */
export const kioskMarkSchema = z.object({
  employeeId: z.number().int().positive(),
  tipo: marcaTipoSchema,
  latitud: z.number().min(-90).max(90).nullable(),
  longitud: z.number().min(-180).max(180).nullable(),
  pin: z
    .string()
    .regex(/^\d{4}$/, 'El PIN debe tener 4 digitos.')
    .nullable(),
  dispositivoId: z.string().trim().max(100).nullable(),
})

export type KioskMarkInput = z.input<typeof kioskMarkSchema>
