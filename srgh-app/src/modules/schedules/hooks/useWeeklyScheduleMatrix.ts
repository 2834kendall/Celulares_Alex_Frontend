'use client'

import { useMemo, useState } from 'react'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { clearDayAssignment } from '@/modules/schedules/actions/clearDayAssignment'
import type { DayAssignment, EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import type { CustomHoursValues } from '@/modules/schedules/components/CustomHoursModal'
import type { AusenciaOverlayEntry } from '@/modules/absences/lib/overlay'

export type DayAssignmentWithAusencia = DayAssignment & { ausencia: AusenciaOverlayEntry | null }
export type EmployeeWeekRowWithAusencia = Omit<EmployeeWeekRow, 'days'> & {
  days: DayAssignmentWithAusencia[]
}

interface UseWeeklyScheduleMatrixParams {
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
  ausencias?: AusenciaOverlayEntry[]
}

function getAssignmentValue(assignment: DayAssignment) {
  if (assignment.isDayOff) {
    return '__free__'
  }

  if (assignment.customStartTime) {
    return '__custom__'
  }

  return assignment.scheduleId ? String(assignment.scheduleId) : ''
}

export function useWeeklyScheduleMatrix({
  rows,
  schedules,
  canWrite,
  ausencias = [],
}: UseWeeklyScheduleMatrixParams) {
  const [serverError, setServerError] = useState<string | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)
  const [customModalFor, setCustomModalFor] = useState<{
    row: EmployeeWeekRowWithAusencia
    assignment: DayAssignmentWithAusencia
  } | null>(null)

  const activeSchedules = useMemo(
    () => schedules.filter((schedule) => schedule.hor_activo),
    [schedules]
  )

  const scheduleOptions = activeSchedules.length > 0 ? activeSchedules : schedules

  const overlayByCell = useMemo(() => {
    const map = new Map<string, AusenciaOverlayEntry>()
    for (const entry of ausencias) {
      map.set(`${entry.employmentHistoryId}|${entry.date}`, entry)
    }
    return map
  }, [ausencias])

  /**
   * Superpone las ausencias sobre la matriz: una incapacidad/licencia
   * (no intradia) reemplaza el dia y no cuenta horas; un permiso de
   * lactancia (intradia) solo se marca, sin alterar horario ni horas.
   */
  const rowsWithAusencias: EmployeeWeekRowWithAusencia[] = useMemo(() => {
    return rows.map((row) => {
      let weeklyTotal = row.weeklyTotal
      const days = row.days.map((day) => {
        const ausencia = overlayByCell.get(`${row.employmentHistoryId}|${day.date}`) ?? null
        const isBlocked = Boolean(ausencia && !ausencia.isIntraday)
        if (isBlocked && day.hours > 0) {
          weeklyTotal -= day.hours
        }
        return { ...day, ausencia, hours: isBlocked ? 0 : day.hours }
      })
      return { ...row, days, weeklyTotal }
    })
  }, [rows, overlayByCell])

  function openCustomModal(
    row: EmployeeWeekRowWithAusencia,
    assignment: DayAssignmentWithAusencia
  ) {
    setCustomModalFor({ row, assignment })
  }

  function closeCustomModal() {
    setCustomModalFor(null)
  }

  // revalidatePath('/schedule') inside assignDaySchedule/assignCustomScheduleBulk
  // already refreshes the route in the same response; router.refresh() is not needed here.
  async function handleCustomConfirm(values: CustomHoursValues) {
    if (!customModalFor) {
      return
    }

    const { row } = customModalFor
    const applyToDates =
      values.applyToDates.length > 0 ? values.applyToDates : [customModalFor.assignment.date]

    const days = applyToDates.map((date) => {
      const existing = row.days.find((d) => d.date === date)
      return { assignmentId: existing?.assignmentId ?? null, date }
    })

    setSavingCell(`${row.employmentHistoryId}-${applyToDates.join(',')}`)

    const result = await assignCustomScheduleBulk({
      employmentHistoryId: row.employmentHistoryId,
      employeeId: row.employeeId,
      branchId: row.branchId,
      days,
      customStartTime: values.startTime,
      customEndTime: values.endTime,
      customLunchStart: values.lunchStart,
      customLunchEnd: values.lunchEnd,
      customBreakStart: values.breakStart,
      customBreakEnd: values.breakEnd,
    })

    setSavingCell(null)
    setCustomModalFor(null)

    if (!result.ok) {
      setServerError(result.error)
    }
  }

  async function handleAssignmentChange(
    row: EmployeeWeekRowWithAusencia,
    assignment: DayAssignmentWithAusencia,
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

    const cellKey = `${row.employmentHistoryId}-${assignment.date}`

    // "Asignar horario" (valor vacio): vuelve el dia a "Sin asignar" quitando la celda.
    if (value === '') {
      if (!assignment.assignmentId) {
        return
      }

      setSavingCell(cellKey)
      const result = await clearDayAssignment(assignment.assignmentId)
      setSavingCell(null)

      if (!result.ok) {
        setServerError(result.error)
      }
      return
    }

    const isFreeDay = value === '__free__'
    const scheduleId = isFreeDay ? null : Number(value)

    if (!isFreeDay && !scheduleId) {
      return
    }

    setSavingCell(cellKey)

    const result = await assignDaySchedule({
      assignmentId: assignment.assignmentId,
      employmentHistoryId: row.employmentHistoryId,
      employeeId: row.employeeId,
      branchId: row.branchId,
      date: assignment.date,
      scheduleId,
      isDayOff: isFreeDay,
    })

    setSavingCell(null)

    if (!result.ok) {
      setServerError(result.error)
    }
  }

  return {
    rows: rowsWithAusencias,
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
