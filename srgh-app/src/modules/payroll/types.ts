// src/modules/payroll/types.ts
//
// Contrato de datos del módulo Payroll (Nómina).
// Mismas reglas que employees/types.ts:
//  1. Los schemas Zod de Insert se tipan contra database.types.ts.
//  2. Los tipos de formulario se infieren desde Zod.
//  3. Los view models son DTOs para los componentes; no exponen columnas crudas.

import { z } from 'zod'
import type { Database } from '@/types/database.types'

// ─── Aliases de tipos Supabase ────────────────────────────────────────────────

type NominaPeriodoInsert = Database['public']['Tables']['sgrh_nomina_periodo']['Insert']

// ─── View models ─────────────────────────────────────────────────────────────

export interface CatalogoItem {
  id: number
  nombre: string
}

/** Estados del ciclo de vida de un periodo (npe_estado, default 'borrador'). */
export type PeriodoEstado = 'borrador' | 'aprobado' | 'pagado'

export interface PeriodoListItem {
  id: number
  mes: number
  anio: number
  quincena: number
  fechaInicio: string | null
  fechaFin: string | null
  estado: string
  fechaPago: string | null
  sucursalNombre: string
  totalEmpleados: number
}

/** Fila de la planilla: un empleado dentro de un periodo. */
export interface DetalleNominaItem {
  id: number
  empleadoNombre: string
  salarioBruto: number
  totalDeducciones: number
  cargasPatronales: number
  salarioNeto: number
  pagado: boolean
}

export interface PeriodoDetalle {
  id: number
  mes: number
  anio: number
  quincena: number
  fechaInicio: string | null
  fechaFin: string | null
  estado: string
  fechaPago: string | null
  observaciones: string | null
  sucursalNombre: string
  detalles: DetalleNominaItem[]
}

// ─── Schema de creación de periodo ───────────────────────────────────────────
// El empresa_id NO viene del formulario: lo toma la server action del JWT y
// RLS lo re-verifica en el insert (npe_empresa_id = get_empresa_id()).

const anioActual = new Date().getFullYear()

export const crearPeriodoSchema = z
  .object({
    npe_sucursal_id: z
      .number({ error: 'La sucursal es obligatoria' })
      .int()
      .positive('Debe seleccionar una sucursal válida'),

    npe_periodo_mes: z
      .number({ error: 'El mes es obligatorio' })
      .int()
      .min(1, 'Mes inválido')
      .max(12, 'Mes inválido'),

    npe_periodo_anio: z
      .number({ error: 'El año es obligatorio' })
      .int()
      .min(2020, 'El año no puede ser anterior a 2020')
      .max(anioActual + 1, 'El año no puede ser tan lejano'),

    npe_quincena: z
      .number({ error: 'La quincena es obligatoria' })
      .int()
      .min(1, 'Quincena inválida')
      .max(2, 'Quincena inválida'),

    npe_fecha_inicio_periodo: z
      .string({ error: 'La fecha de inicio es obligatoria' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de inicio inválida'),

    npe_fecha_fin_periodo: z
      .string({ error: 'La fecha de fin es obligatoria' })
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha de fin inválida'),

    npe_observaciones: z.preprocess(
      (value) => (value === '' ? null : value),
      z
        .string()
        .max(500, 'Las observaciones no pueden superar 500 caracteres')
        .nullable()
        .optional()
    ),
  })
  .refine((data) => data.npe_fecha_fin_periodo >= data.npe_fecha_inicio_periodo, {
    message: 'La fecha de fin debe ser posterior o igual a la de inicio',
    path: ['npe_fecha_fin_periodo'],
  })

export type CrearPeriodoInput = z.infer<typeof crearPeriodoSchema>

// Guardia de compilación: si el schema deja de ser asignable al Insert de la
// DB (columna renombrada, tipo cambiado), TypeScript lo marca aquí.
type _CrearPeriodoAlineado =
  CrearPeriodoInput extends Omit<NominaPeriodoInsert, 'npe_empresa_id' | 'npe_estado'>
    ? true
    : never
const _alineado: _CrearPeriodoAlineado = true
void _alineado
