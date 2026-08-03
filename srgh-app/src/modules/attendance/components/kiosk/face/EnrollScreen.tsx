'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BadgeCheck, CheckCircle2, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { SearchSelect, type SearchSelectOption } from '@/components/ui/SearchSelect'
import type { ActiveEmployeeOption } from '@/modules/attendance/actions/getActiveEmployees'
import { enrollFace } from '@/modules/attendance/actions/enrollFace'
import type { EncryptedVector } from '@/modules/attendance/lib/face/faceCrypto'
import { FaceScan } from '@/modules/attendance/components/kiosk/face/FaceScan'

interface EnrollScreenProps {
  employees: ActiveEmployeeOption[]
  /** Empleados que ya tienen vector vigente (se marcan y pueden re-enrolarse). */
  enrolledIds: number[]
}

/**
 * Alta de rostros (solo gerentes): elegir empleado → capturar con la misma
 * prueba de vida del kiosco → el vector viaja cifrado a enrollFace.
 * Re-enrolar a alguien ya registrado simplemente reemplaza su vector.
 */
export function EnrollScreen({ employees, enrolledIds }: EnrollScreenProps) {
  const router = useRouter()
  const [employeeId, setEmployeeId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [savedName, setSavedName] = useState<string | null>(null)

  const enrolled = new Set(enrolledIds)
  const selectedEmployee = employees.find((e) => String(e.employeeId) === employeeId) ?? null

  const options: SearchSelectOption[] = employees.map((e) => ({
    value: String(e.employeeId),
    label: enrolled.has(e.employeeId) ? `${e.fullName} (ya enrolado)` : e.fullName,
  }))

  const selectedId = selectedEmployee?.employeeId ?? null
  const selectedName = selectedEmployee?.fullName ?? null

  const handleEmbedding = useCallback(
    async (payload: EncryptedVector) => {
      if (selectedId === null) return

      const result = await enrollFace({ employeeId: selectedId, vector: payload })

      if (!result.ok) {
        toast.error(result.error)
        setScanning(false)
        return
      }

      setSavedName(selectedName)
      setScanning(false)
      setEmployeeId('')
      // Refresca los datos del server component (la etiqueta "ya enrolado").
      router.refresh()
    },
    [selectedId, selectedName, router]
  )

  const handleUnavailable = useCallback((reason: string) => {
    toast.error(reason)
    setScanning(false)
  }, [])

  if (savedName) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <CheckCircle2 className="h-20 w-20 text-emerald-400" />
        <p className="text-2xl font-bold">Rostro registrado</p>
        <p className="text-slate-300">{savedName}</p>
        <button
          type="button"
          onClick={() => setSavedName(null)}
          className="mt-2 rounded-full bg-blue-600 px-6 py-2.5 text-sm font-bold text-white outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-white/60"
        >
          Enrolar a otra persona
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-full max-w-sm flex-1 flex-col items-center justify-center gap-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Enrolamiento facial</h1>
        <p className="mt-1 text-sm text-slate-300">Selecciona al colaborador y captura su rostro</p>
      </div>

      <div className="w-full">
        <SearchSelect
          options={options}
          value={employeeId}
          onChange={(value) => {
            setEmployeeId(value)
            setScanning(false)
          }}
          ariaLabel="Selecciona al colaborador"
          className="w-full"
        />
      </div>

      {selectedEmployee && !scanning && (
        <div className="flex flex-col items-center gap-3">
          {enrolled.has(selectedEmployee.employeeId) && (
            <p className="flex items-center gap-2 text-xs text-emerald-400">
              <BadgeCheck className="h-4 w-4" />
              Ya tiene un rostro registrado — capturar de nuevo lo reemplaza.
            </p>
          )}
          <button
            type="button"
            onClick={() => setScanning(true)}
            className="flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3 text-base font-bold text-white shadow-lg outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-white/60 active:scale-95"
          >
            <UserPlus className="h-5 w-5" /> Capturar rostro
          </button>
        </div>
      )}

      {selectedEmployee && scanning && (
        <>
          <FaceScan onEmbedding={handleEmbedding} onUnavailable={handleUnavailable} />
          <button
            type="button"
            onClick={() => setScanning(false)}
            className="text-sm text-slate-300 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-white/60"
          >
            Cancelar
          </button>
        </>
      )}
    </div>
  )
}
