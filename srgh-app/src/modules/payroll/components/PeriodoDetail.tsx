'use client'

import { Fragment, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Banknote,
  CalendarDays,
  Loader2,
  Pencil,
  Receipt,
  RefreshCw,
  Stethoscope,
  Users,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ConceptoNominaRow, DetalleNominaItem, PeriodoDetalle } from '@/modules/payroll/types'
import {
  estadoBadgeTone,
  estadoLabel,
  estadoVisible,
  formatCRC,
  formatDate,
  formatHoras,
  formatIban,
  periodoLabel,
} from '@/modules/payroll/lib/format'
import {
  MENSAJE_PROBLEMA,
  PROBLEMAS_QUE_BLOQUEAN,
  type ProblemaDia,
} from '@/modules/payroll/lib/horasPeriodo'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { marcarDetallePagado } from '@/modules/payroll/actions/marcarDetallePagado'
import { refrescarHorasAsistencia } from '@/modules/payroll/actions/refrescarHorasAsistencia'
import { cargarEmpleadosDesdeAsistencia } from '@/modules/payroll/actions/cargarEmpleadosDesdeAsistencia'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DetalleEditForm } from './DetalleEditForm'
import { RegistrarIncapacidadForm } from './RegistrarIncapacidadForm'
import { ICON_CONTROL_BASE, ICON_CONTROL_TONES, IconButton } from '@/components/ui/IconButton'
import { META_LABEL, TABLE_DESKTOP_WRAP, TABLE_TH, TABLE_TH_RIGHT } from '@/components/ui/styles'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils/cn'

interface PeriodoDetailProps {
  periodo: PeriodoDetalle
  canWrite: boolean
  conceptosManuales: ConceptoNominaRow[]
}

/**
 * De dónde salió el total de horas: un día por fila, con lo que tenía
 * programado y lo que marcó.
 *
 * Existe para poder responder "¿por qué le salieron 78 h y no 88?" sin tener
 * que ir a la pantalla de asistencia a reconstruirlo a mano. Los días que no
 * cuentan (libre, feriado, ausencia aprobada, sin programación) se muestran
 * igual y en gris: que un día no sume es justamente lo que suele explicar la
 * diferencia.
 */
