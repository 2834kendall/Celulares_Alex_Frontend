import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { getPeriodoDetail } from '@/modules/payroll/actions/getPeriodoDetail'
import { getConceptos } from '@/modules/payroll/actions/getConceptos'
import { formatCRC, formatDate, formatHoras, periodoLabel } from '@/modules/payroll/lib/format'
import { PrintComprobanteButton } from '@/modules/payroll/components/PrintComprobanteButton'

interface ComprobantePageProps {
  params: Promise<{ periodoId: string; detalleId: string }>
}

const TIPOS_CALCULO_INGRESO = new Set(['monto_manual_ingreso', 'horas_extra_automatico'])

function Linea({
  label,
  value,
  strong = false,
}: {
  label: string
  value: string
  strong?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${strong ? 'font-bold text-slate-900' : 'text-slate-600'}`}
    >
      <span className={strong ? '' : 'text-sm'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

export default async function ComprobantePage({ params }: ComprobantePageProps) {
  const { periodoId: periodoIdParam, detalleId: detalleIdParam } = await params
  const periodoId = Number(periodoIdParam)
  const detalleId = Number(detalleIdParam)

  if (
    !Number.isInteger(periodoId) ||
    periodoId <= 0 ||
    !Number.isInteger(detalleId) ||
    detalleId <= 0
  ) {
    notFound()
  }

  await requirePermission(PERMISOS.NOMINA_READ)

  const [empresaNombre, detailResult, conceptosResult] = await Promise.all([
    getEmpresaNombre(),
    getPeriodoDetail(periodoId),
    getConceptos(),
  ])

  if (!detailResult.ok) {
    notFound()
  }

  const detalle = detailResult.data.detalles.find((d) => d.id === detalleId)
  if (!detalle) {
    notFound()
  }

  const conceptoPorCodigo = new Map(
    (conceptosResult.ok ? conceptosResult.data : []).map((c) => [c.con_codigo, c])
  )

  const lineasIngreso: { label: string; value: number }[] = []
  // Lo que se paga pero no es salario (viáticos): va en su propio bloque,
  // después de las deducciones, porque no cotiza ni cuenta para el aguinaldo.
  const lineasNoSalarial: { label: string; value: number }[] = []
  const lineasDeduccion: { label: string; value: number }[] = []
  const codigosMostrados = new Set<string>()

  /** Un ingreso va al bloque de salario o al de "otros pagos" según el catálogo. */
  function agregarIngreso(
    concepto: { con_afecta_salario_bruto: boolean } | undefined,
    label: string,
    value: number
  ) {
    if (concepto?.con_afecta_salario_bruto === false) {
      // Los no salariales solo se listan si tienen monto: un "Viáticos ₡0" en
      // cada comprobante es ruido, a diferencia de los rubros de salario.
      if (value > 0) lineasNoSalarial.push({ label, value })
      return
    }
    lineasIngreso.push({ label, value })
  }

  // Todos los conceptos de ingreso ACTIVOS del catálogo se muestran siempre,
  // aunque el empleado no haya ganado nada ahí este periodo — así "0" queda
  // explícito (ej. Feriado) en vez de que el rubro simplemente desaparezca.
  for (const concepto of conceptosResult.ok ? conceptosResult.data : []) {
    if (!concepto.con_activo || !TIPOS_CALCULO_INGRESO.has(concepto.con_tipo_calculo)) continue
    agregarIngreso(
      concepto,
      concepto.con_nombre,
      detalle.montosPorConcepto[concepto.con_codigo] ?? 0
    )
    codigosMostrados.add(concepto.con_codigo)
  }

  // Cualquier otro monto real guardado: deducciones (solo si tienen monto,
  // no tiene sentido listar cada deducción posible en 0) y conceptos de
  // ingreso ya desactivados del catálogo que igual quedaron pagados en este
  // periodo (ej. un pago de banco de horas con HORAS_EXTRA).
  for (const [codigo, monto] of Object.entries(detalle.montosPorConcepto)) {
    if (codigosMostrados.has(codigo) || monto <= 0) continue
    const concepto = conceptoPorCodigo.get(codigo)
    const label = concepto?.con_nombre ?? codigo
    if (concepto && TIPOS_CALCULO_INGRESO.has(concepto.con_tipo_calculo)) {
      agregarIngreso(concepto, label, monto)
    } else {
      lineasDeduccion.push({ label, value: monto })
    }
  }

  // Bruto − deducciones, antes de sumar lo no salarial. Se muestra para que
  // las tres líneas de arriba cuadren a la vista con el neto.
  const subtotal = detalle.salarioBruto - detalle.totalDeducciones

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href={`/payroll/${periodoId}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al periodo
        </Link>
        <PrintComprobanteButton />
      </div>

      {!detalle.pagado && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800 print:hidden">
          Este pago todavía no se ha marcado como pagado. El comprobante se puede ver de todas
          formas, pero no debería entregarse hasta confirmar el desembolso.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {empresaNombre}
          </p>
          <h1 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">
            Comprobante de pago
          </h1>
          <p className="mt-0.5 text-xs text-slate-500">
            {periodoLabel(
              detailResult.data.mes,
              detailResult.data.anio,
              detailResult.data.quincena
            )}{' '}
            · {detailResult.data.sucursalNombre}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 py-4 text-sm">
          <div>
            <p className="text-[11px] font-medium text-slate-400">Empleado</p>
            <p className="font-semibold text-slate-900">{detalle.empleadoNombre}</p>
            <p className="text-xs text-slate-500">{detalle.empleadoCedula}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Periodo pagado</p>
            <p className="font-semibold text-slate-900">
              {formatDate(detailResult.data.fechaInicio)} — {formatDate(detailResult.data.fechaFin)}
            </p>
            <p className="text-xs text-slate-500">Fecha de pago: {formatDate(detalle.fechaPago)}</p>
          </div>
        </div>

        {/*
          Las horas van impresas porque son de dónde sale el monto: sin ellas
          el empleado recibe un número y no tiene con qué comprobarlo. Son las
          mismas que calculó el periodo a partir de sus marcas de asistencia.
        */}
        <div className="grid grid-cols-3 gap-4 border-b border-slate-100 py-4 text-sm">
          <div>
            <p className="text-[11px] font-medium text-slate-400">Horas trabajadas</p>
            <p className="font-semibold tabular-nums text-slate-900">
              {formatHoras(detalle.horasTrabajadas)} h
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Horas extra</p>
            <p className="font-semibold tabular-nums text-slate-900">
              {detalle.horasExtra > 0 ? `${formatHoras(detalle.horasExtra)} h` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Valor de la hora</p>
            <p className="font-semibold tabular-nums text-slate-900">
              {formatCRC(detalle.salarioPorHora)}
            </p>
          </div>
        </div>

        <div className="py-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Ingresos
          </p>
          {lineasIngreso.length === 0 ? (
            <p className="text-xs text-slate-400">Sin ingresos registrados.</p>
          ) : (
            lineasIngreso.map((l) => (
              <Linea key={l.label} label={l.label} value={formatCRC(l.value)} />
            ))
          )}
          <div className="my-2 border-t border-slate-100" />
          <Linea label="Salario bruto" value={formatCRC(detalle.salarioBruto)} strong />

          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Deducciones
          </p>
          {lineasDeduccion.length === 0 ? (
            <p className="text-xs text-slate-400">Sin deducciones registradas.</p>
          ) : (
            lineasDeduccion.map((l) => (
              <Linea key={l.label} label={l.label} value={`− ${formatCRC(l.value)}`} />
            ))
          )}
          <div className="my-2 border-t border-slate-100" />
          <Linea
            label="Total deducciones"
            value={`− ${formatCRC(detalle.totalDeducciones)}`}
            strong
          />

          {lineasNoSalarial.length > 0 && (
            <>
              <Linea label="Subtotal" value={formatCRC(subtotal)} />

              <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Otros pagos
              </p>
              {lineasNoSalarial.map((l) => (
                <Linea key={l.label} label={l.label} value={formatCRC(l.value)} />
              ))}
              <p className="mt-1 text-[11px] text-slate-400">
                No son salario: no se les rebaja CCSS y no cuentan para el aguinaldo.
              </p>
            </>
          )}

          <div className="my-2 border-t border-slate-100" />
          {detalle.incapacidad ? (
            <Linea label="Salario neto" value={formatCRC(detalle.salarioNeto)} strong />
          ) : (
            <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-base font-extrabold text-emerald-800">
              <span>Salario neto pagado</span>
              <span className="tabular-nums">{formatCRC(detalle.totalAPagar)}</span>
            </div>
          )}

          {detalle.incapacidad && (
            <>
              <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Incapacidad por enfermedad
              </p>
              <Linea
                label={`Días pagados por la empresa (${detalle.incapacidad.porcentajePagoEmpleador}% del salario)`}
                value={`${detalle.incapacidad.diasEmpleador} día(s)`}
              />
              {detalle.incapacidad.diasCcss > 0 && (
                <Linea
                  label="Días pagados por la CCSS"
                  value={`${detalle.incapacidad.diasCcss} día(s)`}
                />
              )}
              <div className="my-2 border-t border-slate-100" />
              <Linea
                label="Monto de incapacidad"
                value={formatCRC(detalle.incapacidad.monto)}
                strong
              />

              <div className="my-2 border-t border-slate-100" />
              <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-base font-extrabold text-emerald-800">
                <span>Total a pagar</span>
                <span className="tabular-nums">{formatCRC(detalle.totalAPagar)}</span>
              </div>
            </>
          )}
        </div>

        {detalle.codigoVerificacion && (
          <div className="mt-6 flex items-baseline justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
            <span>Código de verificación</span>
            <span className="font-mono text-xs font-semibold tracking-wider text-slate-700">
              {detalle.codigoVerificacion}
            </span>
          </div>
        )}

        <div className="mt-10 grid grid-cols-2 gap-8 pt-4 text-center text-[11px] text-slate-500">
          <div>
            <div className="border-t border-slate-300 pt-1">Entregado por</div>
          </div>
          <div>
            <div className="border-t border-slate-300 pt-1">Recibido por</div>
          </div>
        </div>
      </div>
    </div>
  )
}
