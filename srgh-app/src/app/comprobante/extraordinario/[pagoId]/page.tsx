import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getEmpresaNombre } from '@/lib/empresa/get-empresa-nombre'
import { getPagoExtraordinario } from '@/modules/payroll/actions/getPagoExtraordinario'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { PrintComprobanteButton } from '@/modules/payroll/components/PrintComprobanteButton'

interface ComprobanteExtraordinarioPageProps {
  params: Promise<{ pagoId: string }>
}

function Linea({
  label,
  value,
  strong = false,
  muted = false,
}: {
  label: string
  value: string
  strong?: boolean
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-center justify-between py-1.5 ${
        strong ? 'font-bold text-slate-900' : muted ? 'text-slate-400' : 'text-slate-600'
      }`}
    >
      <span className={strong ? '' : 'text-sm'}>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  )
}

/**
 * Comprobante de un pago de aguinaldo o de liquidación. Se arma con lo que
 * quedó congelado al pagar (sgrh_pagos_extraordinarios): no se recalcula
 * nada, así el papel dice siempre lo mismo que se entregó.
 */
export default async function ComprobanteExtraordinarioPage({
  params,
}: ComprobanteExtraordinarioPageProps) {
  const { pagoId: pagoIdParam } = await params
  const pagoId = Number(pagoIdParam)
  if (!Number.isInteger(pagoId) || pagoId <= 0) notFound()

  await requirePermission(PERMISOS.NOMINA_READ)

  const [empresaNombre, pagoResult] = await Promise.all([
    getEmpresaNombre(),
    getPagoExtraordinario(pagoId),
  ])
  if (!pagoResult.ok) notFound()
  const pago = pagoResult.data

  const titulo =
    pago.tipo === 'aguinaldo' ? 'Comprobante de pago de aguinaldo' : 'Comprobante de liquidación'
  const subtitulo =
    pago.tipo === 'aguinaldo' && pago.anioAguinaldo
      ? `Ciclo del 1 de diciembre de ${pago.anioAguinaldo - 1} al 30 de noviembre de ${pago.anioAguinaldo}`
      : `Salida: ${formatDate(pago.fechaSalida)}${pago.motivoSalida ? ` · ${pago.motivoSalida}` : ''}`

  const rubros = pago.lineas.filter((l) => !l.informativo && !l.deduccion)
  const informativas = pago.lineas.filter((l) => l.informativo)
  const deducciones = pago.lineas.filter((l) => l.deduccion && l.monto > 0)

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-slate-50 px-4 py-8 print:bg-white print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <Link
          href="/payroll/aguinaldo-liquidacion"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 outline-none transition hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-brand-500/60"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a aguinaldo y liquidación
        </Link>
        <PrintComprobanteButton />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <div className="border-b border-slate-100 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {empresaNombre}
          </p>
          <h1 className="mt-1 text-lg font-extrabold tracking-tight text-slate-900">{titulo}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{subtitulo}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 border-b border-slate-100 py-4 text-sm">
          <div>
            <p className="text-[11px] font-medium text-slate-400">Empleado</p>
            <p className="font-semibold text-slate-900">{pago.empleadoNombre}</p>
            <p className="text-xs text-slate-500">{pago.empleadoCedula}</p>
          </div>
          <div>
            <p className="text-[11px] font-medium text-slate-400">Fecha de pago</p>
            <p className="font-semibold text-slate-900">{formatDate(pago.fechaPago)}</p>
          </div>
        </div>

        <div className="py-4">
          {informativas.length > 0 && (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Cálculo
              </p>
              {informativas.map((l) => (
                <Linea key={l.concepto} label={l.concepto} value={formatCRC(l.monto)} muted />
              ))}
              <div className="my-2 border-t border-slate-100" />
            </>
          )}

          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Rubros
          </p>
          {rubros.map((l) => (
            <Linea
              key={l.concepto}
              label={
                l.dias !== null && l.dias !== undefined
                  ? `${l.concepto} (${l.dias} días)`
                  : l.concepto
              }
              value={formatCRC(l.monto)}
            />
          ))}
          <div className="my-2 border-t border-slate-100" />
          <Linea label="Total bruto" value={formatCRC(pago.montoBruto)} strong />

          {deducciones.length > 0 && (
            <>
              <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Deducciones
              </p>
              {deducciones.map((l) => (
                <Linea key={l.concepto} label={l.concepto} value={`− ${formatCRC(l.monto)}`} />
              ))}
            </>
          )}
          {pago.tipo === 'liquidacion' && (
            <p className="mt-1 text-[11px] text-slate-400">
              Preaviso y cesantía son indemnizaciones y el aguinaldo está exento: no llevan cuota
              obrera.
            </p>
          )}
          {pago.tipo === 'aguinaldo' && (
            <p className="mt-1 text-[11px] text-slate-400">
              El aguinaldo no lleva cargas sociales ni impuesto sobre la renta (Ley 2412).
            </p>
          )}

          <div className="my-2 border-t border-slate-100" />
          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-base font-extrabold text-emerald-800">
            <span>Neto pagado</span>
            <span className="tabular-nums">{formatCRC(pago.montoNeto)}</span>
          </div>
        </div>

        <div className="mt-6 flex items-baseline justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
          <span>Código de verificación</span>
          <span className="font-mono text-xs font-semibold tracking-wider text-slate-700">
            {pago.codigoVerificacion}
          </span>
        </div>

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
