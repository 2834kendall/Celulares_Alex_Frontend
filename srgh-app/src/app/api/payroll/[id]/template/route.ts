import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { buildPlanillaTemplate } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
import { salarioPorHoraPeriodo } from '@/modules/payroll/lib/horasPeriodo'
import { periodoLabel } from '@/modules/payroll/lib/format'
import type { ConceptoPlanillaColumna } from '@/modules/payroll/lib/planilla'

interface PeriodoRow {
  npe_id: number
  npe_periodo_mes: number
  npe_periodo_anio: number
  npe_quincena: number
  npe_sucursal_id: number
  npe_fecha_inicio_periodo: string | null
  npe_fecha_fin_periodo: string | null
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
      npe_fecha_inicio_periodo,
      npe_fecha_fin_periodo,
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
    .select(
      'con_id, con_codigo, con_nombre, con_tipo, con_afecta_base_ccss, con_tipo_calculo, con_porcentaje'
    )
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

  // Horas reales de la quincena, a partir de las marcas del kiosco. Si el
  // periodo no tiene fechas o la lectura falla, la plantilla sale igual con el
  // supuesto anterior (jornada completa): dejar al encargado sin planilla
  // seria peor que darle un prellenado que igual va a revisar.
  const conFechas = periodo.npe_fecha_inicio_periodo && periodo.npe_fecha_fin_periodo
  const horasResult = conFechas
    ? await getHorasDelPeriodo(supabase, {
        historialLaboralIds: empleadosResult.data.map((e) => e.labId),
        fechaInicio: periodo.npe_fecha_inicio_periodo!,
        fechaFin: periodo.npe_fecha_fin_periodo!,
      })
    : null

  const horasPorLab = horasResult?.ok ? horasResult.data : null

  const empleados = empleadosResult.data.map((empleado) => {
    const totales = horasPorLab?.get(empleado.labId)
    if (!totales) return empleado

    return {
      ...empleado,
      horas: {
        trabajadas: totales.horasOrdinarias,
        extra: totales.horasExtra,
        esperadas: totales.horasEsperadas,
        salarioPorHora: salarioPorHoraPeriodo(empleado.salarioBaseMensual, totales.horasEsperadas),
        diasPorRevisar: totales.diasConProblema.length,
      },
    }
  })

  const titulo = `Planilla — ${periodoLabel(
    periodo.npe_periodo_mes,
    periodo.npe_periodo_anio,
    periodo.npe_quincena
  )}`
  const subtitulo = `Sucursal: ${periodo.sgrh_sucursales?.suc_nombre ?? '—'} · Montos por quincena en colones`

  const buffer = await buildPlanillaTemplate({ titulo, subtitulo, periodoId }, empleados, conceptos)

  const filename = `planilla-${periodo.npe_periodo_anio}-${String(periodo.npe_periodo_mes).padStart(2, '0')}-q${periodo.npe_quincena}.xlsx`

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
