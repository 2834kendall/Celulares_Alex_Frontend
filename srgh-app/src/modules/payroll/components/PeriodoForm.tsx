'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  crearPeriodoSchema,
  type CatalogoItem,
  type CrearPeriodoInput,
} from '@/modules/payroll/types'
import { createPeriodo } from '@/modules/payroll/actions/createPeriodo'
import { MESES } from '@/modules/payroll/lib/format'
import { rangoQuincena } from '@/modules/payroll/lib/fechas'
import { Button } from '@/components/ui/Button'
import { INPUT, LABEL, SPINNER } from '@/components/ui/styles'
import { ControlledDateField } from '@/components/ui/ControlledDateField'
import { ControlledSelectMenu, parseNumber } from '@/components/ui/SelectMenu'

const ERROR_CLASSES = 'mt-1 text-[11px] font-medium text-rose-600'

const BORRAR_FECHA =
  'rounded text-[11px] font-semibold text-slate-500 outline-none transition hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500/60'

interface PeriodoFormProps {
  sucursales: CatalogoItem[]
}

/** Alta de un periodo de planilla (nace en estado 'borrador'). */
export function PeriodoForm({ sucursales }: PeriodoFormProps) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const hoy = new Date()
  const mesInicial = hoy.getMonth() + 1
  const anioInicial = hoy.getFullYear()
  const quincenaInicial = hoy.getDate() <= 15 ? 1 : 2
  const rangoInicial = rangoQuincena(mesInicial, anioInicial, quincenaInicial)

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CrearPeriodoInput>({
    resolver: zodResolver(crearPeriodoSchema) as Resolver<CrearPeriodoInput>,
    mode: 'onTouched',
    defaultValues: {
      npe_periodo_mes: mesInicial,
      npe_periodo_anio: anioInicial,
      npe_quincena: quincenaInicial,
      npe_fecha_inicio_periodo: rangoInicial?.inicio ?? null,
      npe_fecha_fin_periodo: rangoInicial?.fin ?? null,
      npe_observaciones: '',
    },
  })

  const mes = watch('npe_periodo_mes')
  const anio = watch('npe_periodo_anio')
  const quincena = watch('npe_quincena')
  const fechaInicio = watch('npe_fecha_inicio_periodo')
  const fechaFin = watch('npe_fecha_fin_periodo')

  // Al cambiar mes, año o quincena, las fechas se vuelven a llenar con las que
  // le corresponden a esa quincena. Es una sugerencia, no una imposición:
  // quedan editables y se pueden borrar con el botón de al lado.
  //
  // La dependencia es la clave armada como texto y no el objeto del rango, que
  // se construye nuevo en cada render y dispararía el efecto para siempre.
  const claveQuincena = `${anio}-${mes}-${quincena}`
  useEffect(() => {
    const [a, m, q] = claveQuincena.split('-').map(Number)
    const rango = rangoQuincena(m, a, q)
    if (!rango) return
    setValue('npe_fecha_inicio_periodo', rango.inicio, { shouldValidate: true })
    setValue('npe_fecha_fin_periodo', rango.fin, { shouldValidate: true })
  }, [claveQuincena, setValue])

  const sinFechas = !fechaInicio && !fechaFin

  /** Deja el campo en blanco para que el encargado escriba la fecha que quiera. */
  function borrarFecha(campo: 'npe_fecha_inicio_periodo' | 'npe_fecha_fin_periodo') {
    setValue(campo, null, { shouldValidate: true, shouldDirty: true })
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await createPeriodo(values)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    // El periodo ya existe pase lo que pase; lo que puede fallar es la carga
    // de los empleados, y eso se avisa sin tratarlo como un error de creación.
    if (result.avisoCarga) {
      toast.warning(`Periodo creado, pero no se cargaron los empleados: ${result.avisoCarga}`)
    } else if (result.empleadosCargados === 0) {
      toast.success('Periodo de nómina creado.')
    } else {
      const sinHorario =
        result.sinAsistencia > 0
          ? ` ${result.sinAsistencia} sin horario programado: quedaron con la jornada completa supuesta, revisalos.`
          : ''
      toast.success(
        `Periodo creado con ${result.empleadosCargados} empleado(s) y sus horas de asistencia.${sinHorario}`
      )
    }

    router.push(`/payroll/${result.periodoId}`)
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {serverError && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <p>{serverError}</p>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="npe_sucursal_id" className={LABEL}>
              Sucursal
            </label>
            <ControlledSelectMenu
              control={control}
              name="npe_sucursal_id"
              id="npe_sucursal_id"
              parse={parseNumber}
              placeholder="Selecciona una sucursal"
              invalid={!!errors.npe_sucursal_id}
              options={sucursales.map((s) => ({ value: String(s.id), label: s.nombre }))}
            />
            {errors.npe_sucursal_id && (
              <p className={ERROR_CLASSES}>{errors.npe_sucursal_id.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_periodo_mes" className={LABEL}>
              Mes
            </label>
            <ControlledSelectMenu
              control={control}
              name="npe_periodo_mes"
              id="npe_periodo_mes"
              parse={parseNumber}
              invalid={!!errors.npe_periodo_mes}
              options={MESES.map((mes, index) => ({ value: String(index + 1), label: mes }))}
            />
            {errors.npe_periodo_mes && (
              <p className={ERROR_CLASSES}>{errors.npe_periodo_mes.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_periodo_anio" className={LABEL}>
              Año
            </label>
            <input
              id="npe_periodo_anio"
              type="number"
              {...register('npe_periodo_anio', { valueAsNumber: true })}
              className={INPUT}
            />
            {errors.npe_periodo_anio && (
              <p className={ERROR_CLASSES}>{errors.npe_periodo_anio.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="npe_quincena" className={LABEL}>
              Quincena
            </label>
            <ControlledSelectMenu
              control={control}
              name="npe_quincena"
              id="npe_quincena"
              parse={parseNumber}
              invalid={!!errors.npe_quincena}
              options={[
                { value: '1', label: '1ª quincena' },
                { value: '2', label: '2ª quincena' },
              ]}
            />
            {errors.npe_quincena && <p className={ERROR_CLASSES}>{errors.npe_quincena.message}</p>}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="npe_fecha_inicio_periodo" className={LABEL}>
                Inicio del periodo
              </label>
              {fechaInicio && (
                <button
                  type="button"
                  onClick={() => borrarFecha('npe_fecha_inicio_periodo')}
                  className={BORRAR_FECHA}
                >
                  Borrar
                </button>
              )}
            </div>
            <ControlledDateField
              control={control}
              name="npe_fecha_inicio_periodo"
              id="npe_fecha_inicio_periodo"
              label="Inicio del periodo"
              invalid={!!errors.npe_fecha_inicio_periodo}
            />
            {errors.npe_fecha_inicio_periodo && (
              <p className={ERROR_CLASSES}>{errors.npe_fecha_inicio_periodo.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-2">
              <label htmlFor="npe_fecha_fin_periodo" className={LABEL}>
                Fin del periodo
              </label>
              {fechaFin && (
                <button
                  type="button"
                  onClick={() => borrarFecha('npe_fecha_fin_periodo')}
                  className={BORRAR_FECHA}
                >
                  Borrar
                </button>
              )}
            </div>
            <ControlledDateField
              control={control}
              name="npe_fecha_fin_periodo"
              id="npe_fecha_fin_periodo"
              label="Fin del periodo"
              invalid={!!errors.npe_fecha_fin_periodo}
            />
            {errors.npe_fecha_fin_periodo && (
              <p className={ERROR_CLASSES}>{errors.npe_fecha_fin_periodo.message}</p>
            )}
          </div>

          {/*
            Las fechas son opcionales, pero de ellas salen las horas: sin
            rango, getHorasDelPeriodo no tiene qué leer de las marcas de
            asistencia y el periodo se queda sin horas calculadas y sin el
            bloqueo de pago por marcas incompletas. Mejor decirlo acá que
            descubrirlo a la hora de pagar.
          */}
          <div className="sm:col-span-2">
            {sinFechas ? (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                <p>
                  Sin fechas, el periodo no puede leer las marcas de asistencia: no va a calcular
                  horas ni va a avisar si alguien tiene marcas incompletas. Podés guardarlo así y
                  ponerlas después.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">
                Se llenan solas con el mes y la quincena. Cambialas o borralas si esta quincena va
                de otras fechas.
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label htmlFor="npe_observaciones" className={LABEL}>
              Observaciones <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <textarea
              id="npe_observaciones"
              rows={3}
              {...register('npe_observaciones')}
              className={INPUT}
              placeholder="Notas internas del periodo…"
            />
            {errors.npe_observaciones && (
              <p className={ERROR_CLASSES}>{errors.npe_observaciones.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => router.push('/payroll')}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
        >
          Cancelar
        </button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className={SPINNER} />}
          Crear periodo
        </Button>
      </div>
    </form>
  )
}
