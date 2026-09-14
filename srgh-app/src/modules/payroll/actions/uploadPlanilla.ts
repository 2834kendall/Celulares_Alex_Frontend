'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  agruparConceptosPlanilla,
  calcularPlanillaPorConceptos,
  sameRowValues,
  type ConceptoPlanillaColumna,
  type PlanillaRowInput,
} from '@/modules/payroll/lib/planilla'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import {
  CAMPOS_CONCEPTO_DE_LINEA,
  fusionarAjenas,
  type ConceptoDeLinea,
  type LineaAjena,
} from '@/modules/payroll/lib/lineasAjenas'
import { getFotoAsistencia } from '@/modules/payroll/lib/horasPeriodoData'
import {
  camposFotoAsistencia,
  fotoUtilizable,
  type FotoAsistencia,
  type LecturaAsistencia,
} from '@/modules/payroll/lib/horasOrigen'
import { ahoraLocal } from '@/modules/payroll/lib/fechas'
import { parsePlanillaWorkbook } from '@/modules/payroll/lib/planillaExcel'
import { getEmpleadosActivos } from '@/modules/payroll/lib/planillaData'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'
import { periodoAtrasado } from '@/modules/payroll/lib/estadoPeriodo'

const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB: la planilla real pesa unos pocos KB

/** Fila sin foto previa: la de un empleado que entra nuevo al periodo. */
const SIN_FOTO: FotoAsistencia = { horas: null, horasExtra: null }

/**
 * Recalcula una fila del Excel SIN perder las líneas que el archivo no trae.
 *
 * El motor solo produce líneas de los conceptos que le pasan, y la subida le
 * pasa los ACTIVOS. Una línea de un concepto inactivo —el caso real es
 * HORAS_EXTRA, con el que se paga el banco de horas— no tenía cómo
 * reproducirse y se perdía en cada subida (ver lib/lineasAjenas.ts).
 */
function calcularConAjenas(
  conceptosActivos: ConceptoPlanillaColumna[],
  row: PlanillaRowInput,
  ajenas: LineaAjena[]
) {
  const { conceptos, montos } = fusionarAjenas(conceptosActivos, row.montos, ajenas)

  return calcularPlanillaPorConceptos(conceptos, {
    montos,
    horasTrabajadas: row.horasTrabajadas,
    horasExtra: row.horasExtra,
    salarioPorHora: row.salarioPorHora,
  })
}

interface DetalleExistenteRow {
  ndt_id: number
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_salario_por_hora: number
  ndt_salario_bruto: number
  ndt_total_deducciones_obreras: number
  ndt_salario_neto: number
  ndt_total_cargas_patronales: number
  ndt_horas_asistencia: number | null
  ndt_horas_extra_asistencia: number | null
}

interface LineaIngresoExistenteRow {
  ing_nomina_detalle_id: number
  ing_monto: number
  sgrh_cat_conceptos_nomina: ConceptoDeLinea | null
}

interface LineaDeduccionExistenteRow {
  ded_nomina_detalle_id: number
  ded_monto: number
  sgrh_cat_conceptos_nomina: ConceptoDeLinea | null
}

interface DetalleInsertadoRow {
  ndt_id: number
  ndt_historial_laboral_id: number
}

/** Valores previos de una fila, en el mismo shape que PlanillaRowInput (sin cédula) para comparar con sameRowValues. */
interface ValoresPrevios {
  horasTrabajadas: number
  horasExtra: number
  salarioPorHora: number
  montos: Record<string, number>
  /** Un detalle ya pagado no se reescribe por un cambio de marcas. */
  pagado: boolean
  /** Totales ya guardados, para detectar cambios que vienen del catálogo. */
  totales: { bruto: number; deducciones: number; neto: number; patronales: number }
  /** Foto de la asistencia guardada, para detectar marcas corregidas después. */
  foto: FotoAsistencia
  /**
   * Líneas guardadas cuyo concepto NO es columna del Excel, con su monto.
   *
   * El caso real es el pago de horas del banco: se guarda como línea de
   * HORAS_EXTRA, que nace inactivo en el catálogo y por eso no es columna de
   * la plantilla. Como subir el Excel borra todas las líneas y las rehace
   * desde lo que trae el archivo, ese pago desaparecía en silencio: el bruto
   * bajaba y el movimiento del banco seguía diciendo "pagado" apuntando a una
   * plata que ya no estaba.
   *
   * Se reinyectan al recálculo para que sobrevivan. Es lo mismo que ya hacía
   * pagarBancoHoras al recalcular el periodo destino.
   */
  ajenas: { concepto: ConceptoDeLinea; monto: number; esIngreso: boolean }[]
}

