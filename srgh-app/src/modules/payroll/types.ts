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
type ConceptoNominaInsert = Database['public']['Tables']['sgrh_cat_conceptos_nomina']['Insert']

export type ConceptoNominaRow = Database['public']['Tables']['sgrh_cat_conceptos_nomina']['Row']

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

/**
 * Fila de la planilla: un empleado dentro de un periodo.
 * `montosPorConcepto` trae el monto crudo de cada concepto manual (código →
 * monto) que ya tenía guardado, para poder editarlos a mano. `horasTrabajadas`
 * y `salarioPorHora` alimentan el cálculo automático de horas extra.
 */
export interface DetalleNominaItem {
  id: number
  empleadoNombre: string
  empleadoCedula: string
  salarioBruto: number
  totalDeducciones: number
  cargasPatronales: number
  salarioNeto: number
  pagado: boolean
  fechaPago: string | null
  montosPorConcepto: Record<string, number>
  horasTrabajadas: number
  salarioPorHora: number
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

// ─── Schema del catálogo de conceptos de nómina ──────────────────────────────
// Catálogo global (sgrh_cat_conceptos_nomina): visible para cualquier
// autenticado, editable solo con CATALOGOS_WRITE (misma policy "cat_*" que
// usan tipos de jornada y rubros de evaluación).

export const CONCEPTO_TIPOS = ['ingreso', 'deduccion', 'patronal'] as const
export type ConceptoTipo = (typeof CONCEPTO_TIPOS)[number]

/**
 * Cómo se calcula el monto de un concepto — esto es lo que hace que el
 * catálogo describa la fórmula en vez de que el código la adivine:
 *  - monto_manual_ingreso:       el usuario escribe el monto; suma al bruto (ej. Comisión).
 *  - monto_manual_deduccion:     el usuario escribe el monto; resta del neto (ej. préstamo).
 *  - porcentaje_deduccion_bruto: con_porcentaje % del salario bruto; se resta (ej. CCSS obrera).
 *  - horas_extra_automatico:     el sistema lo calcula solo a partir de las horas trabajadas
 *                                que superen el tope normal (ver TOPE_HORAS_NORMALES_QUINCENAL
 *                                en lib/planilla.ts), multiplicadas por el salario por hora y
 *                                por con_porcentaje (ej. 150% = tiempo y medio).
 */
export const TIPOS_CALCULO_CONCEPTO = [
  'monto_manual_ingreso',
  'monto_manual_deduccion',
  'porcentaje_deduccion_bruto',
  'horas_extra_automatico',
] as const
export type TipoCalculoConcepto = (typeof TIPOS_CALCULO_CONCEPTO)[number]

/** con_porcentaje es obligatorio solo para estos dos tipos; en los demás debe quedar null. */
const TIPOS_CON_PORCENTAJE = new Set<TipoCalculoConcepto>([
  'porcentaje_deduccion_bruto',
  'horas_extra_automatico',
])

export const conceptoNominaSchema = z
  .object({
    // El input del formulario solo aplica mayúsculas por CSS (visual, no cambia
    // el valor real), así que el código se normaliza aquí antes de validar —
    // si no, escribir en minúscula rechazaría el formulario sin razón aparente.
    con_codigo: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
      z
        .string({ error: 'El código es obligatorio' })
        .min(2, 'El código debe tener al menos 2 caracteres')
        .max(50, 'El código no puede superar 50 caracteres')
        .regex(/^[A-Z0-9_]+$/, 'Usa solo letras, números y guion bajo (ej. BONO_ANUAL)')
    ),

    con_nombre: z
      .string({ error: 'El nombre es obligatorio' })
      .trim()
      .min(2, 'El nombre debe tener al menos 2 caracteres')
      .max(100, 'El nombre no puede superar 100 caracteres'),

    con_tipo: z.enum(CONCEPTO_TIPOS, { error: 'Selecciona un tipo válido' }),

    con_tipo_calculo: z.enum(TIPOS_CALCULO_CONCEPTO, {
      error: 'Selecciona cómo se calcula este concepto',
    }),

    con_porcentaje: z.preprocess(
      (value) => (value === '' || value === undefined ? null : value),
      z
        .number()
        .positive('El porcentaje debe ser mayor a 0')
        .max(500, 'El porcentaje es demasiado alto')
        .nullable()
    ),

    con_afecta_salario_bruto: z.boolean().default(false),
    con_afecta_base_ccss: z.boolean().default(true),

    con_formula_base: z.preprocess(
      (value) => (value === '' ? null : value),
      z.string().max(200, 'La fórmula no puede superar 200 caracteres').nullable().optional()
    ),

    con_activo: z.boolean().default(true),
  })
  .refine(
    (data) =>
      TIPOS_CON_PORCENTAJE.has(data.con_tipo_calculo)
        ? data.con_porcentaje !== null
        : data.con_porcentaje === null,
    {
      message:
        'El porcentaje es obligatorio para "% del bruto" y "horas extra automático", y debe quedar vacío en los demás tipos.',
      path: ['con_porcentaje'],
    }
  )

