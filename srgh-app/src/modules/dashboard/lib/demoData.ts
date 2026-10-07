import {
  toRecentHires,
  toUpcomingAnniversaries,
  toUpcomingBirthdays,
  type BirthdaySource,
} from '@/modules/dashboard/lib/birthdays'
import type { PendingSettlement } from '@/modules/dashboard/components/SettlementsWidget'
import {
  describeMyDay,
  type AbsencesSummary,
  type EvaluationsSummary,
  type ExpiringContract,
} from '@/modules/dashboard/lib/extras'
import type { MyDayAssignment } from '@/modules/schedules/actions/getMySchedule'
import { getWeekDates } from '@/modules/schedules/lib/week'
import type {
  AttendanceSummary,
  MonthSummary,
  PayrollSummary,
  RecruitmentSummary,
} from '@/modules/dashboard/lib/summaries'

/**
 * Made-up people for previewing the dashboard (`/dashboard?demo=1`, only
 * outside production — see the page). They exist so the birthdays panel can
 * be seen full, with someone celebrating today, on a database that has few
 * birth dates loaded. Not real data: none of this is ever queried or stored.
 */
const DEMO_PEOPLE: { nombre: string; puesto: string; sucursal: string; inDays: number }[] = [
  { nombre: 'Valeria Mora Solís', puesto: 'Asesora de ventas', sucursal: 'San José', inDays: 0 },
  { nombre: 'Andrés Rojas Vega', puesto: 'Técnico reparador', sucursal: 'Heredia', inDays: 1 },
  { nombre: 'Mariana Castro Li', puesto: 'Cajera', sucursal: 'San José', inDays: 3 },
  { nombre: 'José Pablo Jiménez', puesto: 'Encargado', sucursal: 'Alajuela', inDays: 6 },
  { nombre: 'Daniela Quesada Ruiz', puesto: 'Asesora de ventas', sucursal: 'Cartago', inDays: 11 },
  { nombre: 'Esteban Vargas Mena', puesto: 'Bodeguero', sucursal: 'Heredia', inDays: 18 },
  { nombre: 'Lucía Fernández Arce', puesto: 'Recursos Humanos', sucursal: 'San José', inDays: 24 },
  { nombre: 'Kevin Salazar Pérez', puesto: 'Técnico reparador', sucursal: 'Alajuela', inDays: 37 },
  { nombre: 'Paola Chaves Monge', puesto: 'Asesora de ventas', sucursal: 'Cartago', inDays: 52 },
  { nombre: 'Rodrigo Alfaro Soto', puesto: 'Gerente', sucursal: 'San José', inDays: 75 },
  { nombre: 'Natalia Brenes Cruz', puesto: 'Cajera', sucursal: 'Heredia', inDays: 120 },
  { nombre: 'Felipe Araya Núñez', puesto: 'Asesor de ventas', sucursal: 'Alajuela', inDays: 210 },
]

const MS_PER_DAY = 86_400_000

export function demoPeople(todayIso: string) {
  const todayMs = Date.parse(`${todayIso}T00:00:00Z`)

  const sources: BirthdaySource[] = DEMO_PEOPLE.map((person, index) => {
    const celebration = new Date(todayMs + person.inDays * MS_PER_DAY)
    const month = String(celebration.getUTCMonth() + 1).padStart(2, '0')
    const day = String(celebration.getUTCDate()).padStart(2, '0')

    return {
      id: -(index + 1),
      nombre: person.nombre,
      puesto: person.puesto,
      sucursal: person.sucursal,
      fotoUrl: null,
      /* Any leap year works: only the month and the day are used. */
      fechaNacimiento: `1992-${month}-${day}`,
    }
  })

  /* The same people, joined 1 to 9 years ago on a day a little after their
     birthday, so the anniversaries panel has a spread of dates too. */
  const joined = sources.map((person, index) => {
    const celebration = new Date(todayMs + (DEMO_PEOPLE[index].inDays * 2 + 4) * MS_PER_DAY)
    const month = String(celebration.getUTCMonth() + 1).padStart(2, '0')
    const day = String(celebration.getUTCDate()).padStart(2, '0')
    const year = celebration.getUTCFullYear() - 1 - (index % 9)
    return { ...person, fechaIngreso: `${year}-${month}-${day}` }
  })

  return {
    birthdays: toUpcomingBirthdays(sources, todayIso),
    anniversaries: toUpcomingAnniversaries(joined, todayIso),
    /* Three of them joined a few weeks ago. */
    newHires: toRecentHires(
      sources.slice(4, 7).map((person, index) => {
        const start = new Date(todayMs - (6 + index * 17) * MS_PER_DAY)
        const month = String(start.getUTCMonth() + 1).padStart(2, '0')
        const day = String(start.getUTCDate()).padStart(2, '0')
        return { ...person, fechaIngreso: `${start.getUTCFullYear()}-${month}-${day}` }
      }),
      todayIso,
      60
    ),
    activeCount: 48,
    todayIso,
  }
}

