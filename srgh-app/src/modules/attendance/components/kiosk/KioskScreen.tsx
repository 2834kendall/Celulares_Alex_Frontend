'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, KeyRound, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect'
import type { ActiveEmployeeOption } from '@/modules/attendance/actions/getActiveEmployees'
import type { MarkType } from '@/modules/attendance/lib/marks'
import { getCurrentCoordinates } from '@/modules/attendance/components/kiosk/geolocation'
import { getOrCreateDeviceId } from '@/modules/attendance/components/kiosk/deviceId'
import { useOfflineSync } from '@/modules/attendance/components/kiosk/useOfflineSync'
import { PinPad } from '@/modules/attendance/components/kiosk/PinPad'

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

/**
 * Kiosco compartido de sucursal: los empleados NO inician sesion, solo la
 * cuenta KIOSCO tiene sesion (permanente en la tablet). El selector de
 * nombre es el mock provisional del reconocimiento facial — cuando exista la
 * camara real, solo se reemplaza ese paso, el resto del flujo no cambia.
 *
 * Sin internet, useOfflineSync guarda la marca en IndexedDB en vez de
 * llamar al servidor, y sin camara real, el unico respaldo de identidad
 * offline es el PIN — por eso se exige antes de habilitar los botones.
 */
export function KioskScreen({ employees }: KioskScreenProps) {
  const [employeeId, setEmployeeId] = useState('')
  const [pin, setPin] = useState<string | null>(null)
  const [showPinPad, setShowPinPad] = useState(false)
  const [submittingTipo, setSubmittingTipo] = useState<MarkType | null>(null)
  const [successLabel, setSuccessLabel] = useState<string | null>(null)

  const { isOnline, pendingCount, submitMark } = useOfflineSync()

  const options: SearchSelectOption[] = employees.map((e) => ({
    value: String(e.employeeId),
    label: e.fullName,
  }))

  const selectedEmployee = employees.find((e) => String(e.employeeId) === employeeId) ?? null
  const readyToMark = isOnline || pin !== null
  // Sin camara real, offline solo puede identificar por PIN: en cuanto hay un
  // empleado elegido sin conexion, el teclado se exige solo — valor derivado
  // en vez de un efecto que llame setState, para no disparar renders en cascada.
  const pinPadOpen = showPinPad || (!isOnline && selectedEmployee !== null && pin === null)

  useEffect(() => {
    if (!successLabel) return
    // Se limpia la pantalla en linea (no una funcion reset() externa) para
    // que este efecto solo dependa de successLabel: los setters de useState
    // ya son estables y no necesitan declararse como dependencia.
    const timeout = setTimeout(() => {
      setSuccessLabel(null)
      setEmployeeId('')
      setPin(null)
      setShowPinPad(false)
      setSubmittingTipo(null)
    }, SUCCESS_DISPLAY_MS)
    return () => clearTimeout(timeout)
  }, [successLabel])

  async function handleMark(tipo: MarkType) {
    if (!selectedEmployee || submittingTipo || !readyToMark) return
    setSubmittingTipo(tipo)

    const coords = await getCurrentCoordinates()

    const outcome = await submitMark({
      employeeId: selectedEmployee.employeeId,
      tipo,
      latitud: coords?.latitud ?? null,
      longitud: coords?.longitud ?? null,
      pin,
      dispositivoId: getOrCreateDeviceId() || null,
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

  if (successLabel) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <CheckCircle2 className="h-20 w-20 text-emerald-400" />
        <p className="text-2xl font-bold">{successLabel}</p>
        {selectedEmployee && <p className="text-slate-300">{selectedEmployee.fullName}</p>}
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
        <p className="mt-1 text-sm text-slate-300">Selecciona tu nombre para marcar</p>
      </div>

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

      {selectedEmployee && (
        <>
          {!readyToMark ? (
            <p className="text-sm text-amber-300">Sin conexion: ingresa tu PIN para continuar.</p>
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

              {isOnline && (
                <button
                  type="button"
                  onClick={() => setShowPinPad(true)}
                  className="flex items-center gap-2 text-sm text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <KeyRound className="h-4 w-4" /> ¿Falló la cámara?
                </button>
              )}

              {pin && (
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
            // Offline no se puede seguir sin PIN: cancelar vuelve al buscador
            // en vez de dejar el teclado "atascado" abierto por el valor derivado.
            if (!isOnline) setEmployeeId('')
          }}
        />
      )}
    </div>
  )
}
