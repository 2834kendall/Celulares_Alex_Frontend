'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Calculator, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  procesarLiquidacionSchema,
  type ContratoPorLiquidarItem,
  type LiquidacionCalculada,
  type LiquidacionListItem,
  type ProcesarLiquidacionInput,
} from '@/modules/payroll/types'
import { formatCRC, formatDate } from '@/modules/payroll/lib/format'
import { DesgloseLiquidacionView } from './DesgloseLiquidacionView'
import { MOTIVO_MUTUO_ACUERDO, TIPOS_CONTRATO_ART_31 } from '@/modules/payroll/lib/liquidacion'
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

/**
 * Calcula y guarda la liquidación de un contrato que RRHH ya terminó desde
 * el perfil del empleado (SGRH-90). La fecha de salida y el motivo vienen de
 * esa terminación y acá solo se muestran.
 *
 * Son dos pasos: Calcular muestra una vista previa (desglose y avisos) sin
 * guardar nada, y recién después se guarda. Guardar es definitivo: no se
 * puede deshacer desde acá ni volver a procesar el mismo contrato, y por eso
 * pide confirmación. Antes se calculaba y guardaba con un solo botón, y un
 * día de vacaciones mal digitado ya no tenía arreglo.
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
  // Liquidación ya guardada (con su número), para mostrarla después de guardar.
  const [resultado, setResultado] = useState<LiquidacionCalculada | null>(null)
  // Cálculo sin guardar y los valores con que se hizo.
  const [vistaPrevia, setVistaPrevia] = useState<{
    valores: ProcesarLiquidacionInput
    datos: LiquidacionCalculada
  } | null>(null)
  const [calculando, setCalculando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
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
      plazoSeisMesesOMas: null,
    },
  })

  const contratoElegidoId = watch('historialLaboralId')
  const diasVacaciones = watch('diasVacacionesPendientes')
  const cesantiaPactada = watch('cesantiaPactada')
  const plazoSeisMesesOMas = watch('plazoSeisMesesOMas')

  // Si cambia cualquier dato después de calcular, la vista previa ya no es
  // la de esos datos: se descarta y hay que volver a calcular.
  useEffect(() => {
    setVistaPrevia((previa) =>
      previa &&
      (previa.valores.historialLaboralId !== contratoElegidoId ||
        previa.valores.diasVacacionesPendientes !== diasVacaciones ||
        (previa.valores.cesantiaPactada ?? null) !== (cesantiaPactada ?? null) ||
        (previa.valores.plazoSeisMesesOMas ?? null) !== (plazoSeisMesesOMas ?? null))
        ? null
        : previa
    )
  }, [contratoElegidoId, diasVacaciones, cesantiaPactada, plazoSeisMesesOMas])
  const contratoElegido = contratos.find((c) => c.historialLaboralId === contratoElegidoId)
  const esMutuoAcuerdo = contratoElegido?.motivo?.codigo === MOTIVO_MUTUO_ACUERDO
  // Contrato a plazo fijo (u obra determinada) terminado por el patrono: Art. 31.
  const esPlazoFijoArt31 =
    !!contratoElegido?.tipoContrato &&
    TIPOS_CONTRATO_ART_31.has(contratoElegido.tipoContrato.codigo) &&
    contratoElegido.motivo?.generaPreaviso === true

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

  async function calcular(valores: ProcesarLiquidacionInput) {
    if (calculando || guardando) return
    setCalculando(true)
    setServerError(null)
    setResultado(null)
    setVistaPrevia(null)
    try {
      const result = await procesarLiquidacion(valores, { soloCalcular: true })
      if (!result.ok) {
        setServerError(result.error)
        return
      }
      setVistaPrevia({ valores, datos: result.data })
    } catch {
      setServerError('No se pudo calcular la liquidación. Intentá de nuevo.')
    } finally {
      setCalculando(false)
    }
  }

  async function guardarConfirmado() {
    // ConfirmDialog no deshabilita su botón mientras espera: sin esto, un
    // doble clic mandaría dos veces la misma liquidación.
    if (!vistaPrevia || guardando) return
    setGuardando(true)
    setServerError(null)
    let result
    try {
      result = await procesarLiquidacion(vistaPrevia.valores, {
        netoEsperado: vistaPrevia.datos.neto,
      })
    } catch {
      result = {
        ok: false as const,
        error: 'No se pudo guardar la liquidación. Revisá el historial antes de reintentar.',
      }
    }
    setGuardando(false)
    setConfirmando(false)

    if (!result.ok) {
      setServerError(result.error)
      setVistaPrevia(null)
      return
    }

    setVistaPrevia(null)
    setResultado(result.data)
    toast.success('Liquidación guardada. Pagala desde el historial cuando se entregue.')
    // Sin el historialLaboralId explícito, reset() volvería al preseleccionado
    // de la URL: el contrato que se acaba de liquidar.
    reset({
      historialLaboralId: undefined,
      diasVacacionesPendientes: 0,
      cesantiaPactada: null,
      plazoSeisMesesOMas: null,
    })
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
            if (esPlazoFijoArt31 && !values.plazoSeisMesesOMas) {
              setError('plazoSeisMesesOMas', {
                message: 'Indicá si el contrato se pactó por seis meses o más.',
              })
              return
            }
            // Fuera del mutuo acuerdo la cesantía la dice el catálogo: una
            // respuesta que quedó marcada de otro contrato no viaja.
            void calcular({
              ...values,
              cesantiaPactada: esMutuoAcuerdo ? values.cesantiaPactada : null,
              plazoSeisMesesOMas: esPlazoFijoArt31 ? values.plazoSeisMesesOMas : null,
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
              disabled={guardando || calculando}
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
              {esPlazoFijoArt31 && (
                <p className="col-span-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-amber-800">
                  {contratoElegido.tipoContrato?.nombre}: por ser terminado por el patrono no lleva
                  preaviso ni cesantía, sino la indemnización del Art. 31 del Código de Trabajo (un
                  día de salario por cada siete trabajados; mínimo 3 días, o 22 si se pactó por seis
                  meses o más).
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
                    disabled={guardando || calculando}
                    {...register('cesantiaPactada')}
                  />
                  Sí, se paga cesantía
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value="no"
                    disabled={guardando || calculando}
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

          {esPlazoFijoArt31 && (
            <fieldset>
              <legend className={LABEL}>¿El contrato se pactó por seis meses o más?</legend>
              <div className="flex gap-4 text-xs text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value="si"
                    disabled={guardando || calculando}
                    {...register('plazoSeisMesesOMas')}
                  />
                  Sí, seis meses o más
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    value="no"
                    disabled={guardando || calculando}
                    {...register('plazoSeisMesesOMas')}
                  />
                  Menos de seis meses
                </label>
              </div>
              <p className="mt-1 text-[11px] text-slate-400">
                Si la obra por su naturaleza debía durar seis meses o más, también es «sí».
              </p>
              {errors.plazoSeisMesesOMas && (
                <p className="mt-1 text-[11px] text-rose-600">
                  {errors.plazoSeisMesesOMas.message}
                </p>
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
              disabled={guardando || calculando}
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

          <Button
            type="submit"
            variant={vistaPrevia ? 'secondary' : 'primary'}
            disabled={guardando || calculando}
            size="lg"
            block
          >
            {calculando ? (
              <>
                <Loader2 className={SPINNER} /> Calculando
              </>
            ) : (
              <>
                <Calculator className="h-3.5 w-3.5" />{' '}
                {vistaPrevia ? 'Volver a calcular' : 'Calcular liquidación'}
              </>
            )}
          </Button>
          <p className="text-center text-[11px] text-slate-400">
            Calcular no guarda nada: primero revisás el desglose y después lo guardás.
          </p>
        </form>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          {vistaPrevia ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Vista previa
                </p>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                  Todavía no se guardó
                </span>
              </div>
              <DesgloseLiquidacionView datos={vistaPrevia.datos} />
              <Button onClick={() => setConfirmando(true)} disabled={guardando} size="lg" block>
                {guardando ? (
                  <>
                    <Loader2 className={SPINNER} /> Guardando
                  </>
                ) : (
                  <>
                    <Save className="h-3.5 w-3.5" /> Guardar liquidación
                  </>
                )}
              </Button>
            </div>
          ) : resultado ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  Liquidación guardada
                </p>
                {resultado.liqId !== null && (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
                    n.° {resultado.liqId}
                  </span>
                )}
              </div>
              <DesgloseLiquidacionView datos={resultado} />
              <p className="text-[11px] text-slate-500">
                Quedó en el historial como pendiente de pago. Se paga desde ahí cuando se entregue.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Resultado
              </p>
              <p className="text-xs text-slate-400">
                Elegí el contrato y tocá Calcular: el desglose aparece acá antes de guardar.
              </p>
            </>
          )}
        </div>
      </div>

      <LiquidacionesHistorial items={historial} canWrite />

      {confirmando && vistaPrevia && (
        <ConfirmDialog
          title="Guardar liquidación"
          message={`Se va a guardar la liquidación de ${
            contratos.find((c) => c.historialLaboralId === vistaPrevia.valores.historialLaboralId)
              ?.nombre ?? 'este empleado'
          } por ${formatCRC(vistaPrevia.datos.neto)} netos y se borrarán sus turnos posteriores a la salida. No se puede deshacer.`}
          confirmLabel="Guardar liquidación"
          onCancel={() => setConfirmando(false)}
          onConfirm={() => void guardarConfirmado()}
        />
      )}
    </div>
  )
}
