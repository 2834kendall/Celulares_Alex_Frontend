'use client'

import { useMemo, useState } from 'react'
import { assignDaySchedule } from '@/modules/schedules/actions/assignDaySchedule'
import { assignCustomScheduleBulk } from '@/modules/schedules/actions/assignCustomScheduleBulk'
import { assignSplitSchedule } from '@/modules/schedules/actions/assignSplitSchedule'
import { clearDayAssignment } from '@/modules/schedules/actions/clearDayAssignment'
import type { DayAssignment, EmployeeWeekRow } from '@/modules/schedules/actions/getWeeklySchedule'
import type { ScheduleRow } from '@/modules/schedules/types'
import type { CustomHoursValues } from '@/modules/schedules/components/CustomHoursModal'
import type { AusenciaOverlayEntry } from '@/modules/absences/lib/overlay'
import { dayHours, tramosOf } from '@/modules/schedules/lib/segments'
import { hasSecondBlock } from '@/modules/schedules/lib/hours'

// Cada tramo del dia (el primero y los extra, SGRH-110) lleva la ausencia que
// cae sobre esa fecha: una incapacidad bloquea todos los tramos del dia.
export interface DayAssignmentWithAusencia extends Omit<DayAssignment, 'extraTramos'> {
  ausencia: AusenciaOverlayEntry | null
  extraTramos?: DayAssignmentWithAusencia[]
}
export type EmployeeWeekRowWithAusencia = Omit<EmployeeWeekRow, 'days'> & {
  days: DayAssignmentWithAusencia[]
}

interface UseWeeklyScheduleMatrixParams {
  rows: EmployeeWeekRow[]
  schedules: ScheduleRow[]
  canWrite: boolean
  ausencias?: AusenciaOverlayEntry[]
}

function withAusencia(
  day: DayAssignment,
  ausencia: AusenciaOverlayEntry | null
): DayAssignmentWithAusencia {
  const isBlocked = Boolean(ausencia && !ausencia.isIntraday)
  const { extraTramos, ...own } = day
  const result: DayAssignmentWithAusencia = {
    ...own,
    ausencia,
    hours: isBlocked ? 0 : own.hours,
  }
  if (extraTramos && extraTramos.length > 0) {
    result.extraTramos = extraTramos.map((extra) => withAusencia(extra, ausencia))
  }
  return result
}

/**
 * Fila existente que debe actualizar "horas personalizadas" en una fecha dada:
 * el tramo de esa sucursal si lo hay; si el dia tiene un solo tramo, ese (asi
 * se comportaba antes de los tramos); si tiene varios y ninguno es de esa
 * sucursal, ninguno: se crea uno nuevo en vez de pisar el de otra sucursal.
 */
function existingTramoId(day: DayAssignment | undefined, branchId: number): number | null {
  if (!day) return null
  const existing = tramosOf(day).filter((tramo) => tramo.assignmentId != null)
  const match = existing.find((tramo) => tramo.branchId === branchId)
  if (match) return match.assignmentId
  return existing.length === 1 ? existing[0].assignmentId : null
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
        if (isBlocked) {
          weeklyTotal -= dayHours(day)
        }
        return withAusencia(day, ausencia)
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
      // La fecha desde la que se abrio el modal usa el tramo exacto que se
      // edito (o ninguno, si es un tramo nuevo); las demas, el que corresponda.
      if (date === customModalFor.assignment.date) {
        return { assignmentId: customModalFor.assignment.assignmentId, date }
      }
      return {
        assignmentId: existingTramoId(
          row.days.find((d) => d.date === date),
          values.branchId
        ),
        date,
      }
    })

    setSavingCell(`${row.employmentHistoryId}-${applyToDates.join(',')}`)

    const result = await assignCustomScheduleBulk({
      employmentHistoryId: row.employmentHistoryId,
      employeeId: row.employeeId,
      branchId: values.branchId,
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

  // Cambia solo la sucursal de una celda ya asignada, conservando el horario actual.
  async function handleBranchChange(
    row: EmployeeWeekRowWithAusencia,
    assignment: DayAssignmentWithAusencia,
    branchId: number
  ) {
    // Sin asignacion aun no hay sucursal que cambiar; el dia usa la de casa.
    if (!canWrite || !assignment.assignmentId || branchId === assignment.branchId) {
      return
    }

    setServerError(null)
    const cellKey = `${row.employmentHistoryId}-${assignment.date}`
    setSavingCell(cellKey)

    const isCustom = Boolean(assignment.customStartTime && assignment.customEndTime)

    const result = await assignDaySchedule({
      assignmentId: assignment.assignmentId,
      employmentHistoryId: row.employmentHistoryId,
      employeeId: row.employeeId,
      branchId,
      date: assignment.date,
      scheduleId: assignment.isDayOff || isCustom ? null : assignment.scheduleId,
      isDayOff: assignment.isDayOff,
      customStartTime: isCustom ? assignment.customStartTime : undefined,
      customEndTime: isCustom ? assignment.customEndTime : undefined,
      customLunchStart: isCustom ? assignment.customLunchStart : undefined,
      customLunchEnd: isCustom ? assignment.customLunchEnd : undefined,
      customBreakStart: isCustom ? assignment.customBreakStart : undefined,
      customBreakEnd: isCustom ? assignment.customBreakEnd : undefined,
    })

    setSavingCell(null)

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

    // Una plantilla partida con una sucursal por bloque (SGRH-110) manda sobre la
    // sucursal de la celda: con sucursales distintas el dia se reparte en dos
    // tramos; con la misma, es un solo tramo en esa sucursal.
    const chosenSchedule = scheduleId ? schedules.find((s) => s.hor_id === scheduleId) : undefined
    const templateFirst = chosenSchedule?.hor_sucursal_id
    const templateSecond = chosenSchedule?.hor_sucursal_id_2
    const hasTemplateBranches = Boolean(
      chosenSchedule && hasSecondBlock(chosenSchedule) && templateFirst && templateSecond
    )

    if (chosenSchedule && hasTemplateBranches && templateFirst !== templateSecond) {
      setSavingCell(cellKey)

      const splitResult = await assignSplitSchedule({
        assignmentId: assignment.assignmentId,
        employmentHistoryId: row.employmentHistoryId,
        employeeId: row.employeeId,
        date: assignment.date,
        scheduleId: chosenSchedule.hor_id,
      })

      setSavingCell(null)

      if (!splitResult.ok) {
        setServerError(splitResult.error)
      }
      return
    }

    setSavingCell(cellKey)

    const result = await assignDaySchedule({
      assignmentId: assignment.assignmentId,
      employmentHistoryId: row.employmentHistoryId,
      employeeId: row.employeeId,
      // La sucursal DEL DÍA, no la de casa: cambiarle el horario a un día
      // que se movió a otra sucursal (cubrir un turno) lo devolvía a la de
      // casa sin avisar, y el kiosco donde iba a trabajar ya no lo dejaba
      // marcar. Un día sin fila ya trae la sucursal de casa.
      branchId: hasTemplateBranches ? templateFirst! : assignment.branchId,
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
    handleBranchChange,
  }
}
