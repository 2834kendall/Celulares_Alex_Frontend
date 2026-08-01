'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, ScanFace, ShieldX, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect'
import type { ActiveEmployeeOption } from '@/modules/attendance/actions/getActiveEmployees'
import { verifyFace } from '@/modules/attendance/actions/verifyFace'
import type { MarkType } from '@/modules/attendance/lib/marks'
import type { EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import { getCurrentCoordinates } from '@/modules/attendance/components/kiosk/geolocation'
import { getOrCreateDeviceId } from '@/modules/attendance/components/kiosk/deviceId'
import { useOfflineSync } from '@/modules/attendance/components/kiosk/useOfflineSync'
import { PinPad } from '@/modules/attendance/components/kiosk/PinPad'
import { FaceScan } from '@/modules/attendance/components/kiosk/face/FaceScan'

interface KioskScreenProps {
  employees: ActiveEmployeeOption[]
}

const MARK_BUTTONS: { tipo: MarkType; label: string }[] = [
  { tipo: 'entrada', label: 'Entrada' },
  { tipo: 'inicio_almuerzo', label: 'Inicio de almuerzo' },
  { tipo: 'fin_almuerzo', label: 'Fin de almuerzo' },
  { tipo: 'salida', label: 'Salida' },
]

const SUCCESS_DISPLAY_MS = 3000
const DENIED_DISPLAY_MS = 4000

/** Identidad confirmada por verifyFace: nombre + ticket para marcar FACIAL. */
interface FaceVerified {
  employeeId: number
  fullName: string
  ticket: string
}

/**
 * Kiosco compartido de sucursal: los empleados NO inician sesion, solo la
 * cuenta KIOSCO tiene sesion (permanente en la tablet).
 *
 * Identificacion en cascada:
 * 1. FACIAL (primario, solo online y con llave configurada): FaceScan captura
 *    el rostro con prueba de vida, el vector viaja cifrado y verifyFace
 *    responde MATCH / REQUIRE_PIN / DENIED.
 * 2. MANUAL con PIN: si la camara fallo, el resultado fue REQUIRE_PIN o el
 *    dispositivo esta offline (la camara se deshabilita de inmediato sin
 *    red), el empleado elige su nombre e ingresa su PIN.
 * El modo legado sin llave facial configurada conserva el selector simple.
 */
export function KioskScreen({ employees }: KioskScreenProps) {
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState<string | null>(null)
  const [showPinPad, setShowPinPad] = useState(false)
  const [submittingTipo, setSubmittingTipo] = useState<MarkType | null>(null)
  const [successLabel, setSuccessLabel] = useState<string | null>(null)
  const [verified, setVerified] = useState<FaceVerified | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [denied, setDenied] = useState(false)

  const { isOnline, pendingCount, submitMark } = useOfflineSync()

  const faceConfigured = Boolean(process.env.NEXT_PUBLIC_FACE_VECTOR_KEY)
  // Sin internet la camara queda deshabilitada DE INMEDIATO: la verificacion
  // facial necesita al servidor (los vectores enrolados nunca bajan al
  // dispositivo), asi que offline el unico respaldo de identidad es el PIN.
  const faceActive = faceConfigured && isOnline && !manualMode && !verified && !denied

  const options: SearchSelectOption[] = employees.map((e) => ({
    value: String(e.employeeId),
    label: e.fullName,
  }))

  const selectedEmployee = employees.find((e) => String(e.employeeId) === employeeId) ?? null

  // En modo manual el PIN es obligatorio siempre que exista biometria real
  // (online cayo desde la camara) u offline (no hay otra verificacion). El
  // modo legado (sin llave configurada, online) conserva el PIN opcional.
  const pinRequired = !isOnline || (faceConfigured && manualMode)
  const readyToMark = pin !== null || !pinRequired
  const pinPadOpen = showPinPad || (pinRequired && selectedEmployee !== null && pin === null)

  useEffect(() => {
    if (!successLabel) return
    const timeout = setTimeout(() => {
      setSuccessLabel(null)
      setEmployeeId('')
      setPin(null)
      setShowPinPad(false)
      setSubmittingTipo(null)
      setVerified(null)
      setManualMode(false)
    }, SUCCESS_DISPLAY_MS)
    return () => clearTimeout(timeout)
  }, [successLabel])

  useEffect(() => {
    if (!denied) return
    const timeout = setTimeout(() => setDenied(false), DENIED_DISPLAY_MS)
    return () => clearTimeout(timeout)
  }, [denied])

  const handleFaceEmbedding = useCallback(async (payload: EncryptedVector) => {
    const result = await verifyFace({
      vector: payload,
      dispositivoId: getOrCreateDeviceId() || null,
    })

    if (!result.ok) {
      toast.error(result.error)
      setManualMode(true)
      return
    }

    if (result.status === 'MATCH') {
      setVerified({
        employeeId: result.employeeId,
        fullName: result.fullName,
        ticket: result.ticket,
      })
      return
    }

    if (result.status === 'DENIED') {
      setDenied(true)
      return
    }

    // REQUIRE_PIN: zona de incertidumbre — verificacion fallida "suave".
    toast.message('No pudimos confirmar tu identidad. Selecciona tu nombre e ingresa tu PIN.')
    setManualMode(true)
  }, [])

  const handleFaceUnavailable = useCallback((reason: string) => {
    toast.message(reason)
    setManualMode(true)
  }, [])

  async function handleMark(tipo: MarkType) {
    const target =
      verified ??
      (selectedEmployee
        ? { employeeId: selectedEmployee.employeeId, fullName: selectedEmployee.fullName }
        : null)
    if (!target || submittingTipo) return
    if (!verified && !readyToMark) return

    setSubmittingTipo(tipo)

    const coords = await getCurrentCoordinates()

    const outcome = await submitMark({
      employeeId: target.employeeId,
      tipo,
      latitud: coords?.latitud ?? null,
      longitud: coords?.longitud ?? null,
      pin: verified ? null : pin,
      dispositivoId: getOrCreateDeviceId() || null,
      ticketFacial: verified?.ticket ?? null,
    })

    setSubmittingTipo(null)

    if (outcome.queued) {
      toast.success('Marca guardada localmente. Se enviará al servidor cuando regrese el internet.')
      const label = MARK_BUTTONS.find((m) => m.tipo === tipo)?.label ?? tipo
      setSuccessLabel(`${label} registrada`)
      return
    }

    if (!outcome.result.ok) {
      toast.error(outcome.result.error)
      return
    }

    const label = MARK_BUTTONS.find((m) => m.tipo === tipo)?.label ?? tipo
    setSuccessLabel(`${label} registrada`)
  }

  const activeFullName = verified?.fullName ?? selectedEmployee?.fullName ?? null

  if (successLabel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <CheckCircle2 className="h-20 w-20 text-emerald-400" />
        <p className="text-2xl font-bold">{successLabel}</p>
        {activeFullName && <p className="text-slate-300">{activeFullName}</p>}
      </div>
    )
  }

  if (denied) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <ShieldX className="h-20 w-20 text-red-400" />
        <p className="text-2xl font-bold">Rostro no reconocido</p>
        <p className="max-w-xs text-sm text-slate-300">
          No se encontro coincidencia con el personal de esta sucursal. El intento quedo registrado.
        </p>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8">
      {!isOnline && (
        <div className="flex items-center gap-2 rounded-full bg-amber-500/15 px-4 py-2 text-xs font-semibold text-amber-300">
          <WifiOff className="h-3.5 w-3.5" />
          Sin conexion — las marcas se guardan en este dispositivo
          {pendingCount > 0 && ` (${pendingCount} pendiente${pendingCount === 1 ? '' : 's'})`}
        </div>
      )}

      <div className="text-center">
        <h1 className="text-2xl font-bold">Control de asistencia</h1>
        <p className="mt-1 text-sm text-slate-300">
          {faceActive ? 'Mira a la camara para marcar' : 'Selecciona tu nombre para marcar'}
        </p>
      </div>

      {faceActive ? (
        <>
          <FaceScan onEmbedding={handleFaceEmbedding} onUnavailable={handleFaceUnavailable} />
          <button
            type="button"
            onClick={() => setManualMode(true)}
            className="flex items-center gap-2 text-sm text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <KeyRound className="h-4 w-4" /> ¿Falló la cámara? Usar PIN
          </button>
        </>
      ) : (
        <>
          {!verified && (
            <div className="w-full">
              <SearchSelect
                options={options}
                value={employeeId}
                onChange={(value) => {
                  setEmployeeId(value)
                  setPin(null)
                }}
                ariaLabel="Selecciona tu nombre"
                className="w-full"
              />
            </div>
          )}

          {faceConfigured && manualMode && isOnline && (
            <button
              type="button"
              onClick={() => {
                setManualMode(false)
                setEmployeeId('')
                setPin(null)
                setShowPinPad(false)
              }}
              className="flex items-center gap-2 text-sm text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <ScanFace className="h-4 w-4" /> Volver a la cámara
            </button>
          )}
        </>
      )}

      {(verified || selectedEmployee) && (
        <>
          {verified && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-center text-lg font-semibold text-emerald-400">
                {verified.fullName}
              </p>
              <button
                type="button"
                onClick={() => setVerified(null)}
                disabled={submittingTipo !== null}
                className="flex items-center gap-2 text-xs text-slate-400 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50"
              >
                <ScanFace className="h-3.5 w-3.5" /> No soy yo / Cancelar
              </button>
            </div>
          )}

          {!verified && !readyToMark ? (
            <p className="text-sm text-amber-300">
              {isOnline
                ? 'Ingresa tu PIN para continuar.'
                : 'Sin conexion: ingresa tu PIN para continuar.'}
            </p>
          ) : (
            <>
              <div className="grid w-full grid-cols-2 gap-3">
                {MARK_BUTTONS.map((m) => (
                  <button
                    key={m.tipo}
                    type="button"
                    onClick={() => handleMark(m.tipo)}
                    disabled={submittingTipo !== null}
                    className="flex h-24 items-center justify-center rounded-2xl bg-blue-600 px-2 text-center text-base font-bold text-white shadow-lg outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95 disabled:opacity-50"
                  >
                    {submittingTipo === m.tipo ? 'Marcando…' : m.label}
                  </button>
                ))}
              </div>

              {!verified && !faceConfigured && isOnline && (
                <button
                  type="button"
                  onClick={() => setShowPinPad(true)}
                  className="flex items-center gap-2 text-sm text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <KeyRound className="h-4 w-4" /> ¿Falló la cámara?
                </button>
              )}

              {!verified && pin && (
                <p className="text-xs text-emerald-400">
                  PIN listo — se usara en tu proxima marca.
                </p>
              )}
            </>
          )}
        </>
      )}

      {pinPadOpen && (
        <PinPad
          onConfirm={(value) => {
            setPin(value)
            setShowPinPad(false)
          }}
          onCancel={() => {
            setShowPinPad(false)
            // Sin PIN no se puede seguir en modo manual obligatorio: cancelar
            // vuelve al buscador en vez de dejar el teclado "atascado".
            if (pinRequired) setEmployeeId('')
          }}
        />
      )}
    </div>
  )
}
