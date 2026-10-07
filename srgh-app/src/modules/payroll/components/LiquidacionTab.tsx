'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Receipt } from 'lucide-react'
import { toast } from 'sonner'
import {
  procesarLiquidacionSchema,
  type ContratoPorLiquidarItem,
  type LiquidacionCalculada,
  type LiquidacionListItem,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { MOTIVO_MUTUO_ACUERDO } from '@/modules/payroll/lib/liquidacion'
import { procesarLiquidacion } from '@/modules/payroll/actions/procesarLiquidacion'
import { proponerVacacionesLiquidacion } from '@/modules/payroll/actions/proponerVacacionesLiquidacion'
import type { VacacionesPropuestas } from '@/modules/payroll/lib/derechos'
import { LiquidacionesHistorial } from './LiquidacionesHistorial'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { ControlledSelectMenu, parseNumber } from '@/components/ui/SelectMenu'
import { Alert } from '@/components/ui/Alert'

interface LiquidacionTabProps {
  /** Contratos terminados desde el perfil del empleado y sin liquidar. */
  contratos: ContratoPorLiquidarItem[]
  historial: LiquidacionListItem[]
}

function ResultadoLinea({ label, valor, dias }: { label: string; valor: number; dias?: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-slate-600">
        {label}
        {dias !== undefined && <span className="text-slate-400"> ({dias} días)</span>}
      </span>
      <span className="tabular-nums font-medium text-slate-800">{formatCRC(valor)}</span>
    </div>
  )
}

/**
 * Calcula y guarda la liquidación de un contrato que RRHH ya terminó desde
 * el perfil del empleado (SGRH-90). La fecha de salida y el motivo vienen de
 * esa terminación y acá solo se muestran. Guardar es definitivo: no se puede
 * deshacer desde acá ni volver a procesar el mismo contrato, y por eso pide
 * confirmación.
 */
/**
 * Contrato a preseleccionar desde `?empleado=<lab_id>` (lo manda el tab
 * Contrato del perfil). Solo se acepta si está en la lista de liquidables: un
 * id que no aparece —ya liquidado, fuera del alcance de la RLS o una URL
 * editada a mano— se ignora y el selector queda vacío.
 */
function contratoPreseleccionado(
  param: string | null,
  contratos: ContratoPorLiquidarItem[]
): number | undefined {
  const id = Number(param)
  if (!Number.isInteger(id) || id <= 0) return undefined
  return contratos.some((c) => c.historialLaboralId === id) ? id : undefined
}

export function LiquidacionTab({ contratos, historial }: LiquidacionTabProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<LiquidacionCalculada | null>(null)
  // Valores ya validados esperando la confirmación del ConfirmDialog.
  const [porConfirmar, setPorConfirmar] = useState<ProcesarLiquidacionInput | null>(null)
  const [guardando, setGuardando] = useState(false)

  const [propuesta, setPropuesta] = useState<
    (VacacionesPropuestas & { inicioRelacion: string }) | null
  >(null)
  const [propuestaError, setPropuestaError] = useState<string | null>(null)
  const [proponiendo, setProponiendo] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ProcesarLiquidacionInput>({
    resolver: zodResolver(procesarLiquidacionSchema),
    defaultValues: {
      historialLaboralId: contratoPreseleccionado(searchParams.get('empleado'), contratos),
      diasVacacionesPendientes: 0,
      cesantiaPactada: null,
    },
  })

  const contratoElegidoId = watch('historialLaboralId')
  const contratoElegido = contratos.find((c) => c.historialLaboralId === contratoElegidoId)
  const esMutuoAcuerdo = contratoElegido?.motivo?.codigo === MOTIVO_MUTUO_ACUERDO

  // Con un contrato elegido, el sistema propone los días de vacaciones (1 por
  // mes laborado menos los tomados en Ausencias) y los pone en el campo.
  // Quien liquida los puede corregir; si cambia el contrato, se vuelve a
  // proponer.
  useEffect(() => {
    if (!contratoElegidoId) {
      setPropuesta(null)
      setPropuestaError(null)
      setProponiendo(false)
      return
    }
    let vigente = true
    setProponiendo(true)
    proponerVacacionesLiquidacion(contratoElegidoId)
      .then((r) => {
        if (!vigente) return
        setProponiendo(false)
        if (!r.ok) {
          setPropuesta(null)
          setPropuestaError(r.error)
          return
        }
        setPropuestaError(null)
        setPropuesta(r.data)
        setValue('diasVacacionesPendientes', r.data.diasPendientes, { shouldValidate: true })
      })
      .catch(() => {
        if (!vigente) return
        setProponiendo(false)
        setPropuesta(null)
        setPropuestaError('No se pudo calcular la propuesta: ingresá los días a mano.')
      })
    return () => {
      vigente = false
    }
  }, [contratoElegidoId, setValue])

  async function guardarConfirmado() {
    // ConfirmDialog no deshabilita su botón mientras espera: sin esto, un
    // doble clic mandaría dos veces la misma liquidación.
    if (!porConfirmar || guardando) return
    setGuardando(true)
    setServerError(null)
    setResultado(null)
    const result = await procesarLiquidacion(porConfirmar)
    setGuardando(false)
    setPorConfirmar(null)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    setResultado(result.data)
    toast.success('Liquidación calculada y guardada. Pagala desde el historial cuando se entregue.')
    // Sin el historialLaboralId explícito, reset() volvería al preseleccionado
    // de la URL: el contrato que se acaba de liquidar.
    reset({ historialLaboralId: undefined, diasVacacionesPendientes: 0, cesantiaPactada: null })
    setPropuesta(null)
    router.refresh()
  }

  if (contratos.length === 0) {
    return (
      <div className="space-y-4">
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
          No hay contratos pendientes de liquidar. Los contratos se terminan desde el perfil del
          empleado.
        </p>
        <LiquidacionesHistorial items={historial} canWrite />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          onSubmit={handleSubmit((values) => {
            if (esMutuoAcuerdo && !values.cesantiaPactada) {
              setError('cesantiaPactada', { message: 'Indicá si se pactó pagar cesantía.' })
              return
            }
            // Fuera del mutuo acuerdo la cesantía la dice el catálogo: una
            // respuesta que quedó marcada de otro contrato no viaja.
            setPorConfirmar({
              ...values,
              cesantiaPactada: esMutuoAcuerdo ? values.cesantiaPactada : null,
            })
          })}
          className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          noValidate
        >
          {serverError && (
            <Alert>
              <div>{serverError}</div>
            </Alert>
          )}

          <div>
            <label className={LABEL} htmlFor="historialLaboralId">
              Contrato por liquidar
            </label>
            <ControlledSelectMenu
              control={control}
              name="historialLaboralId"
              id="historialLaboralId"
              parse={parseNumber}
              disabled={guardando}
              invalid={!!errors.historialLaboralId}
              placeholder="Elegí un contrato"
              options={contratos.map((c) => ({
                value: String(c.historialLaboralId),
                label: `${c.nombre} — ${c.cedula} · salió el ${formatDate(c.fechaSalida)}`,
              }))}
            />
            {errors.historialLaboralId && (
              <p className="mt-1 text-[11px] text-rose-600">{errors.historialLaboralId.message}</p>
            )}
          </div>

          {/* Fecha y motivo los registró RRHH al terminar el contrato: acá se
              muestran, no se editan. Para corregirlos hay que revertir la
              terminación desde el perfil y volver a terminarlo. */}
          {contratoElegido && (
            <dl className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
              <div>
                <dt className={LABEL}>Último día de trabajo</dt>
                <dd className="text-xs text-slate-700">
                  {formatDate(contratoElegido.fechaSalida)}
                </dd>
              </div>
              <div>
                <dt className={LABEL}>Motivo de salida</dt>
                <dd className="text-xs text-slate-700">{contratoElegido.motivo?.nombre ?? '—'}</dd>
              </div>
              {contratoElegido.motivo && (
                <p className="col-span-2 text-[11px] text-slate-400">
                  {esMutuoAcuerdo
                    ? 'Cesantía solo si se pactó (indicalo abajo). '
                    : contratoElegido.motivo.generaCesantia
                      ? 'Genera cesantía. '
                      : 'No genera cesantía. '}
                  {contratoElegido.motivo.generaPreaviso
                    ? 'Genera preaviso.'
                    : 'No genera preaviso.'}
                  {contratoElegido.motivo.notaLegal && ` ${contratoElegido.motivo.notaLegal}`}
                </p>
              )}
            </dl>
          )}

          {esMutuoAcuerdo && (
            <fieldset>
              <legend className={LABEL}>¿Se pactó pagar cesantía?</legend>
              <div className="flex gap-4 text-xs text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value="si"
                    disabled={guardando}
                    {...register('cesantiaPactada')}
                  />
                  Sí, se paga cesantía
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value="no"
                    disabled={guardando}
                    {...register('cesantiaPactada')}
                  />
                  No se paga
                </label>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                En mutuo acuerdo la ley no obliga a pagarla (Art. 86 CT); se paga si las partes lo
                pactaron.
              </p>
              {errors.cesantiaPactada && (
                <p className="mt-1 text-[11px] text-rose-600">{errors.cesantiaPactada.message}</p>
              )}
            </fieldset>
          )}

          <div>
            <label className={LABEL} htmlFor="diasVacacionesPendientes">
              Días de vacaciones pendientes
            </label>
            <input
              id="diasVacacionesPendientes"
              type="number"
              step="0.5"
              disabled={guardando}
              aria-invalid={!!errors.diasVacacionesPendientes}
              {...register('diasVacacionesPendientes', { valueAsNumber: true })}
              className={INPUT}
            />
            {proponiendo && (
              <p className="mt-1 text-[11px] text-slate-400">Calculando la propuesta…</p>
            )}
            {!proponiendo && propuesta && (
              <p className="mt-1 text-[11px] text-slate-500">
                Propuesta del sistema: {propuesta.diasPendientes} día(s) = {propuesta.diasGanados}{' '}
                ganados (1 por mes laborado desde {formatDate(propuesta.inicioRelacion)}
                {propuesta.diasIncapacidad > 0 &&
                  `, sin contar ${propuesta.diasIncapacidad} día(s) de incapacidad`}
                ) − {propuesta.diasTomados} tomados en Ausencias. Podés corregirlo.
              </p>
            )}
            {!proponiendo && propuestaError && (
              <p className="mt-1 text-[11px] text-amber-700">{propuestaError}</p>
            )}
            {!proponiendo && !propuesta && !propuestaError && (
              <p className="mt-1 text-[11px] text-slate-400">
                Elegí un contrato para que el sistema proponga los días.
              </p>
            )}
            {errors.diasVacacionesPendientes && (
              <p className="mt-1 text-[11px] text-rose-600">
                {errors.diasVacacionesPendientes.message}
              </p>
            )}
          </div>

          <Button type="submit" disabled={guardando} size="lg" block>
            {guardando ? (
              <>
                <Loader2 className={SPINNER} /> Calculando
              </>
            ) : (
              <>
                <Receipt className="h-3.5 w-3.5" /> Calcular y guardar liquidación
              </>
            )}
          </Button>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Resultado
          </p>
          {!resultado ? (
            <p className="text-xs text-slate-400">
              El desglose aparece acá después de calcular una liquidación.
            </p>
          ) : (
            <div>
              {/*
                Lo que el cálculo no pudo resolver solo va PRIMERO: una
                quincena sin pagar o un salario supuesto cambian el monto, y
                quien lee el total tiene que saberlo antes de firmarlo.
              */}
              {resultado.advertencias.length > 0 && (
                <ul className="mb-3 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
                  {resultado.advertencias.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              )}
              <p className="mb-1 text-[11px] text-slate-400">
                Salario diario {formatCRC(resultado.salarioDiario)} · promedio de los últimos seis
                meses sin incapacidades ÷ 30. Vacaciones a{' '}
                {formatCRC(resultado.salarioDiarioVacaciones)} por día · promedio de las últimas 50
                semanas ÷ 30.
              </p>
              <ResultadoLinea
                label="Salario pendiente"
                valor={resultado.salarioProporcional}
                dias={resultado.diasSalarioPendiente}
              />
              <ResultadoLinea
                label="Aguinaldo proporcional"
                valor={resultado.aguinaldoProporcional}
              />
              <ResultadoLinea
                label="Vacaciones no disfrutadas"
                valor={resultado.vacacionesPagadas}
                dias={resultado.diasVacaciones}
              />
              <ResultadoLinea
                label="Preaviso"
                valor={resultado.preaviso}
                dias={resultado.diasPreaviso}
              />
              <ResultadoLinea
                label="Cesantía"
                valor={resultado.cesantia}
                dias={resultado.diasCesantia}
              />
              <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
                <span>Total bruto</span>
                <span className="tabular-nums font-medium">{formatCRC(resultado.total)}</span>
              </div>
              {/*
                Solo cotiza lo que es salario: pendiente y vacaciones. Preaviso
                y cesantía son indemnizaciones; el aguinaldo está exento.
              */}
              <div className="flex items-center justify-between py-1 text-xs text-slate-600">
                <span>
                  Cuota obrera CCSS{' '}
                  <span className="text-slate-400">(sobre salario pendiente y vacaciones)</span>
                </span>
                <span className="tabular-nums font-medium text-rose-700">
                  − {formatCRC(resultado.deduccionesObreras)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                <span>Neto a entregar</span>
                <span className="tabular-nums">{formatCRC(resultado.neto)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <LiquidacionesHistorial items={historial} canWrite />

      {porConfirmar && (
        <ConfirmDialog
          title="Guardar liquidación"
          message={`Se va a guardar la liquidación de ${
            contratos.find((c) => c.historialLaboralId === porConfirmar.historialLaboralId)
              ?.nombre ?? 'este empleado'
          } y se borrarán sus turnos posteriores a la salida. No se puede deshacer.`}
          confirmLabel="Guardar liquidación"
          onCancel={() => setPorConfirmar(null)}
          onConfirm={() => void guardarConfirmado()}
        />
      )}
    </div>
  )
}