function DesgloseHoras({ detalle: d }: { detalle: DetalleNominaItem }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-brand-600" />
        <p className="text-xs font-bold text-slate-800">Horas de {d.empleadoNombre}, día por día</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-[10px] uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-3 font-semibold">Día</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Programadas</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Trabajadas</th>
              <th className="py-1.5 pr-3 text-right font-semibold">Extra</th>
              <th className="py-1.5 font-semibold">Nota</th>
            </tr>
          </thead>
          <tbody>
            {d.dias.map((dia) => (
              <tr
                key={dia.fecha}
                className={cn(
                  'border-b border-slate-100 last:border-0',
                  !dia.cuenta && 'text-slate-400'
                )}
              >
                <td className="py-1.5 pr-3 tabular-nums">{formatDate(dia.fecha)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {formatHoras(dia.horasEsperadas)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {formatHoras(dia.horasOrdinarias)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {dia.horasExtra > 0 ? formatHoras(dia.horasExtra) : '—'}
                </td>
                <td className="py-1.5 text-[11px]">
                  {dia.problema ? (
                    <span className="font-semibold text-amber-600">
                      {MENSAJE_PROBLEMA[dia.problema]}
                    </span>
                  ) : dia.cuenta ? (
                    ''
                  ) : (
                    'no cuenta para el periodo'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        {d.horasLeidasEn
          ? `Leído de las marcas el ${formatDate(d.horasLeidasEn.slice(0, 10))}. `
          : ''}
        Estas son las marcas de hoy; la planilla se pagó con lo que decían cuando se armó.
      </p>
    </div>
  )
}

/**
 * "se calculó con X, las marcas dicen Y", nombrando solo lo que de verdad
 * cambió.
 *
 * Las extra se mencionan aparte porque marcasCambiaron se dispara también
 * cuando SOLO cambian ellas: sin esto, una foto de 84 h + 0 extra contra
 * marcas de 84 h + 3 extra imprimía "se calculó con 84 h, las marcas dicen
 * 84 h" — una alerta roja diciendo que nada cambió.
 */
function diferenciaHoras(d: DetalleNominaItem): string {
  const ahora = d.horasAsistenciaAhora
  if (!ahora) return 'las marcas cambiaron'

  const partes: string[] = []
  if (Math.abs((d.horasAsistencia ?? 0) - ahora.horas) >= 0.005) {
    partes.push(`${formatHoras(d.horasAsistencia ?? 0)} h → ${formatHoras(ahora.horas)} h`)
  }
  if (Math.abs((d.horasExtraAsistencia ?? 0) - ahora.horasExtra) >= 0.005) {
    partes.push(
      `${formatHoras(d.horasExtraAsistencia ?? 0)} → ${formatHoras(ahora.horasExtra)} h extra`
    )
  }

  return partes.length > 0 ? partes.join(', ') : 'las marcas cambiaron'
}

/**
 * Línea de cuenta bajo el nombre del empleado. Son TRES estados, no dos: desde
 * que la cuenta se guarda cifrada puede haber una registrada que no se pudo
 * descifrar, y eso no es lo mismo que no tenerla. Quien arma la transferencia
 * necesita distinguirlo — en un caso hay que pedirle los datos al empleado, en
 * el otro el dato existe y el problema es técnico.
 */
function textoCuenta(d: DetalleNominaItem): string {
  if (d.numeroCuenta) {
    return `${d.bancoNombre ? d.bancoNombre + ' · ' : ''}${formatIban(d.numeroCuenta)}`
  }
  if (d.cuentaIlegible) return 'Cuenta registrada, ilegible — avisa a soporte'
  return 'Sin cuenta IBAN registrada'
}

/**
 * Las horas que dice la asistencia AHORA, si son distintas a las que tiene
 * guardadas la planilla. null cuando no hay nada que traer.
 *
 * Es a propósito una comparación contra lo GUARDADO y no contra la foto: el
 * caso más común no es que las marcas hayan cambiado, sino que la planilla se
 * armó con el prellenado de 88 h y la asistencia nunca llegó a entrar (porque
 * ese día no tenía horario, por ejemplo). Comparando contra la foto, esa fila
 * no ofrecía nada y había que bajar y volver a subir el Excel entero.
 */
function horasNuevas(d: DetalleNominaItem): { horas: number; horasExtra: number } | null {
  const ahora = d.horasAsistenciaAhora
  if (!ahora) return null

  const iguales =
    Math.abs(ahora.horas - d.horasTrabajadas) < 0.005 &&
    Math.abs(ahora.horasExtra - d.horasExtra) < 0.005

  return iguales ? null : ahora
}

/**
 * Cabecera del periodo + tabla de planilla. La edición manual de ingresos
 * (BASE, FERIADO, COMISION, HORAS_EXTRA, AJUSTE) solo se ofrece mientras el
 * periodo está en borrador — igual que la subida de Excel.
 */
export function PeriodoDetail({ periodo, canWrite, conceptosManuales }: PeriodoDetailProps) {
  const router = useRouter()
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [registrandoIncapacidadId, setRegistrandoIncapacidadId] = useState<number | null>(null)
  const [pagandoId, setPagandoId] = useState<number | null>(null)
  /** Empleado cuyo desglose día por día está abierto. */
  const [viendoHorasId, setViendoHorasId] = useState<number | null>(null)
  const [refrescandoId, setRefrescandoId] = useState<number | null>(null)
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false)
  /** Fila cuyas horas corregidas a mano habría que pisar: se pregunta antes. */
  const [confirmandoHoras, setConfirmandoHoras] = useState<{
    detalle: DetalleNominaItem
    mensaje: string
  } | null>(null)

  const puedeEditar = canWrite && periodo.estado === 'borrador'

  // Marcar/desmarcar un pago individual no depende del estado del periodo
  // (ndt_pagado es independiente de npe_estado) — solo requiere permiso de
  // escritura sobre nómina.
  async function handleTogglePagado(detalle: DetalleNominaItem) {
    setPagandoId(detalle.id)
    const result = await marcarDetallePagado(detalle.id, !detalle.pagado)
    setPagandoId(null)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success(
      detalle.pagado
        ? 'Pago desmarcado.'
        : 'Pago marcado como realizado. Ya puedes ver el comprobante.'
    )
    router.refresh()
  }

  /**
   * Trae a los empleados activos de la sucursal que todavía no están en el
   * periodo, con las horas de la asistencia. A los que ya están no les toca
   * nada: sus montos pueden estar editados a mano.
   */
  async function handleCargarEmpleados() {
    setCargandoEmpleados(true)
    const result = await cargarEmpleadosDesdeAsistencia(periodo.id)
    setCargandoEmpleados(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    if (result.agregados === 0) {
      toast.info('Todos los empleados activos de la sucursal ya están en este periodo.')
      return
    }

    const aviso =
      result.sinAsistencia > 0
        ? ` ${result.sinAsistencia} sin marcas en el periodo: quedaron con la jornada completa supuesta, revisalos.`
        : ''
    toast.success(`${result.agregados} empleado(s) agregados desde la asistencia.${aviso}`)
    router.refresh()
  }

  /**
   * Trae las horas que dice la asistencia y recalcula esa fila.
   *
   * Si las horas estaban corregidas a mano, la acción no las pisa: devuelve
   * `necesitaConfirmacion` y acá se pregunta. Reemplazar una corrección
   * deliberada sin avisar sería borrar una decisión sin dejar rastro.
   */
  async function handleRefrescarHoras(detalle: DetalleNominaItem, confirmado: boolean) {
    setConfirmandoHoras(null)
    setRefrescandoId(detalle.id)
    const result = await refrescarHorasAsistencia(detalle.id, confirmado)
    setRefrescandoId(null)

    if (!result.ok) {
      if (result.necesitaConfirmacion) {
        setConfirmandoHoras({ detalle, mensaje: result.error })
        return
      }
      toast.error(result.error)
      return
    }

    if (result.sinCambios) {
      toast.info('Las horas de este empleado ya están al día con la asistencia.')
      return
    }

    const aviso = result.baseConservado
      ? ' El salario base estaba editado a mano y lo dejé como estaba: revisalo.'
      : ''
    toast.success(
      `Horas actualizadas: ${formatHoras(result.horas)} h${
        result.horasExtra > 0 ? ` y ${formatHoras(result.horasExtra)} h extra` : ''
      }.${aviso}`
    )
    router.refresh()
  }

  // Los totales se calculan sobre todos los detalles del periodo, no solo
  // sobre la página visible — son un resumen del periodo completo.
  const totalBruto = periodo.detalles.reduce((sum, d) => sum + d.salarioBruto, 0)
  // Empleados a los que no se les puede marcar el pago todavía: sus marcas del
  // periodo están incompletas, así que las horas calculadas están cortas.
  const conMarcasIncompletas = periodo.detalles.filter((d) =>
    d.diasPorRevisar.some((r) => PROBLEMAS_QUE_BLOQUEAN.has(r.problema as ProblemaDia))
  )
  // Días que solo se avisan: la persona marcó pero ese día no tenía horario
  // programado, así que esas horas no entraron. No traba el pago — trabarlo
  // obligaría a inventarle un horario a un día pasado, y eso cambiaría el
  // valor de la hora de toda la quincena.
  const conDiasSinHorario = periodo.detalles
    .map((d) => ({
      detalle: d,
      dias: d.diasPorRevisar.filter((r) => !PROBLEMAS_QUE_BLOQUEAN.has(r.problema as ProblemaDia)),
    }))
    .filter((x) => x.dias.length > 0)
  // Alguien corrigió una marca DESPUÉS de armada la planilla, así que el monto
  // guardado ya no corresponde. Solo cuenta cuando las horas venían de la
  // asistencia: si estaban corregidas a mano, la diferencia es deliberada.
  const conMarcasDesactualizadas = periodo.detalles.filter(
    (d) => d.marcasCambiaron && d.horasOrigen === 'asistencia'
  )
  const totalDeduccionPorcentual = periodo.detalles.reduce(
    (sum, d) => sum + d.deduccionPorcentual,
    0
  )
  const totalDeduccionManual = periodo.detalles.reduce((sum, d) => sum + d.deduccionManual, 0)
  const totalNeto = periodo.detalles.reduce((sum, d) => sum + d.salarioNeto, 0)
  const totalHoras = periodo.detalles.reduce((sum, d) => sum + d.horasTrabajadas, 0)
  const totalHorasExtra = periodo.detalles.reduce((sum, d) => sum + d.horasExtra, 0)
  const totalIncapacidad = periodo.detalles.reduce((sum, d) => sum + (d.incapacidad?.monto ?? 0), 0)
  const totalNoSalarial = periodo.detalles.reduce((sum, d) => sum + d.totalNoSalarial, 0)
  const totalCargasPatronales = periodo.detalles.reduce((sum, d) => sum + d.cargasPatronales, 0)
  // Lo que de verdad sale del banco por este periodo. Es el mismo número que
  // imprime el comprobante de cada empleado.
  const totalAPagar = periodo.detalles.reduce((sum, d) => sum + d.totalAPagar, 0)

  const { page, totalPages, paginatedItems, goToPreviousPage, goToNextPage } = usePagination(
    periodo.detalles,
    8
  )

  /**
   * De dónde salieron las horas de esta fila. Solo aparece cuando hay algo que
   * decir: si las horas son las de las marcas y siguen al día, no se muestra
   * nada — poner "vienen de la asistencia" en cada fila sería ruido.
   */
  function NotaHoras({ detalle: d }: { detalle: DetalleNominaItem }) {
    const nuevas = horasNuevas(d)

    const nota =
      d.marcasCambiaron && d.horasOrigen === 'asistencia' ? (
        <span
          className="mt-0.5 block text-[11px] font-semibold text-rose-600"
          title={diferenciaHoras(d)}
        >
          las marcas cambiaron
        </span>
      ) : d.horasOrigen === 'ajustadas' ? (
        <span
          className="mt-0.5 block text-[11px] text-slate-400"
          title={
            d.horasAjustadasEn
              ? `Corregidas el ${formatDate(d.horasAjustadasEn.slice(0, 10))}`
              : undefined
          }
        >
          corregidas — las marcas decían {formatHoras(d.horasAsistencia ?? 0)} h
        </span>
      ) : null

    // El botón solo aparece cuando de verdad hay algo distinto que traer, y
    // nunca sobre una fila ya pagada ni un periodo cerrado. Ahorra tener que
    // bajar y volver a subir el Excel entero por un solo empleado.
    const boton =
      puedeEditar && !d.pagado && nuevas ? (
        <button
          type="button"
          onClick={() => handleRefrescarHoras(d, false)}
          disabled={refrescandoId === d.id}
          title={`La asistencia dice ${formatHoras(nuevas.horas)} h${
            nuevas.horasExtra > 0 ? ` y ${formatHoras(nuevas.horasExtra)} h extra` : ''
          }. Recalcula esta fila con esas horas.`}
          className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600 outline-none transition hover:text-brand-700 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          {refrescandoId === d.id ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          traer {formatHoras(nuevas.horas)} h
        </button>
      ) : null

    if (!nota && !boton) return null

    return (
      <>
        {nota}
        {boton}
      </>
    )
  }

  /** Toggle de pago + acceso al comprobante. Lo rinden tarjetas y tabla. */
  function EstadoPago({ detalle: d }: { detalle: DetalleNominaItem }) {
    return (
      <div className="flex items-center gap-1.5">
        {canWrite ? (
          <button
            type="button"
            onClick={() => handleTogglePagado(d)}
            disabled={pagandoId === d.id}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold outline-none ring-1 ring-inset transition active:scale-95 motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:cursor-not-allowed disabled:opacity-60 ${
              d.pagado
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100'
            }`}
          >
            {pagandoId === d.id ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
            )}
            {d.pagado ? 'Pagado' : 'Pendiente'}
          </button>
        ) : (
          <Badge tone={d.pagado ? 'emerald' : 'slate'}>{d.pagado ? 'Pagado' : 'Pendiente'}</Badge>
        )}
        {d.pagado && (
          <Link
            href={`/comprobante/${periodo.id}/${d.id}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ver comprobante de pago"
            className={cn(ICON_CONTROL_BASE, ICON_CONTROL_TONES.blue, 'shrink-0')}
          >
            <Receipt className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    )
  }

  /** Editar ingresos y registrar incapacidad. */
  function AccionesDetalle({ detalle: d }: { detalle: DetalleNominaItem }) {
    return (
      <>
        {puedeEditar && (
          <IconButton
            onClick={() => setEditandoId(editandoId === d.id ? null : d.id)}
            aria-label={editandoId === d.id ? 'Cerrar edición' : 'Editar ingresos'}
            tone="blue"
          >
            {editandoId === d.id ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </IconButton>
        )}
        <IconButton
          onClick={() =>
            setRegistrandoIncapacidadId(registrandoIncapacidadId === d.id ? null : d.id)
          }
          aria-label={
            registrandoIncapacidadId === d.id
              ? 'Cerrar registro de incapacidad'
              : 'Registrar incapacidad'
          }
          tone="rose"
        >
          {registrandoIncapacidadId === d.id ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Stethoscope className="h-3.5 w-3.5" />
          )}
        </IconButton>
      </>
    )
  }

  const resumen = [
    {
      key: 'empleados',
      icon: Users,
      label: 'Empleados en planilla',
      value: String(periodo.detalles.length),
      tone: 'bg-brand-50 text-brand-600',
    },
    {
      key: 'bruto',
      icon: Banknote,
      label: 'Salario bruto total',
      value: formatCRC(totalBruto),
      tone: 'bg-slate-100 text-slate-600',
    },
    {
      key: 'neto',
      icon: CalendarDays,
      label: 'Neto a pagar',
      value: formatCRC(totalNeto),
      tone: 'bg-emerald-50 text-emerald-600',
    },
  ]

  return (
    <div className="@container space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-slate-900">
              {periodoLabel(periodo.mes, periodo.anio, periodo.quincena)}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {periodo.sucursalNombre} · {formatDate(periodo.fechaInicio)} —{' '}
              {formatDate(periodo.fechaFin)}
            </p>
          </div>
          <Badge
            tone={estadoBadgeTone(estadoVisible(periodo.estado, periodo.atrasado))}
            className="px-2.5 py-1 text-xs"
          >
            {estadoLabel(estadoVisible(periodo.estado, periodo.atrasado))}
          </Badge>
        </div>

        {periodo.fechaPago && (
          <p className="mt-3 text-xs text-slate-500">
            Fecha de pago: <span className="font-semibold">{formatDate(periodo.fechaPago)}</span>
          </p>
        )}
        {periodo.observaciones && (
          <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">
            {periodo.observaciones}
          </p>
        )}
      </div>

      {conMarcasIncompletas.length > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">
            {conMarcasIncompletas.length} empleado(s) con marcas de asistencia incompletas
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Sus horas calculadas están cortas, así que el pago está bloqueado hasta corregir las
            marcas en Asistencia.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-900">
            {conMarcasIncompletas.map((d) => (
              <li key={d.id}>
                <span className="font-semibold">{d.empleadoNombre}</span>{' '}
                <span className="text-amber-700">
                  —{' '}
                  {d.diasPorRevisar
                    .filter((r) => PROBLEMAS_QUE_BLOQUEAN.has(r.problema as ProblemaDia))
                    .map((r) => formatDate(r.fecha))
                    .join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conDiasSinHorario.length > 0 && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-sm font-semibold text-sky-900">
            {conDiasSinHorario.length} empleado(s) marcaron un día sin horario programado
          </p>
          <p className="mt-1 text-xs leading-relaxed text-sky-800">
            Esas horas no se contaron porque no había jornada contra la cual medirlas. Si de verdad
            trabajaron ese día, asignáles el horario en Horarios y volvé a armar el periodo; si fue
            un toque de más en el kiosco, dejalo así. Esto no bloquea el pago.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-sky-900">
            {conDiasSinHorario.map(({ detalle, dias }) => (
              <li key={detalle.id}>
                <span className="font-semibold">{detalle.empleadoNombre}</span>{' '}
                <span className="text-sky-700">
                  — {dias.map((r) => formatDate(r.fecha)).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {conMarcasDesactualizadas.length > 0 && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
          <p className="text-sm font-semibold text-rose-900">
            {conMarcasDesactualizadas.length} empleado(s) con la planilla desactualizada
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-800">
            Sus marcas de asistencia cambiaron después de armar la planilla, así que el monto
            calculado ya no corresponde y el pago está bloqueado. Usá el botón{' '}
            <span className="font-semibold">traer … h</span> que aparece junto a las horas de cada
            uno, o corregilas a mano en el detalle. También podés descargar de nuevo la plantilla y
            subirla; volver a subir el MISMO archivo no sirve, trae las horas viejas.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-rose-900">
            {conMarcasDesactualizadas.map((d) => (
              <li key={d.id}>
                <span className="font-semibold">{d.empleadoNombre}</span>{' '}
                <span className="text-rose-700">— {diferenciaHoras(d)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-3">
        {resumen.map(({ key, icon: Icon, label, value, tone }) => (
          <div
            key={key}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,.04)]"
          >
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${tone}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-slate-500">{label}</p>
              <p className="truncate text-sm font-bold text-slate-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {periodo.detalles.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm font-semibold text-slate-700">Planilla vacía</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Crear el periodo no trae a nadie: hay que cargar los empleados de la sucursal. Con el
            botón se traen con las horas que dicen las marcas del kiosco; también podés descargar la
            plantilla de Excel, revisarla y subirla.
          </p>
          {puedeEditar && (
            <button
              type="button"
              onClick={handleCargarEmpleados}
              disabled={cargandoEmpleados}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white outline-none transition hover:bg-brand-700 disabled:opacity-60 focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              {cargandoEmpleados ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Users className="h-4 w-4" />
              )}
              Cargar empleados desde asistencia
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl @3xl:border @3xl:border-slate-200 @3xl:bg-white @3xl:shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          {/*
            Para los que entraron a la sucursal después de armada la planilla:
            los agrega sin tocar a nadie que ya esté.
          */}
          {puedeEditar && (
            <div className="flex justify-end px-3 pt-3 @3xl:px-4 @3xl:pt-4">
              <button
                type="button"
                onClick={handleCargarEmpleados}
                disabled={cargandoEmpleados}
                title="Agrega a los empleados activos de la sucursal que falten, con las horas de la asistencia. No toca a los que ya están."
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 outline-none transition hover:text-brand-700 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-500/60"
              >
                {cargandoEmpleados ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Users className="h-3.5 w-3.5" />
                )}
                Agregar empleados que falten
              </button>
            </div>
          )}
          {/*
            Movil: tarjeta por empleado. Son nueve columnas de montos; en
            375px el scroll horizontal dejaba al usuario adivinando cual
            cifra estaba mirando. El neto va aparte y en grande porque es el
            numero que se viene a buscar — los demas son su desglose.
          */}
          <ul className="space-y-3 p-3 @3xl:hidden">
            {paginatedItems.map((d, i) => (
              <li
                key={d.id}
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
                className="animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-semibold text-slate-900">
                      {d.empleadoNombre}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{textoCuenta(d)}</p>
                  </div>
                  <EstadoPago detalle={d} />
                </div>

                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2">
                  <span className={META_LABEL}>Total a pagar</span>
                  <span className="text-base font-bold tabular-nums text-slate-900">
                    {formatCRC(d.totalAPagar)}
                  </span>
                </div>

                {(d.horasOrigen === 'ajustadas' || d.marcasCambiaron || horasNuevas(d)) && (
                  <div className="text-right">
                    <NotaHoras detalle={d} />
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {[
                    {
                      label: 'Horas',
                      valor:
                        d.horasExtra > 0
                          ? `${formatHoras(d.horasTrabajadas)} h (+${formatHoras(d.horasExtra)} extra)`
                          : `${formatHoras(d.horasTrabajadas)} h`,
                    },
                    { label: 'Valor hora', valor: formatCRC(d.salarioPorHora) },
                    { label: 'Bruto', valor: formatCRC(d.salarioBruto) },
                    {
                      label: 'Deducc. %',
                      valor: formatCRC(d.deduccionPorcentual),
                    },
                    {
                      label: 'Deducc. manual',
                      valor: formatCRC(d.deduccionManual),
                    },
                    {
                      label: 'Viáticos',
                      valor: d.totalNoSalarial > 0 ? formatCRC(d.totalNoSalarial) : '—',
                    },
                    { label: 'Salario neto', valor: formatCRC(d.salarioNeto) },
                    {
                      label: 'Cargas patronales',
                      valor: formatCRC(d.cargasPatronales),
                    },
                    {
                      label: 'Incapacidad',
                      valor: d.incapacidad ? formatCRC(d.incapacidad.monto) : '—',
                    },
                  ].map(({ label, valor }) => (
                    <div key={label} className="min-w-0">
                      <dt className={META_LABEL}>{label}</dt>
                      <dd className="mt-0.5 text-xs tabular-nums text-slate-600">{valor}</dd>
                    </div>
                  ))}
                </dl>

                {canWrite && (
                  // gap-2: con el area tocable en 44px, gap-1 los deja pegados.
                  <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                    <AccionesDetalle detalle={d} />
                  </div>
                )}

                {puedeEditar && editandoId === d.id && (
                  <div className="rounded-xl bg-slate-50/60 p-3">
                    <div className="mb-3 flex items-center gap-2">
                      <Pencil className="h-3.5 w-3.5 text-brand-600" />
                      <p className="text-xs font-bold text-slate-800">Editar ingresos</p>
                    </div>
                    <DetalleEditForm
                      detalle={d}
                      conceptosManuales={conceptosManuales}
                      onCancel={() => setEditandoId(null)}
                      onSuccess={() => {
                        setEditandoId(null)
                        router.refresh()
                      }}
                    />
                  </div>
                )}

                {canWrite && registrandoIncapacidadId === d.id && (
                  <div className="rounded-xl bg-slate-50/60 p-3">
                    <RegistrarIncapacidadForm
                      historialLaboralId={d.historialLaboralId}
                      empleadoNombre={d.empleadoNombre}
                      onCancel={() => setRegistrandoIncapacidadId(null)}
                      onSuccess={() => setRegistrandoIncapacidadId(null)}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className={TABLE_DESKTOP_WRAP}>
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className={TABLE_TH}>Empleado</th>
                  <th
                    className={TABLE_TH_RIGHT}
                    title="Horas de la quincena según las marcas de asistencia, y las que pasan de la jornada programada"
                  >
                    Horas
                  </th>
                  <th className={TABLE_TH_RIGHT}>Salario bruto</th>
                  <th className={TABLE_TH_RIGHT} title="% del salario bruto, ej. CCSS obrera">
                    Deducc. % (bruto)
                  </th>
                  <th
                    className={TABLE_TH_RIGHT}
                    title="Monto fijo decidido por el patrono, ej. préstamo"
                  >
                    Deducc. manual (neto)
                  </th>
                  <th
                    className={TABLE_TH_RIGHT}
                    title="Lo que paga la empresa encima del salario (CCSS patronal). No se le rebaja a nadie ni cambia el neto: es el costo de la planilla"
                  >
                    Cargas patronales
                  </th>
                  <th
                    className={TABLE_TH_RIGHT}
                    title="Bruto − deducciones + viáticos. Los viáticos no cotizan, por eso van al final"
                  >
                    Salario neto
                  </th>
                  <th
                    className={TABLE_TH_RIGHT}
                    title="Salario neto + lo que la empresa paga de incapacidad. Es el monto que imprime el comprobante"
                  >
                    Total a pagar
                  </th>
                  <th className={TABLE_TH}>Pago</th>
                  {canWrite && <th className={TABLE_TH_RIGHT}>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((d) => (
                  <Fragment key={d.id}>
                    <tr className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-slate-900">{d.empleadoNombre}</p>
                        <p className="mt-0.5 text-[11px] font-normal text-slate-400">
                          {textoCuenta(d)}
                        </p>
                      </td>
                      <td
                        className="px-3 py-2 text-right text-slate-600"
                        title={`Valor de la hora: ${formatCRC(d.salarioPorHora)}`}
                      >
                        <span className="tabular-nums">{formatHoras(d.horasTrabajadas)} h</span>
                        {d.horasExtra > 0 && (
                          <span className="mt-0.5 block text-[11px] font-semibold text-amber-600">
                            +{formatHoras(d.horasExtra)} h extra
                          </span>
                        )}
                        <NotaHoras detalle={d} />
                        {d.dias.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setViendoHorasId(viendoHorasId === d.id ? null : d.id)}
                            className="mt-0.5 block w-full text-right text-[11px] font-semibold text-brand-600 outline-none transition hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500/60"
                          >
                            {viendoHorasId === d.id ? 'ocultar días' : 'ver días'}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCRC(d.salarioBruto)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCRC(d.deduccionPorcentual)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCRC(d.deduccionManual)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        {formatCRC(d.cargasPatronales)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-600">
                        <span className="tabular-nums">{formatCRC(d.salarioNeto)}</span>
                        {d.totalNoSalarial > 0 && (
                          <span className="mt-0.5 block text-[11px] text-slate-400">
                            incl. {formatCRC(d.totalNoSalarial)} de viáticos
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-900">
                        <span className="tabular-nums">{formatCRC(d.totalAPagar)}</span>
                        {d.incapacidad && d.incapacidad.monto > 0 && (
                          <span
                            className="mt-0.5 block text-[11px] font-normal text-slate-400"
                            title={`${d.incapacidad.diasEmpleador}d patrono / ${d.incapacidad.diasCcss}d CCSS`}
                          >
                            incl. {formatCRC(d.incapacidad.monto)} de incapacidad
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <EstadoPago detalle={d} />
                      </td>
                      {canWrite && (
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <AccionesDetalle detalle={d} />
                          </div>
                        </td>
                      )}
                    </tr>
                    {viendoHorasId === d.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={10} className="px-4 py-4">
                          <DesgloseHoras detalle={d} />
                        </td>
                      </tr>
                    )}
                    {puedeEditar && editandoId === d.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={10} className="px-4 py-4">
                          <div className="mb-3 flex items-center gap-2">
                            <Pencil className="h-3.5 w-3.5 text-brand-600" />
                            <p className="text-xs font-bold text-slate-800">
                              Editar ingresos de {d.empleadoNombre}
                            </p>
                          </div>
                          <DetalleEditForm
                            detalle={d}
                            conceptosManuales={conceptosManuales}
                            onCancel={() => setEditandoId(null)}
                            onSuccess={() => {
                              setEditandoId(null)
                              router.refresh()
                            }}
                          />
                        </td>
                      </tr>
                    )}
                    {canWrite && registrandoIncapacidadId === d.id && (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={10} className="px-4 py-4">
                          <RegistrarIncapacidadForm
                            historialLaboralId={d.historialLaboralId}
                            empleadoNombre={d.empleadoNombre}
                            onCancel={() => setRegistrandoIncapacidadId(null)}
                            onSuccess={() => setRegistrandoIncapacidadId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-100 bg-slate-50/60 text-sm font-bold text-slate-900">
                  <td className="px-3 py-2">Totales</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatHoras(totalHoras)} h
                    {totalHorasExtra > 0 && (
                      <span className="mt-0.5 block text-[11px] text-amber-600">
                        +{formatHoras(totalHorasExtra)} h
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">{formatCRC(totalBruto)}</td>
                  <td className="px-3 py-2 text-right">{formatCRC(totalDeduccionPorcentual)}</td>
                  <td className="px-3 py-2 text-right">{formatCRC(totalDeduccionManual)}</td>
                  <td className="px-3 py-2 text-right">{formatCRC(totalCargasPatronales)}</td>
                  <td className="px-3 py-2 text-right">
                    <span className="tabular-nums">{formatCRC(totalNeto)}</span>
                    {totalNoSalarial > 0 && (
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                        incl. {formatCRC(totalNoSalarial)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span className="tabular-nums">{formatCRC(totalAPagar)}</span>
                    {totalIncapacidad > 0 && (
                      <span className="mt-0.5 block text-[11px] font-normal text-slate-400">
                        incl. {formatCRC(totalIncapacidad)}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2" />
                  {canWrite && <td className="px-3 py-2" />}
                </tr>
              </tfoot>
            </table>
          </div>
          <Pagination
            page={page}
            totalPages={totalPages}
            onPrevious={goToPreviousPage}
            onNext={goToNextPage}
          />
        </div>
      )}

      {confirmandoHoras && (
        <ConfirmDialog
          title={`Reemplazar las horas de ${confirmandoHoras.detalle.empleadoNombre}`}
          message={confirmandoHoras.mensaje}
          confirmLabel="Usar las de asistencia"
          onCancel={() => setConfirmandoHoras(null)}
          onConfirm={() => handleRefrescarHoras(confirmandoHoras.detalle, true)}
        />
      )}
    </div>
  )
}
