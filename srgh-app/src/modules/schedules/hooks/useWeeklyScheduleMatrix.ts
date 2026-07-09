'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import type { DayAssignment, EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'

interface UseWeeklyScheduleMatrixParams {
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
}

function getAssignmentValue(assignment: DayAssignment) {
  if (assignment.esDiaLibre) {
    return '__free__'
  }

  if (assignment.horaEntradaCustom) {
    return '__custom__'
  }

  return assignment.horarioId ? String(assignment.horarioId) : ''
}

export function useWeeklyScheduleMatrix({
  rows,
  schedules,
  canWrite,
}: UseWeeklyScheduleMatrixParams) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [customModalFor, setCustomModalFor] = useState<{
    row: EmployeeWeekRow
    assignment: DayAssignment
  } | null>(null)

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.hor_activo),
    [schedules]
  )

  const scheduleOptions = activeSchedules.length > 0 ? activeSchedules : schedules

  function openCustomModal(row: EmployeeWeekRow, assignment: DayAssignment) {
    setCustomModalFor({ row, assignment })
  }

  function closeCustomModal() {
    setCustomModalFor(null)
  }

  async function handleCustomConfirm(entrada: string, salida: string) {
    if (!customModalFor) {
      return
    }

    const { row, assignment } = customModalFor
    const cellKey = `${row.historialLaboralId}-${assignment.fecha}`
    setSavingCell(cellKey)

    const result = await assignDaySchedule({
      prgId: assignment.prgId,
      historialLaboralId: row.historialLaboralId,
      empleadoId: row.empleadoId,
      sucursalId: row.sucursalId,
      fecha: assignment.fecha,
      horarioId: null,
      esDiaLibre: false,
      horaEntradaCustom: entrada,
      horaSalidaCustom: salida,
    })

    setSavingCell(null)
    setCustomModalFor(null)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    router.refresh()
  }

  async function handleAssignmentChange(
    row: EmployeeWeekRow,
    assignment: DayAssignment,
    value: string
  ) {
    if (!canWrite) {
      return
    }

    if (value === '__custom__') {
      openCustomModal(row, assignment)
      return
    }

    setServerError(null)

    const isFreeDay = value === '__free__'
    const horarioId = isFreeDay ? null : value ? Number(value) : null

    if (!isFreeDay && !horarioId) {
      return
    }

    const cellKey = `${row.historialLaboralId}-${assignment.fecha}`
    setSavingCell(cellKey)

    const result = await assignDaySchedule({
      prgId: assignment.prgId,
      historialLaboralId: row.historialLaboralId,
      empleadoId: row.empleadoId,
      sucursalId: row.sucursalId,
      fecha: assignment.fecha,
      horarioId,
      esDiaLibre: isFreeDay,
    })

    setSavingCell(null)

    if (!result.ok) {
      setServerError(result.error)
      return
    }

    router.refresh()
  }

  return {
    rows,
    scheduleOptions,
    serverError,
    savingCell,
    customModalFor,
    getAssignmentValue,
    openCustomModal,
    closeCustomModal,
    handleCustomConfirm,
    handleAssignmentChange,
  }
}
