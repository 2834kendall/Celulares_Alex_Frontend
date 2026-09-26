'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import {
  AlertTriangle,
  CalendarOff,
  CheckCircle2,
  Coffee,
  Loader2,
  LogIn,
  LogOut,
  RotateCcw,
  ScanFace,
  UserX,
  UtensilsCrossed,
  WifiOff,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ActiveEmployeeOption } from '@/modules/attendance/actions/getActiveEmployees'
import { verifyFace } from '@/modules/attendance/actions/verifyFace'
import { getKioskMarkOptions } from '@/modules/attendance/actions/getKioskMarkOptions'
import { MARK_LABELS, MARK_TYPES, type MarkType } from '@/modules/attendance/lib/marks'
import type { EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import { getCurrentCoordinates } from '@/modules/attendance/components/kiosk/geolocation'
import { getOrCreateDeviceId } from '@/modules/attendance/components/kiosk/deviceId'
import { useOfflineSync } from '@/modules/attendance/components/kiosk/useOfflineSync'
import { FaceScan } from '@/modules/attendance/components/kiosk/face/FaceScan'
import { FORMATO_HORA_DEFAULT, type FormatoHora } from '@/lib/time/formatoHora'

interface KioskScreenProps {
  /** Quienes tienen turno hoy en esta sucursal: solo se usa para saber si hay alguien. */
  employees: ActiveEmployeeOption[]
  /** Formato de hora de la empresa. El kiosco no monta el shell, así que llega por prop. */
  formatoHora?: FormatoHora
}

const SUCCESS_DISPLAY_MS = 3000
const FAILURE_DISPLAY_MS = 8000

type IconComponent = ComponentType<{ className?: string }>

const MARK_ICONS: Record<MarkType, IconComponent> = {
  entrada: LogIn,
  inicio_receso: Coffee,
  fin_receso: Coffee,
  inicio_almuerzo: UtensilsCrossed,
  fin_almuerzo: UtensilsCrossed,
  salida: LogOut,
}

/** Identidad confirmada por verifyFace: nombre + ticket que prueba el rostro. */
interface FaceVerified {
  employeeId: number
  fullName: string
  ticket: string
}

/** Por que no se pudo marcar, dicho para quien esta frente a la tablet. */
interface Failure {
  titulo: string
  detalle: string
}

const AVISA_AL_ENCARGADO =
  'Si trabajas aqui, avisa al encargado para que registre tu marca desde el panel.'

const FAILURES = {
  noReconocido: {
    titulo: 'No te reconocimos',
    detalle: `No encontramos coincidencia con el personal de esta sucursal. ${AVISA_AL_ENCARGADO}`,
  },
  dudoso: {
    titulo: 'No pudimos confirmar tu identidad',
    detalle:
      'Mira de frente a la camara, con buena luz y sin nada que tape tu cara, e intenta de nuevo.',
  },
  foto: {
    titulo: 'Necesitamos a la persona',
    detalle:
      'La camara esta viendo una imagen, no a una persona. Marca mirando directo a la camara.',
  },
} satisfies Record<string, Failure>

/**
 * Hora y fecha de Costa Rica, sin depender de la zona horaria de la tablet.
 *
 * `hour12` explícito según la preferencia de la empresa. Antes no se pasaba y
 * el reloj salía en 12h por accidente — es el default del locale es-CR —
 * mientras el resto del sistema mostraba 24h. Con el formato explícito, el
 * reloj y las marcas que registra el kiosco se leen igual; la salida de Intl
 * coincide carácter por carácter con formatHora() en ambos formatos.
 */
function formatClock(date: Date, formato: FormatoHora) {
  const hora = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    hour: 'numeric',
    minute: '2-digit',
    hour12: formato === '12h',
  }).format(date)
  const fecha = new Intl.DateTimeFormat('es-CR', {
    timeZone: 'America/Costa_Rica',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
  return { hora, fecha: fecha.charAt(0).toUpperCase() + fecha.slice(1) }
}

/**
 * Reloj que se actualiza solo. Arranca en null y se llena en el cliente: el
 * servidor no conoce la hora del momento en que la pantalla se ve, y pintar la
 * suya generaria un desfase de hidratacion.
 */
function useClock() {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    // setTimeout(0) y no tick() directo: mismo motivo que en useOfflineSync,
    // el linter marca un setState sincronico dentro del cuerpo del efecto.
    const first = setTimeout(tick, 0)
    const interval = setInterval(tick, 15_000)
    return () => {
      clearTimeout(first)
      clearInterval(interval)
    }
  }, [])

  return now
}