export type ConceptoNominaInput = z.infer<typeof conceptoNominaSchema>

type _ConceptoNominaAlineado =
  ConceptoNominaInput extends Omit<ConceptoNominaInsert, 'con_id'> ? true : never
const _conceptoAlineado: _ConceptoNominaAlineado = true
void _conceptoAlineado

// ─── Schema de edición manual de un detalle de planilla ──────────────────────
// Dinámico: un monto por cada concepto manual activo del catálogo (código →
// monto), más horas trabajadas y salario por hora para las horas extra
// automáticas. Las deducciones porcentuales (ej. CCSS) y las horas extra
// nunca se editan a mano: siempre se recalculan en el servidor.

const montoNoNegativo = (mensaje: string) =>
  z
    .number({ error: mensaje })
    .min(0, 'No puede ser negativo')
    .max(99_999_999, 'El monto es demasiado alto')

export const editarDetalleSchema = z.object({
  montos: z.record(z.string(), montoNoNegativo('El monto no puede ser negativo')),
  horasTrabajadas: montoNoNegativo('Las horas trabajadas son obligatorias').max(
    999,
    'Revisa las horas trabajadas'
  ),
  salarioPorHora: montoNoNegativo('El salario por hora es obligatorio'),
})

export type EditarDetalleInput = z.infer<typeof editarDetalleSchema>

// ─── Aguinaldo y liquidación ───────────────────────────────────────────────
// La pestaña vive dentro de Nómina pero es un ciclo aparte: el aguinaldo se
// acumula automáticamente (ver marcarDetallePagado) y solo se "cobra" una
// vez al año; la liquidación es un evento único por salida de empleado.

export type MotivoSalidaRow = Database['public']['Tables']['sgrh_cat_motivos_salida']['Row']

export interface AguinaldoItem {
  historialLaboralId: number
  empleadoNombre: string
  empleadoCedula: string
  anio: number
  montoAcumulado: number
  pagado: boolean
  fechaPago: string | null
}

export interface EmpleadoActivoItem {
  historialLaboralId: number
  nombre: string
  cedula: string
}

export const procesarLiquidacionSchema = z.object({
  historialLaboralId: z.number({ error: 'Elegí un empleado' }).int().positive(),
  fechaSalida: z
    .string({ error: 'La fecha de salida es obligatoria' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida'),
  motivoSalidaId: z.number({ error: 'Elegí un motivo de salida' }).int().positive(),
  diasVacacionesPendientes: z
    .number({ error: 'Los días de vacaciones son obligatorios' })
    .min(0, 'No puede ser negativo')
    .max(365, 'Revisá los días de vacaciones'),
})

export type ProcesarLiquidacionInput = z.infer<typeof procesarLiquidacionSchema>

export interface LiquidacionCalculada {
  liqId: number
  salarioProporcional: number
  aguinaldoProporcional: number
  vacacionesPagadas: number
  diasPreaviso: number
  preaviso: number
  diasCesantia: number
  cesantia: number
  total: number
}