export const DEMO_TEAM = [
  { sucursal: 'San José', count: 18 },
  { sucursal: 'Heredia', count: 12 },
  { sucursal: 'Alajuela', count: 10 },
  { sucursal: 'Cartago', count: 8 },
]

/* Made-up figures for the other panels, for the same preview. */

const DEMO_LEVE = { nombre: 'Tardía leve', color: '#F59E0B' }
const DEMO_GRAVE = { nombre: 'Tardía grave', color: '#E11D48' }

function demoPerson(id: number, nombre: string) {
  return { id, nombre, fotoUrl: null }
}

export const DEMO_ATTENDANCE: AttendanceSummary = {
  expected: 40,
  onTime: 27,
  late: 4,
  pending: 4,
  missing: 3,
  justified: 2,
  working: 29,
  left: 2,
  latePeople: [
    {
      ...demoPerson(-21, 'Esteban Vargas Mena'),
      minutes: 34,
      tipo: DEMO_GRAVE,
      isJustified: false,
    },
    { ...demoPerson(-22, 'Paola Chaves Monge'), minutes: 18, tipo: DEMO_GRAVE, isJustified: true },
    { ...demoPerson(-23, 'Kevin Salazar Pérez'), minutes: 9, tipo: DEMO_LEVE, isJustified: false },
    { ...demoPerson(-24, 'Natalia Brenes Cruz'), minutes: 6, tipo: DEMO_LEVE, isJustified: false },
  ],
  missingPeople: [
    {
      ...demoPerson(-25, 'Rodrigo Alfaro Soto'),
      minutes: 95,
      tipo: DEMO_GRAVE,
      expectedStart: '08:00',
    },
    {
      ...demoPerson(-26, 'Felipe Araya Núñez'),
      minutes: 35,
      tipo: DEMO_GRAVE,
      expectedStart: '09:00',
    },
    {
      ...demoPerson(-27, 'Lucía Fernández Arce'),
      minutes: 7,
      tipo: DEMO_LEVE,
      expectedStart: '09:28',
    },
  ],
  pendingPeople: [
    { ...demoPerson(-28, 'José Pablo Jiménez'), expectedStart: '10:00' },
    { ...demoPerson(-29, 'Daniela Quesada Ruiz'), expectedStart: '13:00' },
    { ...demoPerson(-30, 'Mariana Castro Li'), expectedStart: '13:00' },
    { ...demoPerson(-31, 'Andrés Rojas Vega'), expectedStart: '14:00' },
  ],
}

export function demoPayroll(todayIso: string): PayrollSummary {
  const [year, month, day] = todayIso.split('-').map(Number)
  const quincena = day <= 15 ? 1 : 2
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()

  const previousMonth = month === 1 ? 12 : month - 1
  const previousYear = month === 1 ? year - 1 : year

  return {
    pending: 3,
    overdue: 2,
    others: [
      { id: -2, mes: previousMonth, anio: previousYear, quincena: 2, atrasado: true },
      { id: -3, mes: previousMonth, anio: previousYear, quincena: 1, atrasado: true },
    ],
    current: {
      id: -1,
      mes: month,
      anio: year,
      quincena,
      estado: 'borrador',
      atrasado: false,
      fechaPago: null,
      sucursal: 'San José',
      totalEmpleados: 48,
      day: quincena === 1 ? day : day - 15,
      totalDays: quincena === 1 ? 15 : lastDay - 15,
    },
  }
}

export const DEMO_RECRUITMENT: RecruitmentSummary = {
  total: 17,
  phases: [
    { id: 1, label: 'Postulados', count: 9 },
    { id: 2, label: 'En evaluación', count: 6 },
    { id: 3, label: 'Decisión', count: 2 },
  ],
  newest: [
    { id: -31, nombre: 'Sofía Madrigal Ureña', puesto: 'Asesora de ventas' },
    { id: -32, nombre: 'Bryan Cordero Solano', puesto: 'Técnico reparador' },
    { id: -33, nombre: 'Melissa Zúñiga Rojas', puesto: 'Cajera' },
  ],
}