/**
 * Kiosco compartido de sucursal: los empleados NO inician sesion, solo la
 * cuenta KIOSCO tiene sesion (permanente en la tablet).
 *
 * Solo Face ID (SGRH-88, decision del cliente). No hay PIN ni selector de
 * nombre: si el rostro no se reconoce, o la tablet no tiene internet (la
 * verificacion necesita al servidor, los vectores nunca bajan al dispositivo),
 * no se puede marcar aca — el kiosco pide avisar al encargado, que registra la
 * marca manual desde el panel diario con su justificacion. Asi nadie puede
 * marcar por otro.
 *
 * Despues de reconocer a la persona, solo muestra las marcas que le
 * corresponden segun lo que ya marco hoy (ver allowedNextMarks).
 *
 * Diseño: superficie blanca con acento azul fijo, independiente del color de
 * la sucursal — es una pantalla de uso rapido para todo el personal, y el azul
 * se lee igual en cualquier tienda. Responsive de telefono a tablet acostada:
 * el contenido se centra con `my-auto` (no `justify-center`) para que en un
 * telefono horizontal, con 375px de alto, se pueda desplazar en vez de
 * quedar cortado arriba.
 */
export function KioskScreen({ employees, formatoHora = FORMATO_HORA_DEFAULT }: KioskScreenProps) {
  const [verified, setVerified] = useState<FaceVerified | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [successLabel, setSuccessLabel] = useState<string | null>(null)
  const [submittingTipo, setSubmittingTipo] = useState<MarkType | null>(null)
  // Marcas que corresponden ahora a la persona reconocida. null mientras no
  // se sabe (si fallo la red al preguntar): en ese caso se muestran todas y
  // el servidor valida la secuencia.
  const [allowed, setAllowed] = useState<MarkType[] | null>(null)
  const [optionsError, setOptionsError] = useState<string | null>(null)
  const [loadingOptions, setLoadingOptions] = useState(false)
  // Numero de la ultima consulta: si la persona cambia antes de que vuelva la
  // respuesta anterior, esa respuesta vieja se descarta.
  const optionsRequest = useRef(0)

  const { isOnline, pendingCount, discardedCount, submitMark } = useOfflineSync()
  const now = useClock()

  const faceConfigured = Boolean(process.env.NEXT_PUBLIC_FACE_VECTOR_KEY)

  const reset = useCallback(() => {
    optionsRequest.current += 1
    setVerified(null)
    setVerifying(false)
    setFailure(null)
    setSuccessLabel(null)
    setSubmittingTipo(null)
    setAllowed(null)
    setOptionsError(null)
    setLoadingOptions(false)
  }, [])

  const fetchOptions = useCallback(async (targetId: number) => {
    const request = ++optionsRequest.current
    setLoadingOptions(true)
    setOptionsError(null)

    try {
      const result = await getKioskMarkOptions(targetId)
      if (request !== optionsRequest.current) return

      if (result.ok) {
        setAllowed(result.allowed)
      } else {
        setAllowed([])
        setOptionsError(result.error)
      }
    } catch {
      if (request === optionsRequest.current) setAllowed(null)
    } finally {
      if (request === optionsRequest.current) setLoadingOptions(false)
    }
  }, [])

  useEffect(() => {
    if (!successLabel) return
    const timeout = setTimeout(reset, SUCCESS_DISPLAY_MS)
    return () => clearTimeout(timeout)
  }, [successLabel, reset])

  useEffect(() => {
    if (!failure) return
    const timeout = setTimeout(reset, FAILURE_DISPLAY_MS)
    return () => clearTimeout(timeout)
  }, [failure, reset])

  const handleFaceEmbedding = useCallback(
    async (payload: EncryptedVector) => {
      setVerifying(true)

      try {
        const result = await verifyFace({
          vector: payload,
          dispositivoId: getOrCreateDeviceId() || null,
        })

        if (!result.ok) {
          setFailure({
            titulo: 'No pudimos verificarte',
            detalle: `${result.error} ${AVISA_AL_ENCARGADO}`,
          })
          return
        }

        if (result.status === 'MATCH') {
          setVerified({
            employeeId: result.employeeId,
            fullName: result.fullName,
            ticket: result.ticket,
          })
          void fetchOptions(result.employeeId)
          return
        }

        // REQUIRE_PIN conserva su nombre en verifyFace, pero ya no hay PIN:
        // es la zona de duda, se ofrece reintentar.
        setFailure(result.status === 'DENIED' ? FAILURES.noReconocido : FAILURES.dudoso)
      } finally {
        setVerifying(false)
      }
    },
    [fetchOptions]
  )

  const handleFaceUnavailable = useCallback((reason: string) => {
    setFailure({
      titulo: 'La camara no esta disponible',
      detalle: `${reason} ${AVISA_AL_ENCARGADO}`,
    })
  }, [])

  // Superficie plana en vez de rostro: se rechaza en el cliente, sin gastar
  // una consulta al servidor.
  const handleFaceSpoof = useCallback(() => {
    setFailure(FAILURES.foto)
  }, [])

  async function handleMark(tipo: MarkType) {
    if (!verified || submittingTipo) return

    setSubmittingTipo(tipo)
    const coords = await getCurrentCoordinates()

    const outcome = await submitMark({
      employeeId: verified.employeeId,
      tipo,
      latitud: coords?.latitud ?? null,
      longitud: coords?.longitud ?? null,
      dispositivoId: getOrCreateDeviceId() || null,
      ticketFacial: verified.ticket,
    })

    setSubmittingTipo(null)

    if (outcome.queued) {
      toast.success('Marca guardada. Se enviara al servidor cuando regrese el internet.')
      setSuccessLabel(`${MARK_LABELS[tipo]} registrada`)
      return
    }

    if (!outcome.result.ok) {
      toast.error(outcome.result.error)
      // Lo mas probable es que la jornada cambio en el medio: se vuelve a
      // preguntar para no dejar botones viejos.
      void fetchOptions(verified.employeeId)
      return
    }

    setSuccessLabel(`${MARK_LABELS[tipo]} registrada`)
  }

  const clock = now ? formatClock(now, formatoHora) : null
  const visibleMarks: MarkType[] = allowed ?? [...MARK_TYPES]

  /**
   * El contenido de la tarjeta segun el momento. Se LLAMA (`renderBody()`),
   * no se monta como `<Componente />`: un componente definido dentro del
   * render seria uno nuevo en cada render, y React desmontaria y volveria a
   * montar la camara cada vez.
   */
  function renderBody() {
    if (employees.length === 0) {
      return (
        <StatusPanel
          icon={CalendarOff}
          tone="slate"
          titulo="Hoy no hay turnos en esta sucursal"
          detalle="Si deberias estar trabajando, avisa al encargado para que revise la programacion."
        />
      )
    }

    if (successLabel) {
      return (
        <StatusPanel
          icon={CheckCircle2}
          tone="emerald"
          titulo={successLabel}
          detalle={verified?.fullName ?? ''}
        />
      )
    }

    if (failure) {
      return (
        <StatusPanel icon={UserX} tone="rose" titulo={failure.titulo} detalle={failure.detalle}>
          <PrimaryButton onClick={reset} icon={RotateCcw}>
            Intentar de nuevo
          </PrimaryButton>
        </StatusPanel>
      )
    }

    // Sin red no hay Face ID, pero si la persona ya fue reconocida (se corto
    // la red despues) igual puede marcar: la marca se encola con su ticket.
    if (!isOnline && !verified) {
      const pendientes =
        pendingCount > 0
          ? ` Hay ${pendingCount} marca${pendingCount === 1 ? '' : 's'} esperando para enviarse.`
          : ''
      return (
        <StatusPanel
          icon={WifiOff}
          tone="amber"
          titulo="Sin conexion"
          detalle={`El reconocimiento facial necesita internet. ${AVISA_AL_ENCARGADO}${pendientes}`}
        />
      )
    }

    if (!faceConfigured) {
      return (
        <StatusPanel
          icon={AlertTriangle}
          tone="amber"
          titulo="Face ID no esta configurado"
          detalle="Este kiosco no puede marcar asistencia hasta que se configure el reconocimiento facial. Avisa al encargado."
        />
      )
    }

    if (verified) {
      return (
        <div className="flex flex-col items-center gap-5 text-center">
          <div>
            <p className="text-sm font-medium text-slate-500">Hola,</p>
            <p className="break-words text-2xl font-bold text-blue-900 sm:text-3xl">
              {verified.fullName}
            </p>
          </div>

          {loadingOptions ? (
            <p className="flex items-center gap-2 text-base text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Revisando tus marcas de hoy…
            </p>
          ) : optionsError ? (
            <p className="max-w-sm text-base font-medium text-amber-800">{optionsError}</p>
          ) : visibleMarks.length === 0 ? (
            <p className="text-lg font-medium text-slate-600">Ya registraste tu salida de hoy.</p>
          ) : (
            // Una sola opcion (lo normal: "Entrada", o el cierre de un
            // periodo abierto) ocupa todo el ancho. Varias van en una columna
            // en telefono y de a dos desde 640px.
            <div
              className={`grid w-full gap-3 ${visibleMarks.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}
            >
              {visibleMarks.map((tipo) => {
                const Icon = MARK_ICONS[tipo]
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => handleMark(tipo)}
                    disabled={submittingTipo !== null}
                    className="flex min-h-16 items-center justify-center gap-3 rounded-2xl bg-blue-600 px-4 text-lg font-semibold text-white shadow-md shadow-blue-600/20 outline-none transition hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-blue-300 active:scale-[0.98] disabled:opacity-60 motion-reduce:active:scale-100 sm:min-h-24 sm:text-xl"
                  >
                    {submittingTipo === tipo ? (
                      <Loader2 className="h-6 w-6 shrink-0 animate-spin" />
                    ) : (
                      <Icon className="h-6 w-6 shrink-0" />
                    )}
                    {submittingTipo === tipo ? 'Marcando…' : MARK_LABELS[tipo]}
                  </button>
                )
              })}
            </div>
          )}

          <button
            type="button"
            onClick={reset}
            disabled={submittingTipo !== null}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium text-slate-500 outline-none transition hover:bg-blue-50 hover:text-blue-800 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-50"
          >
            <ScanFace className="h-4 w-4" /> No soy yo
          </button>
        </div>
      )
    }

    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <div>
          <p className="text-xl font-bold text-slate-900 sm:text-2xl">Mira a la camara</p>
          <p className="mt-1 text-sm text-slate-500 sm:text-base">
            {verifying ? 'Verificando tu rostro…' : 'Te reconocemos en un momento.'}
          </p>
        </div>
        <FaceScan
          onEmbedding={handleFaceEmbedding}
          onUnavailable={handleFaceUnavailable}
          onSpoof={handleFaceSpoof}
        />
      </div>
    )
  }

  return (
    <div className="my-auto flex w-full max-w-md flex-col items-center gap-5 sm:max-w-lg sm:gap-6 lg:max-w-xl">
      {/* Reloj grande: es lo primero que se mira al marcar. */}
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          Control de asistencia
        </p>
        <p className="mt-1 text-4xl font-bold tabular-nums tracking-tight text-slate-900 sm:text-5xl">
          {clock?.hora ?? ' '}
        </p>
        <p className="mt-1 text-sm text-slate-500 sm:text-base">{clock?.fecha ?? ' '}</p>
      </header>

      {discardedCount > 0 && (
        <div className="flex max-w-full items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-center text-sm font-semibold text-rose-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="min-w-0">
            {discardedCount} marca{discardedCount === 1 ? '' : 's'} sin registrar — avisa al
            encargado
          </span>
        </div>
      )}

      <section className="w-full rounded-3xl bg-white p-5 shadow-xl shadow-blue-900/5 ring-1 ring-blue-100 sm:p-7">
        {renderBody()}
      </section>
    </div>
  )
}

const TONES = {
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-400',
} as const

function StatusPanel({
  icon: Icon,
  tone,
  titulo,
  detalle,
  children,
}: {
  icon: IconComponent
  tone: keyof typeof TONES
  titulo: string
  detalle: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center" role="status">
      <span
        className={`flex h-20 w-20 items-center justify-center rounded-full sm:h-24 sm:w-24 ${TONES[tone]}`}
      >
        <Icon className="h-10 w-10 sm:h-12 sm:w-12" />
      </span>
      <div>
        <p className="text-2xl font-bold text-slate-900 sm:text-3xl">{titulo}</p>
        {detalle && <p className="mx-auto mt-2 max-w-sm text-base text-slate-600">{detalle}</p>}
      </div>
      {children}
    </div>
  )
}

function PrimaryButton({
  onClick,
  icon: Icon,
  children,
}: {
  onClick: () => void
  icon: IconComponent
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-blue-600 px-6 text-base font-semibold text-white shadow-md shadow-blue-600/20 outline-none transition hover:bg-blue-700 focus-visible:ring-4 focus-visible:ring-blue-300"
    >
      <Icon className="h-5 w-5" /> {children}
    </button>
  )
}
