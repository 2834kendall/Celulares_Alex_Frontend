'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import {
  ERROR_SIN_CONCEPTO_BASE,
  calcularPlanillaPorConceptos,
  hayConceptoSalarioBase,
  type ConceptoCalculo,
} from '@/modules/payroll/lib/planilla'
import { reemplazarLineasDetalle } from '@/modules/payroll/lib/lineasNomina'
import {
  CAMPOS_CONCEPTO_DE_LINEA,
  fusionarAjenas,
  leerMontosGuardados,
} from '@/modules/payroll/lib/lineasAjenas'
import { getHorasDelPeriodo } from '@/modules/payroll/lib/horasPeriodoData'
import { lecturaUtilizable } from '@/modules/payroll/lib/horasPeriodo'
import { prellenarDesdeAsistencia } from '@/modules/payroll/lib/prellenadoAsistencia'
import { round2 } from '@/modules/payroll/lib/numeros'
import { camposFotoAsistencia, origenHoras } from '@/modules/payroll/lib/horasOrigen'
import { ahoraLocal } from '@/modules/payroll/lib/fechas'
import { sincronizarMovimientoBancoHoras } from '@/modules/payroll/lib/bancoHorasAccrual'

export type RefrescarHorasResult =
  | {
      ok: true
      horas: number
      horasExtra: number
      sinCambios: boolean
      /** El salario base estaba editado a mano y se dejó como estaba. */
      baseConservado: boolean
    }
  /** Las horas estaban corregidas a mano: hay que confirmar antes de pisarlas. */
  | { ok: false; necesitaConfirmacion: true; error: string }
  | { ok: false; necesitaConfirmacion?: false; error: string }

interface ContratoRow {
  lab_salario_base: number | null
  sgrh_cat_tipos_jornada: { tjo_horas_max_semanales: number | null } | null
}

interface DetalleRow {
  ndt_id: number
  ndt_nomina_periodo_id: number
  ndt_historial_laboral_id: number
  ndt_pagado: boolean
  ndt_horas_ordinarias_diurnas: number
  ndt_horas_extra_al_50: number
  ndt_salario_por_hora: number
  ndt_salario_bruto: number
  ndt_salario_neto: number
  ndt_horas_asistencia: number | null
  ndt_horas_extra_asistencia: number | null
  sgrh_nomina_periodo: {
    npe_estado: string
    npe_fecha_inicio_periodo: string | null
    npe_fecha_fin_periodo: string | null
  } | null
}

/**
 * Trae a la planilla las horas que dice la asistencia AHORA, para un empleado.
 *
 * La planilla es una foto, no un espejo: las horas se congelan cuando se sube
 * el Excel o se edita el detalle, y no se mueven solas. Eso es a propósito —si
 * se actualizaran en cada visita, una quincena ya pagada cambiaría de monto
 * sola y dejaría de corresponder con su comprobante y con el aguinaldo que ya
 * acumuló.
 *
 * Pero hasta ahora la única forma de traer las horas nuevas era volver a bajar
 * y subir el Excel entero, o ir a consultar la asistencia en otra pantalla y
 * transcribirla a mano. Por un empleado al que se le asignó un horario después
 * de armada la planilla, las dos son desproporcionadas. Esto es ese mismo
 * recálculo, para una sola fila y sin archivos de por medio.
 *
 * Lo que NO hace: tocar filas ya pagadas, ni periodos fuera de borrador, ni
 * pisar en silencio unas horas que alguien corrigió a mano (eso pide
 * confirmación explícita).
 */
