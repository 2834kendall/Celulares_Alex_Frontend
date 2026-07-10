'use client'

import { useMemo, useState } from 'react'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import type { DayAssignment, EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import type { CustomHoursValues } from '@/modules/schedules/components/CustomHoursModal'

interface UseWeeklyScheduleMatrixParams {
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
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
}: UseWeeklyScheduleMatrixParams) {
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

  // revalidatePath('/schedule') inside assignDaySchedule already refreshes
  // the route in the same response; router.refresh() is not needed here.
  async function handleCustomConfirm(values: CustomHoursValues) {
    if (!customModalFor) {
      return
    }

    const { row, assignment } = customModalFor
    const cellKey = `${row.employmentHistoryId}-${assignment.date}`
    setSavingCell(cellKey)

    const result = await assignDaySchedule({
      assignmentId: assignment.assignmentId,
      employmentHistoryId: row.employmentHistoryId,
      employeeId: row.employeeId,
      branchId: row.branchId,
      date: assignment.date,
      scheduleId: null,
      isDayOff: false,
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
    const scheduleId = isFreeDay ? null : value ? Number(value) : null

    if (!isFreeDay && !scheduleId) {
      return
    }

    const cellKey = `${row.employmentHistoryId}-${assignment.date}`
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
