import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { buildPlanillaTemplate } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { periodoLabel } from '@/modules/payroll/lib/format'
import type { ConceptoPlanillaColumna } from '@/modules/payroll/lib/planilla'

interface PeriodoRow {
  npe_id: number
  npe_periodo_mes: number
  npe_periodo_anio: number
  npe_quincena: number
  npe_sucursal_id: number
  sgrh_sucursales: { suc_nombre: string | null } | null
}

/**
 * Descarga la plantilla Excel del periodo, prellenada con los empleados
 * activos de la sucursal. Quien la descarga va a subirla después, por eso
 * el permiso exigido es NOMINA_WRITE.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const periodoId = Number(id)

  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return NextResponse.json({ error: 'Periodo inválido.' }, { status: 400 })
  }

  await requirePermission(PERMISOS.NOMINA_WRITE)

  const supabase = await createClient()

  const { data: periodo, error } = await supabase
    .from('sgrh_nomina_periodo')
    .select(
      `
      npe_id,
      npe_periodo_mes,
      npe_periodo_anio,
      npe_quincena,
      npe_sucursal_id,
      sgrh_sucursales ( suc_nombre )
    `
    )
    .eq('npe_id', periodoId)
    .maybeSingle<PeriodoRow>()

  if (error) {
    return NextResponse.json({ error: 'No se pudo cargar el periodo.' }, { status: 500 })
  }
  if (!periodo) {
    return NextResponse.json({ error: 'El periodo no existe o no es visible.' }, { status: 404 })
  }

  const empleadosResult = await getEmpleadosActivos(supabase, periodo.npe_sucursal_id)
  if (!empleadosResult.ok) {
    return NextResponse.json({ error: empleadosResult.error }, { status: 500 })
  }
  if (empleadosResult.data.length === 0) {
    return NextResponse.json(
      {
        error:
          'La sucursal de este periodo no tiene empleados con contrato activo. Verifica el historial laboral antes de generar la planilla.',
      },
      { status: 422 }
    )
  }

  // Conceptos activos del catálogo: cada uno de tipo "monto manual" (ingreso
  // o deducción) se convierte en una columna editable de la plantilla.
  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select('con_id, con_codigo, con_nombre, con_tipo, con_tipo_calculo, con_porcentaje')
    .eq('con_activo', true)
    .returns<ConceptoPlanillaColumna[]>()

  if (errConceptos) {
    return NextResponse.json(
      { error: 'No se pudo cargar el catálogo de conceptos de nómina.' },
      { status: 500 }
    )
  }
  if (!conceptos || conceptos.length === 0) {
    return NextResponse.json(
      {
        error:
          'No hay conceptos activos en el catálogo. Crea al menos uno en "Conceptos de nómina" antes de generar la planilla.',
      },
      { status: 422 }
    )
  }

  const titulo = `Planilla — ${periodoLabel(
    periodo.npe_periodo_mes,
    periodo.npe_periodo_anio,
    periodo.npe_quincena
  )}`
  const subtitulo = `Sucursal: ${periodo.sgrh_sucursales?.suc_nombre ?? '—'} · Montos por quincena en colones`

  const buffer = await buildPlanillaTemplate(
    { titulo, subtitulo, periodoId },
    empleadosResult.data,
    conceptos
  )

  const filename = `planilla-${periodo.npe_periodo_anio}-${String(periodo.npe_periodo_mes).padStart(2, '0')}-q${periodo.npe_quincena}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
