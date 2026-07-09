export function getWeekDates(anyDateISO: string): string[] {
  const d = new Date(anyDateISO + 'T00:00:00')
  const day = d.getDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  const monday = new Date(d)
  monday.setDate(d.getDate() + diffToMonday)

  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday)
    dt.setDate(monday.getDate() + i)
    return dt.toISOString().slice(0, 10)
  })
}

export function currentMondayISO(): string {
  const now = new Date()
  const day = now.getDay()
  const diff = day === 0 ? -6 : 1 - day
  now.setDate(now.getDate() + diff)
  return now.toISOString().slice(0, 10)
}

export const DIAS_SEMANA = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
]