export async function refrescarHorasAsistencia(
  ndtId: number,
  confirmarSobrescribirAjuste = false
): Promise<RefrescarHorasResult> {
  if (!Number.isInteger(ndtId) || ndtId <= 0) {
    return { ok: false, error: 'Detalle inválido.' }
  }

  const claims = await requirePermission(PERMISOS.NOMINA_WRITE)
  const usuarioId = (claims.app_metadata as { usr_id?: number })?.usr_id ?? null
  const supabase = await createClient()

  const { data: detalle, error: errDetalle } = await supabase
    .from('sgrh_nomina_detalle')
    .select(
      `ndt_id, ndt_nomina_periodo_id, ndt_historial_laboral_id, ndt_pagado,
       ndt_horas_ordinarias_diurnas, ndt_horas_extra_al_50, ndt_salario_por_hora,
       ndt_salario_bruto, ndt_salario_neto,
       ndt_horas_asistencia, ndt_horas_extra_asistencia,
       sgrh_nomina_periodo ( npe_estado, npe_fecha_inicio_periodo, npe_fecha_fin_periodo )`
    )
    .eq('ndt_id', ndtId)
    .maybeSingle<DetalleRow>()

  if (errDetalle) {
    return { ok: false, error: 'No se pudo cargar el detalle de la planilla.' }
  }
  if (!detalle) {
    return { ok: false, error: 'El detalle no existe o no es visible.' }
  }

  const periodo = detalle.sgrh_nomina_periodo
  if (periodo?.npe_estado !== 'borrador') {
    return {
      ok: false,
      error: 'Solo se pueden actualizar las horas mientras el periodo está en borrador.',
    }
  }
  // Cambiarle las horas a alguien que ya cobró movería un pago hecho, con su
  // comprobante emitido y su aguinaldo acumulado.
  if (detalle.ndt_pagado) {
    return {
      ok: false,
      error:
        'A este empleado ya se le marcó el pago de la quincena. Desmarcá ese pago primero si hay que corregirle las horas.',
    }
  }
  if (!periodo.npe_fecha_inicio_periodo || !periodo.npe_fecha_fin_periodo) {
    return {
      ok: false,
      error: 'El periodo no tiene fechas, así que no hay marcas de asistencia que leer.',
    }
  }

  const lectura = await getHorasDelPeriodo(supabase, {
    historialLaboralIds: [detalle.ndt_historial_laboral_id],
    fechaInicio: periodo.npe_fecha_inicio_periodo,
    fechaFin: periodo.npe_fecha_fin_periodo,
  })

  if (!lectura.ok) {
    return { ok: false, error: lectura.error }
  }

  // Sin horas programadas la lectura son ceros, y eso no es "trabajó 0 horas":
  // es que no hay jornada contra la cual medir, o que quien está mirando no
  // tiene permiso para ver la asistencia (RLS filtra en silencio, sin error).
  // Guardar esos ceros le borraría las horas buenas al empleado.
  const totales = lectura.data.get(detalle.ndt_historial_laboral_id)
  if (!lecturaUtilizable(totales)) {
    return {
      ok: false,
      error:
        'Este empleado no tiene ningún día con horario programado en la quincena, así que no hay horas que traer. Asignále el horario en Horarios; si ya lo tiene, pedile a un administrador que revise tus permisos de asistencia.',
    }
  }

  const guardadas = {
    horas: detalle.ndt_horas_ordinarias_diurnas,
    horasExtra: detalle.ndt_horas_extra_al_50 ?? 0,
  }
  const leidas = totales!
  const asistencia = { horas: leidas.horasOrdinarias, horasExtra: leidas.horasExtra }
  const fotoPrevia = {
    horas: detalle.ndt_horas_asistencia,
    horasExtra: detalle.ndt_horas_extra_asistencia,
  }

  const mismasHoras =
    Math.abs(guardadas.horas - asistencia.horas) < 0.005 &&
    Math.abs(guardadas.horasExtra - asistencia.horasExtra) < 0.005

  // Ojo: que las horas coincidan NO significa que no haya nada que hacer. Lo
  // que se paga sale de los montos, y los montos quedan escritos en la fila
  // con la fórmula que había el día que se armó. Dos veces se decidió "sin
  // cambios" acá arriba, mirando solo las horas, y las dos veces dejó una
  // fila mal guardada sin forma de arreglarla desde la pantalla: una en ₡0
  // (nació sin BASE) y otra en ₡235.000 por 9 h (proporción vieja). Por eso
  // "sin cambios" se decide al final, comparando lo recalculado contra lo
  // guardado, y no acá.

  // Las horas guardadas no coinciden con la foto: alguien las dejó distintas a
  // propósito (subió un Excel corregido, o editó el detalle). Pisarlas sin
  // preguntar borraría esa decisión sin dejar rastro, que es exactamente lo
  // que este botón NO debe hacer.
  if (
    !mismasHoras &&
    origenHoras(guardadas, fotoPrevia) === 'ajustadas' &&
    !confirmarSobrescribirAjuste
  ) {
    return {
      ok: false,
      necesitaConfirmacion: true,
      error: `Estas horas están corregidas a mano (${guardadas.horas} h, ${guardadas.horasExtra} h extra) y la asistencia dice ${asistencia.horas} h, ${asistencia.horasExtra} h extra. ¿Reemplazo la corrección por lo que dicen las marcas?`,
    }
  }

  const { data: conceptos, error: errConceptos } = await supabase
    .from('sgrh_cat_conceptos_nomina')
    .select(CAMPOS_CONCEPTO_DE_LINEA)
    .eq('con_activo', true)
    .returns<ConceptoCalculo[]>()

  if (errConceptos || !conceptos || conceptos.length === 0) {
    return { ok: false, error: 'No se pudo cargar el catálogo de conceptos de nómina.' }
  }
  // Sin el concepto BASE el monto del salario no lo recoge nadie y esta fila
  // se guardaría en ₡0 con las horas bien puestas — el cero que nadie revisa.
  // Se corta acá, antes de escribir, y se dice exactamente qué arreglar.
  if (!hayConceptoSalarioBase(conceptos)) {
    return { ok: false, error: ERROR_SIN_CONCEPTO_BASE }
  }

  const { montos, ajenas, error: errMontos } = await leerMontosGuardados(supabase, ndtId, conceptos)
  if (errMontos) {
    return { ok: false, error: errMontos }
  }

  const { data: contrato, error: errContrato } = await supabase
    .from('sgrh_historial_laboral')
    .select('lab_salario_base, sgrh_cat_tipos_jornada ( tjo_horas_max_semanales )')
    .eq('lab_id', detalle.ndt_historial_laboral_id)
    .maybeSingle<ContratoRow>()

  if (errContrato || !contrato) {
    return { ok: false, error: 'No se pudo cargar el contrato del empleado.' }
  }

  const salarioBase = contrato.lab_salario_base ?? 0
  if (salarioBase <= 0) {
    return {
      ok: false,
      error:
        'Este empleado no tiene salario base en su contrato, así que la planilla le daría ₡0. Corregí el salario en Historial Laboral y volvé a intentarlo.',
    }
  }

  const horasSemanales = contrato.sgrh_cat_tipos_jornada?.tjo_horas_max_semanales ?? null
  const prellenado = prellenarDesdeAsistencia(salarioBase, leidas, horasSemanales)

  // Traer las horas sin mover el BASE no cambiaba un colón: el bruto sale de
  // los montos, no de las horas. Alguien que trabajó media quincena seguía
  // cobrando la quincena entera y el botón parecía no hacer nada.
  //
  // Pero el BASE también se puede haber editado a mano, y eso no se pisa. Se
  // considera intacto en tres casos:
  //
  //  - No hay BASE, o está en cero. Eso NO es una edición: es una ausencia, y
  //    tratarla como decisión deliberada era el bug que dejaba filas con horas
  //    y ₡0 a pagar, avisando además "el salario base estaba editado a mano"
  //    contra alguien que no editó nada.
  //  - Coincide con lo que le tocaría a las horas que la fila tiene guardadas.
  //  - Coincide con la quincena entera, que es como nacen las filas cuando la
  //    asistencia todavía no servía.
  const mitadMensual = salarioBase / 2
  const baseSegunHorasGuardadas = prellenarDesdeAsistencia(
    salarioBase,
    { ...leidas, horasOrdinarias: guardadas.horas, horasExtra: guardadas.horasExtra },
    horasSemanales
  ).base

  const baseActual = montos.BASE ?? 0
  const baseIntacto =
    baseActual <= 0 ||
    Math.abs(baseActual - baseSegunHorasGuardadas) < 0.5 ||
    Math.abs(baseActual - round2(mitadMensual)) < 0.5

  if (baseIntacto) {
    montos.BASE = prellenado.base
  }

  const { conceptos: conceptosCalculo, montos: montosFinales } = fusionarAjenas(
    conceptos,
    montos,
    ajenas
  )

  const {
    salarioBruto,
    totalDeducciones,
    salarioNeto,
    totalCargasPatronales,
    lineas,
    lineasPatronales,
  } = calcularPlanillaPorConceptos(conceptosCalculo, {
    montos: montosFinales,
    horasTrabajadas: asistencia.horas,
    horasExtra: asistencia.horasExtra,
    salarioPorHora: prellenado.salarioPorHora,
  })

  // Red de seguridad. El chequeo de arriba cubre la causa conocida; esta cubre
  // cualquier otra que haga desaparecer el monto por el camino, porque el daño
  // es el mismo y es silencioso: guardar ₡0 junto a unas horas correctas
  // produce una fila que parece calculada y no lo está. Mejor no escribir nada
  // y decirlo.
  if (salarioBruto <= 0 && prellenado.base > 0) {
    return {
      ok: false,
      error:
        `Las horas quedaron bien (${asistencia.horas} h) pero el cálculo dio ₡0 de salario bruto, ` +
        `así que no guardé nada. El monto del salario (${prellenado.base}) no lo recogió ningún ` +
        'concepto del catálogo: revisá en Nómina → Conceptos que "Salario base" siga activo, con ' +
        'código BASE, tipo ingreso y cálculo "monto manual".',
    }
  }

  // Recién acá se sabe si hay algo que guardar: la fila recalculada se compara
  // con la guardada, número por número. Si es la misma, no se toca nada —ni
  // las líneas ni el banco de horas— y se avisa que ya estaba al día.
  const igual = (a: number, b: number) => Math.abs(a - b) < 0.005
  const filaIgual =
    mismasHoras &&
    igual(detalle.ndt_salario_por_hora, prellenado.salarioPorHora) &&
    igual(detalle.ndt_salario_bruto, salarioBruto) &&
    igual(detalle.ndt_salario_neto, salarioNeto)

  if (filaIgual) {
    return {
      ok: true,
      horas: asistencia.horas,
      horasExtra: asistencia.horasExtra,
      sinCambios: true,
      baseConservado: false,
    }
  }

  // Lo que se guarda ES lo que dicen las marcas, así que la foto queda igual a
  // las horas y la fila vuelve a contar como "origen: asistencia".
  const foto = camposFotoAsistencia({
    lectura: { estado: 'ok', datos: asistencia },
    guardadas: asistencia,
    guardadasPrevias: guardadas,
    fotoPrevia,
    usuarioId,
    ahora: ahoraLocal(),
  })

  const { error: errUpdate } = await supabase
    .from('sgrh_nomina_detalle')
    .update({
      ndt_salario_bruto: salarioBruto,
      ndt_total_deducciones_obreras: totalDeducciones,
      ndt_salario_neto: salarioNeto,
      ndt_total_cargas_patronales: totalCargasPatronales,
      ndt_horas_ordinarias_diurnas: asistencia.horas,
      ndt_horas_extra_al_50: asistencia.horasExtra,
      ndt_salario_por_hora: prellenado.salarioPorHora,
      ...(foto.escribir ? foto.campos : {}),
    })
    .eq('ndt_id', ndtId)

  if (errUpdate) {
    return { ok: false, error: 'No se pudieron guardar las horas actualizadas.' }
  }

  const { error: errLineas } = await reemplazarLineasDetalle(
    supabase,
    ndtId,
    lineas,
    lineasPatronales
  )
  if (errLineas) {
    return { ok: false, error: errLineas }
  }

  // Las horas extra cambiaron, así que el movimiento del banco de horas de
  // este periodo tiene que seguirlas.
  const { error: errBanco } = await sincronizarMovimientoBancoHoras(supabase, {
    ndtId,
    historialLaboralId: detalle.ndt_historial_laboral_id,
    horasExtra: asistencia.horasExtra,
    salarioPorHora: prellenado.salarioPorHora,
  })
  if (errBanco) {
    return { ok: false, error: errBanco }
  }

  revalidatePath('/payroll')
  revalidatePath(`/payroll/${detalle.ndt_nomina_periodo_id}`)
  revalidatePath('/payroll/banco-horas')
  return {
    ok: true,
    horas: asistencia.horas,
    horasExtra: asistencia.horasExtra,
    sinCambios: false,
    baseConservado: !baseIntacto,
  }
}