export type UploadPlanillaResult =
  | {
      ok: true
      empleados: number
      nuevos: number
      actualizados: number
      sinCambios: number
      eliminados: number
    }
  | { ok: false; error: string }

/**
 * Sube la planilla llena y la sincroniza con el periodo (solo en borrador).
 * En vez de reemplazar todo, compara cada fila del Excel contra lo ya
 * guardado: si un empleado no cambió se deja intacto (no se toca su ndt_id,
 * ndt_pagado ni fechas); solo se inserta, actualiza o elimina lo que
 * realmente cambió.
 *
 * Los montos SIEMPRE se recalculan en el servidor con
 * calcularPlanillaPorConceptos — el mismo motor dinámico que usa la edición
 * manual del detalle. No hay conceptos fijos quemados en código: cualquier
 * concepto activo del catálogo (bono, préstamo, etc.) se aplica solo, y las
 * horas extra / el % de CCSS salen de cómo esté configurado el catálogo, no
 * de un valor fijo en el código.
 */
export async function uploadPlanilla(formData: FormData): Promise<UploadPlanillaResult> {
  const periodoId = Number(formData.get('periodoId'))
  const file = formData.get('file')

  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    return { ok: false, error: 'Periodo inválido.' }
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Selecciona el archivo de planilla (.xlsx).' }
  }
  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, error: 'El archivo supera el límite de 2 MB.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  // 1. El periodo debe existir (RLS: solo de la empresa del JWT) y estar en borrador
  const { data: periodo, error: errPeriodo } = await supabase
    .from('sgrh_nomina_periodo')
    .select('npe_id, npe_estado, npe_sucursal_id, npe_fecha_inicio_periodo, npe_fecha_fin_periodo')
    .eq('npe_id', periodoId)
    .maybeSingle()

  if (errPeriodo) {
    return { ok: false, error: 'No se pudo cargar el periodo.' }
  }
  if (!periodo) {
    return { ok: false, error: 'El periodo no existe o no es visible.' }
  }
  if (periodo.npe_estado !== 'borrador') {
    return { ok: false, error: 'Solo se puede subir planilla a un periodo en borrador.' }
  }

  // 2. Conceptos activos del catálogo — definen las columnas del Excel y el
  // cálculo. Se cargan antes de parsear porque el parseo necesita saber qué
  // columnas de monto manual buscar (por el nombre del concepto).
  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select(
      'con_id, con_codigo, con_nombre, con_tipo, con_afecta_salario_bruto, con_afecta_base_ccss, con_tipo_calculo, con_porcentaje'
    )
    .eq('con_activo', true)
    .returns<ConceptoPlanillaColumna[]>()

  if (errConceptos) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  if (!conceptos || conceptos.length === 0) {
    return {
      ok: false,
      error:
        'No hay conceptos activos en el catálogo. Crea al menos uno en "Conceptos de nómina" antes de subir la planilla.',
    }
  }

  const { ingresoManual, deduccionManual } = agruparConceptosPlanilla(conceptos)
  const codigosManuales = [...ingresoManual, ...deduccionManual].map((c) => c.con_codigo)

  // 3. Leer y validar el Excel
  const { rows, errors } = await parsePlanillaWorkbook(
    await file.arrayBuffer(),
    conceptos,
    periodoId
  )

  if (errors.length > 0) {
    const detalle = errors
      .slice(0, 5)
      .map((e) => `fila ${e.fila}: ${e.mensaje}`)
      .join(' · ')
    return { ok: false, error: `El archivo tiene errores — ${detalle}` }
  }
  if (rows.length === 0) {
    return { ok: false, error: 'El archivo no tiene filas de empleados.' }
  }

  // 4. Resolver cédulas contra los contratos activos de la sucursal
  const empleadosResult = await getEmpleadosActivos(supabase, periodo.npe_sucursal_id)
  if (!empleadosResult.ok) {
    return { ok: false, error: empleadosResult.error }
  }

  const porCedula = new Map(empleadosResult.data.map((e) => [e.cedula, e]))
  const desconocidas = rows.filter((r) => !porCedula.has(r.cedula)).map((r) => r.cedula)
  if (desconocidas.length > 0) {
    return {
      ok: false,
      error: `Cédulas sin contrato activo en la sucursal: ${desconocidas.slice(0, 5).join(', ')}.`,
    }
  }

  // 4b. Lo que dicen las marcas de asistencia para este periodo. Es la foto
  // que se guarda junto con cada fila: mandan las marcas, pero el Excel puede
  // corregirlas y esa corrección tiene que quedar registrada (ver
  // lib/horasOrigen.ts).
  //
  // Un periodo sin fechas se guarda sin foto: no hay marcas que leer, y "no se
  // sabe" es la respuesta honesta. Una lectura que FALLA es otra cosa y corta
  // la subida (ver abajo).
  const lecturaAsistencia = await getFotoAsistencia(supabase, {
    historialLaboralIds: empleadosResult.data.map((e) => e.labId),
    fechaInicio: periodo.npe_fecha_inicio_periodo,
    fechaFin: periodo.npe_fecha_fin_periodo,
  })

  // Desde que las marcas son la fuente de las horas, guardar una planilla sin
  // poder leerlas deja las filas a medias: horas nuevas con una foto vieja,
  // que es justamente el par con el que después se decide si alguien las
  // corrigió y si el pago se bloquea. Un periodo SIN FECHAS es otra cosa (no
  // hay marcas que leer) y sí se puede guardar.
  if (lecturaAsistencia.estado === 'error') {
    return {
      ok: false,
      error: 'No se pudieron leer las marcas de asistencia del periodo. Volvé a intentarlo.',
    }
  }

  const ahora = ahoraLocal()

  /** Lo que dice la asistencia del empleado, o el motivo por el que no se sabe. */
  const lecturaDe = (labId: number): LecturaAsistencia =>
    lecturaAsistencia.estado === 'ok'
      ? { estado: 'ok', datos: lecturaAsistencia.datos.get(labId) ?? null }
      : { estado: 'sin_fechas' }

  /**
   * Las cinco columnas de la foto para la fila de un empleado, o {} cuando lo
   * correcto es no tocarlas (ver camposFotoAsistencia).
   */
  const fotoDe = (labId: number, row: PlanillaRowInput, previo: ValoresPrevios | null) => {
    const resultado = camposFotoAsistencia({
      lectura: lecturaDe(labId),
      guardadas: { horas: row.horasTrabajadas, horasExtra: row.horasExtra },
      guardadasPrevias: previo
        ? { horas: previo.horasTrabajadas, horasExtra: previo.horasExtra }
        : null,
      fotoPrevia: previo?.foto ?? SIN_FOTO,
      usuarioId,
      ahora,
    })

    // No escribir = las horas que llegan son las mismas de antes y las marcas
    // ya dicen otra cosa. La fila se queda desactualizada y bloqueada, que es
    // lo correcto: nadie corrigió nada todavía.
    return resultado.escribir ? resultado.campos : {}
  }

  // 5. Planilla ya guardada en el periodo (para comparar, no para borrar de una vez)
  const { data: detallesPrevios, error: errPrevios } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      'ndt_id, ndt_historial_laboral_id, ndt_pagado, ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50, ndt_salario_por_hora, ndt_salario_bruto, ndt_total_deducciones_obreras, ndt_salario_neto, ndt_total_cargas_patronales, ndt_horas_asistencia, ndt_horas_extra_asistencia'
    )
    .eq('ndt_nomina_periodo_id', periodoId)
    .returns<DetalleExistenteRow[]>()

  if (errPrevios) {
    return { ok: false, error: 'No se pudo revisar la planilla existente.' }
  }

  const ndtIdPorLab = new Map<number, number>(
    (detallesPrevios ?? []).map((d: DetalleExistenteRow): [number, number] => [
      d.ndt_historial_laboral_id,
      d.ndt_id,
    ])
  )
  const idsPrevios = (detallesPrevios ?? []).map((d: DetalleExistenteRow) => d.ndt_id)

  // Valores previos de cada ndt_id (horas, salario por hora, montos por
  // concepto manual), para reconstruir qué había y compararlo contra el
  // Excel. Los códigos ausentes cuentan como 0, igual que un campo vacío.
  const valoresPreviosPorNdt = new Map<number, ValoresPrevios>()
  if (idsPrevios.length > 0) {
    for (const d of detallesPrevios ?? []) {
      const montos: Record<string, number> = {}
      for (const codigo of codigosManuales) montos[codigo] = 0
      valoresPreviosPorNdt.set(d.ndt_id, {
        horasTrabajadas: d.ndt_horas_ordinarias_diurnas,
        horasExtra: d.ndt_horas_extra_al_50 ?? 0,
        salarioPorHora: d.ndt_salario_por_hora,
        montos,
        pagado: d.ndt_pagado,
        totales: {
          bruto: d.ndt_salario_bruto,
          deducciones: d.ndt_total_deducciones_obreras,
          neto: d.ndt_salario_neto,
          patronales: d.ndt_total_cargas_patronales ?? 0,
        },
        foto: {
          horas: d.ndt_horas_asistencia ?? null,
          horasExtra: d.ndt_horas_extra_asistencia ?? null,
        },
        ajenas: [],
      })
    }

    const [
      { data: lineasIngresoPrevias, error: errLI },
      { data: lineasDeduccionPrevias, error: errLD },
    ] = await Promise.all([
      supabase
        .from('sgrh_nomina_linea_ingreso')
        .select(
          `ing_nomina_detalle_id, ing_monto, sgrh_cat_conceptos_nomina ( ${CAMPOS_CONCEPTO_DE_LINEA} )`
        )
        .in('ing_nomina_detalle_id', idsPrevios)
        .returns<LineaIngresoExistenteRow[]>(),
      supabase
        .from('sgrh_nomina_linea_deduccion')
        .select(
          `ded_nomina_detalle_id, ded_monto, sgrh_cat_conceptos_nomina ( ${CAMPOS_CONCEPTO_DE_LINEA} )`
        )
        .in('ded_nomina_detalle_id', idsPrevios)
        .returns<LineaDeduccionExistenteRow[]>(),
    ])

    if (errLI || errLD) {
      return { ok: false, error: 'No se pudo revisar la planilla existente.' }
    }

    for (const linea of lineasIngresoPrevias ?? []) {
      const concepto = linea.sgrh_cat_conceptos_nomina
      const previo = valoresPreviosPorNdt.get(linea.ing_nomina_detalle_id)
      if (!previo || !concepto) continue

      if (concepto.con_codigo in previo.montos) {
        previo.montos[concepto.con_codigo] = linea.ing_monto
        continue
      }
      previo.ajenas.push({ concepto, monto: linea.ing_monto, esIngreso: true })
    }
    for (const linea of lineasDeduccionPrevias ?? []) {
      const concepto = linea.sgrh_cat_conceptos_nomina
      const previo = valoresPreviosPorNdt.get(linea.ded_nomina_detalle_id)
      if (!previo || !concepto) continue

      if (concepto.con_codigo in previo.montos) {
        previo.montos[concepto.con_codigo] = linea.ded_monto
        continue
      }
      // Las deducciones porcentuales (CCSS) las recalcula el motor sobre el
      // bruto nuevo; arrastrar su monto viejo sería un error.
      if (concepto.con_tipo_calculo === 'porcentaje_deduccion_bruto') continue

      previo.ajenas.push({ concepto, monto: linea.ded_monto, esIngreso: false })
    }
  }

  // 6. Clasificar cada fila del Excel: nueva, sin cambios o actualizada
  const filasNuevas: PlanillaRowInput[] = []
  const filasActualizar: {
    row: PlanillaRowInput
    ndtId: number
    totales: ReturnType<typeof calcularPlanillaPorConceptos>
  }[] = []
  let sinCambios = 0

  const labIdsEnExcel = new Set<number>()
  for (const row of rows) {
    const labId = porCedula.get(row.cedula)!.labId
    labIdsEnExcel.add(labId)
    const ndtId = ndtIdPorLab.get(labId)

    if (!ndtId) {
      filasNuevas.push(row)
      continue
    }

    const previo = valoresPreviosPorNdt.get(ndtId)!
    const mismoInput = sameRowValues(
      {
        horasTrabajadas: previo.horasTrabajadas,
        horasExtra: previo.horasExtra,
        salarioPorHora: previo.salarioPorHora,
        montos: previo.montos,
      },
      {
        horasTrabajadas: row.horasTrabajadas,
        horasExtra: row.horasExtra,
        salarioPorHora: row.salarioPorHora,
        montos: row.montos,
      }
    )

    const totales = calcularConAjenas(conceptos, row, previo.ajenas)

    // "Sin cambios" tiene que mirar también el RESULTADO, no solo lo que el
    // usuario escribió. Si entre una subida y otra cambió el catálogo (se
    // corrigió el porcentaje de la CCSS, se desactivó un concepto), la fila
    // llega idéntica pero su cálculo ya no lo es. Comparando solo los campos
    // del Excel, esas filas se saltaban y se quedaban con el monto viejo: la
    // única forma de forzar el recálculo era editarle algo a cada empleado.
    const mismoResultado =
      previo.totales.bruto === totales.salarioBruto &&
      previo.totales.deducciones === totales.totalDeducciones &&
      previo.totales.neto === totales.salarioNeto &&
      previo.totales.patronales === totales.totalCargasPatronales

    // Y tiene que mirar si la fila TIENE foto. Las que vienen de antes de que
    // existiera no la tienen, y sin ella el sistema no puede decir si sus
    // horas son las de las marcas ni avisar cuando cambian. Se vuelven a
    // guardar una vez, aunque el Excel llegue idéntico, para que queden con la
    // suya; de ahí en adelante ya no entran por acá.
    //
    // No hace falta forzar el guardado cuando la foto está pero las marcas
    // cambiaron: esa fila queda bloqueada, y lo que la destraba es una
    // plantilla nueva, que trae horas distintas y entra igual por mismoInput.
    //
    // Una fila YA PAGADA tampoco se reescribe. Su planilla es historia: tiene
    // comprobante emitido y aguinaldo acumulado con ese bruto.
    const lectura = lecturaDe(labId)
    const asistencia = lectura.estado === 'ok' ? lectura.datos : null
    const tieneFoto = asistencia === null || fotoUtilizable(previo.foto)

    if (mismoInput && mismoResultado && (tieneFoto || previo.pagado)) {
      sinCambios += 1
    } else {
      filasActualizar.push({ row, ndtId, totales })
    }
  }

  // Empleados que ya tenían planilla en el periodo pero salieron del Excel
  const salieronDelExcel = (detallesPrevios ?? []).filter(
    (d: DetalleExistenteRow) => !labIdsEnExcel.has(d.ndt_historial_laboral_id)
  )

  // Hay dos filas que NO se pueden borrar así:
  //
  //  - Una ya PAGADA: borrarla elimina el registro del pago y su comprobante.
  //  - Una impaga de un periodo YA VENCIDO: es lo más cerca que tiene el
  //    sistema de un registro de deuda. Como el periodo impago se queda en
  //    'borrador' para siempre, cualquier subida posterior la hacía
  //    desaparecer sin dejar rastro de que a esa persona se le debía.
  //
  // En ambos casos se rechaza la subida entera en vez de borrar en silencio:
  // sacar a alguien de un periodo en el que ya cobró, o al que se le debe, es
  // una decisión que tiene que ser deliberada.
  const vencido = periodoAtrasado(periodo.npe_estado, periodo.npe_fecha_fin_periodo)
  const protegidos = salieronDelExcel.filter((d: DetalleExistenteRow) => d.ndt_pagado || vencido)

  if (protegidos.length > 0) {
    const nombrePorLab = new Map(empleadosResult.data.map((e) => [e.labId, e.nombre]))
    const nombres = protegidos
      .map(
        (d: DetalleExistenteRow) =>
          nombrePorLab.get(d.ndt_historial_laboral_id) ?? `contrato ${d.ndt_historial_laboral_id}`
      )
      .slice(0, 5)
      .join(', ')
    const motivo = protegidos.some((d: DetalleExistenteRow) => d.ndt_pagado)
      ? 'ya tienen el pago marcado'
      : 'están sin pagar en un periodo que ya venció'

    return {
      ok: false,
      error: `No se puede quitar de la planilla a empleados que ${motivo}: ${nombres}. Volvé a incluirlos en el archivo; si de verdad hay que sacarlos, primero desmarcá el pago o revisá el periodo.`,
    }
  }

  const ndtIdsEliminar = salieronDelExcel.map((d: DetalleExistenteRow) => d.ndt_id)

  // 7. Eliminar lo que salió de la planilla
  if (ndtIdsEliminar.length > 0) {
    const tablasLineas = [
      { tabla: 'sgrh_nomina_linea_ingreso', columna: 'ing_nomina_detalle_id' },
      { tabla: 'sgrh_nomina_linea_deduccion', columna: 'ded_nomina_detalle_id' },
      { tabla: 'sgrh_nomina_linea_patronal', columna: 'pat_nomina_detalle_id' },
    ] as const

    for (const { tabla, columna } of tablasLineas) {
      const { error: errDelLineas } = await supabase
        .from(tabla)
        .delete()
        .in(columna, ndtIdsEliminar)
      if (errDelLineas) {
        return {
          ok: false,
          error: 'No se pudieron eliminar los empleados que salieron de la planilla.',
        }
      }
    }

    const { error: errDelDetalle } = await supabase
      .from('sgrh_nomina_detalle')
      .delete()
      .in('ndt_id', ndtIdsEliminar)
    if (errDelDetalle) {
      return {
        ok: false,
        error: 'No se pudieron eliminar los empleados que salieron de la planilla.',
      }
    }
  }

  // 8. Actualizar los que cambiaron: totales recalculados + líneas desde cero
  for (const { row, ndtId, totales } of filasActualizar) {
    const {
      salarioBruto,
      totalDeducciones,
      salarioNeto,
      totalCargasPatronales,
      lineas,
      lineasPatronales,
    } = totales

    const { error: errUpdate } = await supabase
      .from('sgrh_nomina_detalle')
      .update({
        ndt_salario_bruto: salarioBruto,
        ndt_total_deducciones_obreras: totalDeducciones,
        ndt_salario_neto: salarioNeto,
        ndt_total_cargas_patronales: totalCargasPatronales,
        ndt_horas_ordinarias_diurnas: row.horasTrabajadas,
        ndt_horas_extra_al_50: row.horasExtra,
        ndt_salario_por_hora: row.salarioPorHora,
        ...fotoDe(porCedula.get(row.cedula)!.labId, row, valoresPreviosPorNdt.get(ndtId) ?? null),
      })
      .eq('ndt_id', ndtId)
    if (errUpdate) {
      return { ok: false, error: 'No se pudieron actualizar los montos de la planilla.' }
    }

    // reemplazarLineasDetalle borra y reinserta, conservando los metadatos de
    // las deducciones (de qué beneficio vienen, si son voluntarias).
    const { error: errLineas } = await reemplazarLineasDetalle(
      supabase,
      ndtId,
      lineas,
      lineasPatronales
    )
    if (errLineas) {
      return { ok: false, error: errLineas }
    }

    const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
      ndtId,
      historialLaboralId: porCedula.get(row.cedula)!.labId,
      horasExtra: row.horasExtra,
      salarioPorHora: row.salarioPorHora,
    })
    if (errBanco) {
      return { ok: false, error: errBanco }
    }
  }

  // 9. Insertar los empleados nuevos
  if (filasNuevas.length > 0) {
    const hoy = new Date().toISOString().slice(0, 10)
    const totalesPorFila = new Map(
      filasNuevas.map((row) => [
        row.cedula,
        calcularPlanillaPorConceptos(conceptos, {
          montos: row.montos,
          horasTrabajadas: row.horasTrabajadas,
          horasExtra: row.horasExtra,
          salarioPorHora: row.salarioPorHora,
        }),
      ])
    )

    const detalles = filasNuevas.map((row) => {
      const totales = totalesPorFila.get(row.cedula)!
      return {
        ndt_nomina_periodo_id: periodoId,
        ndt_historial_laboral_id: porCedula.get(row.cedula)!.labId,
        ndt_salario_bruto: totales.salarioBruto,
        ndt_total_deducciones_obreras: totales.totalDeducciones,
        ndt_total_cargas_patronales: totales.totalCargasPatronales,
        ndt_salario_neto: totales.salarioNeto,
        ndt_horas_ordinarias_diurnas: row.horasTrabajadas,
        // Faltaba: las horas extra del Excel se usaban para el cálculo y para
        // el banco de horas, pero no se guardaban en la fila. La pantalla del
        // periodo las leía de acá, así que toda planilla armada por Excel
        // mostraba "0 h extra" aunque el archivo trajera horas.
        ndt_horas_extra_al_50: row.horasExtra,
        ndt_salario_por_hora: row.salarioPorHora,
        ndt_fecha_registro: hoy,
        // Fila nueva: no hay nada anterior contra lo cual comparar.
        ...fotoDe(porCedula.get(row.cedula)!.labId, row, null),
      }
    })

    const { data: insertados, error: errInsert } = await supabase
      .from('sgrh_nomina_detalle')
      .insert(detalles)
      .select('ndt_id, ndt_historial_laboral_id')
      .returns<DetalleInsertadoRow[]>()

    if (errInsert || !insertados) {
      return { ok: false, error: 'No se pudieron guardar los detalles de la planilla.' }
    }

    const ndtIdPorLabNuevo = new Map<number, number>(
      insertados.map((d: DetalleInsertadoRow): [number, number] => [
        d.ndt_historial_laboral_id,
        d.ndt_id,
      ])
    )

    for (const row of filasNuevas) {
      const labId = porCedula.get(row.cedula)!.labId
      const ndtId = ndtIdPorLabNuevo.get(labId)
      if (!ndtId) continue

      const { lineas, lineasPatronales } = totalesPorFila.get(row.cedula)!
      const { error: errLineas } = await reemplazarLineasDetalle(
        supabase,
        ndtId,
        lineas,
        lineasPatronales
      )
      if (errLineas) {
        return {
          ok: false,
          error:
            'Se guardaron los totales, pero fallaron algunas líneas de la planilla. Vuelve a subir el archivo.',
        }
      }

      const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
        ndtId,
        historialLaboralId: labId,
        horasExtra: row.horasExtra,
        salarioPorHora: row.salarioPorHora,
      })
      if (errBanco) {
        return { ok: false, error: errBanco }
      }
    }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${periodoId}`)
  revalidatePath('/payroll/banco-horas')
  return {
    ok: true,
    empleados: rows.length,
    nuevos: filasNuevas.length,
    actualizados: filasActualizar.length,
    sinCambios,
    eliminados: ndtIdsEliminar.length,
  }
}