export const DEMO_MONTH: MonthSummary = {
  tardias: 23,
  ausencias: 4,
  people: [
    { id: -21, nombre: 'Esteban Vargas Mena', tardias: 6, ausencias: 1 },
    { id: -22, nombre: 'Paola Chaves Monge', tardias: 5, ausencias: 0 },
    { id: -23, nombre: 'Kevin Salazar Pérez', tardias: 3, ausencias: 2 },
    { id: -24, nombre: 'Natalia Brenes Cruz', tardias: 4, ausencias: 0 },
    { id: -25, nombre: 'Rodrigo Alfaro Soto', tardias: 2, ausencias: 1 },
  ],
}

export const DEMO_SETTLEMENTS: PendingSettlement[] = [
  { id: -41, nombre: 'Gabriel Ureña Mata', fechaSalida: '2026-09-12', motivo: 'Renuncia' },
  { id: -42, nombre: 'Karla Méndez Soto', fechaSalida: '2026-09-30', motivo: 'Fin de contrato' },
]

/** Monday to Saturday on the same shift, Sunday off. */
export function demoMyWeek(todayIso: string): { days: MyDayAssignment[]; weeklyTotal: number } {
  const days: MyDayAssignment[] = getWeekDates(todayIso).map((date, index) => {
    const isDayOff = index === 6
    return {
      date,
      isDayOff,
      isHoliday: false,
      scheduleId: isDayOff ? null : -1,
      scheduleName: isDayOff ? null : 'Turno de mañana',
      scheduleColor: null,
      isCustom: false,
      startTime: isDayOff ? null : '08:00',
      endTime: isDayOff ? null : index === 5 ? '12:00' : '17:00',
      hours: isDayOff ? 0 : index === 5 ? 4 : 8,
      observaciones: null,
      branchName: isDayOff ? null : 'San José',
    }
  })

  return { days, weeklyTotal: days.reduce((sum, day) => sum + day.hours, 0) }
}

export const DEMO_ABSENCES: AbsencesSummary = {
  outToday: 2,
  absences: [
    {
      id: -51,
      employeeId: -5,
      nombre: 'Daniela Quesada Ruiz',
      tipo: 'Incapacidad por enfermedad',
      range: '6–9 oct',
      coversToday: true,
      esIntradia: false,
    },
    {
      id: -52,
      employeeId: -8,
      nombre: 'Kevin Salazar Pérez',
      tipo: 'Vacaciones',
      range: '5–11 oct',
      coversToday: true,
      esIntradia: false,
    },
    {
      id: -53,
      employeeId: -7,
      nombre: 'Lucía Fernández Arce',
      tipo: 'Lactancia',
      range: '1–31 oct',
      coversToday: true,
      esIntradia: true,
    },
    {
      id: -54,
      employeeId: -3,
      nombre: 'Mariana Castro Li',
      tipo: 'Cita médica',
      range: '9 oct',
      coversToday: false,
      esIntradia: false,
    },
  ],
}

export function demoEvaluations(todayIso: string): EvaluationsSummary {
  return {
    year: Number(todayIso.slice(0, 4)),
    evaluated: 31,
    pending: 17,
    average: 8.4,
    recent: [
      { id: -61, nombre: 'Valeria Mora Solís', promedio: 9, fecha: '2 oct' },
      { id: -62, nombre: 'Andrés Rojas Vega', promedio: 8, fecha: '29 sep' },
      { id: -63, nombre: 'Esteban Vargas Mena', promedio: 6, fecha: '25 sep' },
      { id: -64, nombre: 'Paola Chaves Monge', promedio: 10, fecha: '18 sep' },
    ],
    pendingNames: ['Daniela Quesada Ruiz', 'Felipe Araya Núñez', 'José Pablo Jiménez'],
  }
}

export const DEMO_CONTRACTS: ExpiringContract[] = [
  {
    labId: -71,
    employeeId: -12,
    nombre: 'Felipe Araya Núñez',
    puesto: 'Asesor de ventas',
    sucursal: 'Alajuela',
    dateLabel: '3 oct',
    daysLeft: -4,
  },
  {
    labId: -72,
    employeeId: -6,
    nombre: 'Esteban Vargas Mena',
    puesto: 'Bodeguero',
    sucursal: 'Heredia',
    dateLabel: '15 oct',
    daysLeft: 8,
  },
  {
    labId: -73,
    employeeId: -11,
    nombre: 'Natalia Brenes Cruz',
    puesto: 'Cajera',
    sucursal: 'Heredia',
    dateLabel: '21 nov',
    daysLeft: 45,
  },
]

/** Mid-shift: in, break taken, out to lunch. */
export const DEMO_MY_DAY = describeMyDay({
  date: '',
  entrada: { time: '08:02' },
  inicioReceso: { time: '10:00' },
  finReceso: { time: '10:14' },
  inicioAlmuerzo: { time: '12:05' },
  finAlmuerzo: null,
  salida: null,
})
