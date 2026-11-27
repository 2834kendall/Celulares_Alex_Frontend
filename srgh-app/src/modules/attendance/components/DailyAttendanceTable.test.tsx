import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DailyAttendanceTable } from './DailyAttendanceTable'
import type { DailyAttendanceRow } from '@/modules/attendance/actions/getDailyAttendance'

vi.mock('@/modules/attendance/actions/saveManualMark', () => ({ saveManualMark: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/attendance',
  useRouter: () => ({ push: vi.fn() }),
}))

function makeRow(overrides: Partial<DailyAttendanceRow> = {}): DailyAttendanceRow {
  return {
    status: { kind: 'en_jornada', tardiness: null, needsAttention: false },
    employmentHistoryId: 1,
    employeeId: 10,
    fullName: 'Ana Perez',
    fotoUrl: null,
    position: 'Cajera',
    branchId: 100,
    isDayOff: false,
    isHoliday: false,
    ausencia: null,
    expectedStart: '08:00',
    entrada: { id: 1, time: '08:04', diffMinutes: 4 },
    inicioReceso: null,
    finReceso: null,
    inicioAlmuerzo: null,
    finAlmuerzo: null,
    salida: null,
    blocks: [],
    scheduledBlocks: [],
    isSecondBlockJustified: false,
    duplicateMarksCount: 0,
    isOpen: true,
    tardiness: null,
    lunchTardiness: null,
    secondBlockTardiness: null,
    lunchExcessMinutes: null,
    breakExcessMinutes: null,
    ...overrides,
  }
}

function person(
  employmentHistoryId: number,
  fullName: string,
  kind: DailyAttendanceRow['status']['kind'],
  expectedStart: string | null = '08:00',
  needsAttention = false
) {
  return makeRow({
    employmentHistoryId,
    fullName,
    expectedStart,
    status: { kind, needsAttention, tardiness: null },
  })
}

const filterRows = [
  person(1, 'Ana Ruiz', 'sin_marcar', '08:00', true),
  person(2, 'Bruno Solís', 'sin_salida', '08:00', true),
  person(3, 'Carla Mora', 'en_jornada'),
  person(4, 'Diego Rojas', 'ya_salio', '08:00', true),
]

/**
 * Jsdom no aplica los breakpoints: consultar por rama evita mezclar
 * coincidencias de la lista móvil con las de la tabla de escritorio.
 */
function tabla() {
  return within(screen.getByRole('table'))
}

function cards() {
  return within(screen.getByRole('list'))
}

describe('<DailyAttendanceTable />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('muestra el estado vacio cuando no hay colaboradores', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[]} canWrite={true} />)

    expect(screen.getByText('No hay colaboradores activos en esta sucursal')).toBeInTheDocument()
  })

  it('shows the attention and total counts and filters both layouts', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={filterRows} canWrite />)
    const attention = screen.getByRole('button', { name: 'Requieren atención (3)' })
    const all = screen.getByRole('button', { name: 'Todos (4)' })

    expect(attention).toHaveAttribute('aria-pressed', 'true')
    expect(cards().getAllByRole('listitem')).toHaveLength(3)
    expect(tabla().queryByText('Carla Mora')).not.toBeInTheDocument()

    await userEvent.click(all)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(cards().getByText('Carla Mora')).toBeInTheDocument()
    expect(tabla().getByText('Carla Mora')).toBeInTheDocument()
  })

  it('switches to an indicator filter and restores the selected segment when cleared', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={filterRows} canWrite />)
    const all = screen.getByRole('button', { name: 'Todos (4)' })
    const missing = screen.getByRole('button', { name: 'Faltan 1' })
    expect(screen.getByRole('button', { name: 'Sin salida 1' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ya llegaron 2' })).toBeInTheDocument()
    await userEvent.click(all)

    await userEvent.click(missing)
    expect(missing).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Requieren atención (3)' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(cards().getAllByRole('listitem')).toHaveLength(1)
    expect(cards().getByText('Ana Ruiz')).toBeInTheDocument()
    expect(tabla().getByText('Ana Ruiz')).toBeInTheDocument()
    expect(tabla().getAllByRole('row')).toHaveLength(2)

    await userEvent.click(missing)
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(tabla().getByText('Bruno Solís')).toBeInTheDocument()

    await userEvent.click(missing)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro' }))
    expect(all).toHaveAttribute('aria-pressed', 'true')
    expect(all).toHaveFocus()
    expect(cards().getAllByRole('listitem')).toHaveLength(4)
  })

  it('starts on all when nobody needs attention and gives empty filters distinct messages', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite />)
    expect(screen.getByRole('button', { name: 'Todos (1)' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    await userEvent.click(screen.getByRole('button', { name: 'Requieren atención (0)' }))
    expect(screen.getByRole('status')).toHaveTextContent('Todo en orden')
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nadie necesita que hagás algo en este día.'
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Faltan 0' }))
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nadie falta por marcar la entrada este día.'
    )
  })

  it('resets pagination when switching between filters with multiple pages', async () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, index) =>
        person(index + 1, `Persona ${index + 1}`, 'sin_marcar', '08:00', true)
      ),
      person(13, 'Persona 13', 'en_jornada'),
    ]
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={rows} canWrite />)
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Todos (13)' }))
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    await userEvent.click(screen.getByRole('button', { name: 'Faltan 12' }))
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument()
  })

  it('only shows the pending notice with a positive count and links to the justification tab', () => {
    const props = { dateISO: '2026-07-25', rows: [makeRow()], canWrite: false }
    const { rerender } = render(<DailyAttendanceTable {...props} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<DailyAttendanceTable {...props} pendingCount={0} />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    rerender(<DailyAttendanceTable {...props} pendingCount={2} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Tenés 2 incidencias del mes por justificar.')
    expect(within(alert).getByRole('link', { name: 'Ver' })).toHaveAttribute(
      'href',
      '?tab=justificar'
    )
  })

  it('un dia de varios bloques muestra el rango de cada uno', () => {
    const row = makeRow({
      isOpen: false,
      blocks: [
        {
          entrada: { id: 1, time: '08:04', diffMinutes: null },
          salida: { id: 2, time: '12:00', diffMinutes: null },
        },
        {
          entrada: { id: 3, time: '13:00', diffMinutes: null },
          salida: { id: 4, time: '17:00', diffMinutes: null },
        },
      ],
    })

    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[row]} canWrite={true} />)

    const bloques = tabla().getByTitle('Bloques del día')
    expect(bloques).toHaveTextContent('08:04–12:00')
    expect(bloques).toHaveTextContent('13:00–17:00')
    expect(tabla().queryByText(/duplicada/)).not.toBeInTheDocument()
  })

  it('con el ultimo bloque abierto, el rango queda sin hora de salida', () => {
    const row = makeRow({
      status: { kind: 'sin_salida', tardiness: null, needsAttention: true },
      blocks: [
        {
          entrada: { id: 1, time: '08:04', diffMinutes: null },
          salida: { id: 2, time: '12:00', diffMinutes: null },
        },
        { entrada: { id: 3, time: '13:00', diffMinutes: null }, salida: null },
      ],
    })

    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[row]} canWrite={true} />)

    expect(tabla().getByTitle('Bloques del día')).toHaveTextContent('13:00–…')
    expect(tabla().getByText('Sin salida')).toBeInTheDocument()
  })

  it('un dia de un solo bloque no muestra el indicador de bloques', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    expect(tabla().queryByTitle('Bloques del día')).not.toBeInTheDocument()
  })

  const splitSchedule: DailyAttendanceRow['scheduledBlocks'] = [
    {
      inicio: '08:00',
      fin: '12:00',
      branchId: 100,
      branchName: 'Centro',
      entrada: null,
      salida: null,
    },
    {
      inicio: '18:00',
      fin: '23:00',
      branchId: 200,
      branchName: 'Norte',
      entrada: null,
      salida: null,
    },
  ]

  it('shows the second row and the expanded mobile section when two blocks are scheduled', async () => {
    const { rerender } = render(
      <DailyAttendanceTable
        dateISO="2026-07-25"
        rows={[makeRow({ scheduledBlocks: splitSchedule.slice(0, 1) })]}
        canWrite
      />
    )

    expect(tabla().queryByText('2.º bloque')).not.toBeInTheDocument()
    await userEvent.click(cards().getByRole('button', { name: 'Detalle de Ana Perez' }))
    expect(cards().queryByText('2.º bloque')).not.toBeInTheDocument()

    rerender(
      <DailyAttendanceTable
        dateISO="2026-07-25"
        rows={[makeRow({ scheduledBlocks: splitSchedule })]}
        canWrite
      />
    )

    expect(tabla().getByText('2.º bloque').closest('tr')).toHaveTextContent('18:00–23:00 · Norte')
    expect(cards().getByText('2.º bloque').closest('section')).toHaveTextContent(
      '18:00–23:00 · Norte'
    )
  })

  it.each([tabla, cards])(
    'adds the second entry with its scheduled date and time',
    async (view) => {
      render(
        <DailyAttendanceTable
          dateISO="2026-07-25"
          rows={[makeRow({ scheduledBlocks: splitSchedule })]}
          canWrite
        />
      )

      if (view === cards) {
        await userEvent.click(view().getByRole('button', { name: 'Detalle de Ana Perez' }))
      }
      await userEvent.click(
        view().getByRole('button', { name: 'Agregar marca de entrada del 2.º bloque' })
      )

      const modal = within(screen.getByRole('dialog'))
      expect(modal.getByRole('heading', { name: 'Agregar marca' })).toBeInTheDocument()
      expect(modal.getByText('Ana Perez — Entrada')).toBeInTheDocument()
      expect(modal.getByRole('combobox', { name: 'Fecha del evento' })).toHaveValue('25/07/2026')
      expect(modal.getByRole('button', { name: 'Hora real del evento: hora' })).toHaveTextContent(
        '18'
      )
      expect(
        modal.getByRole('button', { name: 'Hora real del evento: minutos' })
      ).toHaveTextContent('00')
    }
  )

  it('shows second-block lateness beside the second entry and lets the entry open correction', async () => {
    const row = makeRow({
      scheduledBlocks: [
        splitSchedule[0],
        { ...splitSchedule[1], entrada: { id: 3, time: '18:12', diffMinutes: 12 } },
      ],
      secondBlockTardiness: {
        tipo: { nombre: 'Tardía grave', color: '#E11D48' },
        diffMinutes: 12,
        isJustified: true,
        justification: 'Fallo del sistema',
      },
    })
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[row]} canWrite />)

    const secondRow = within(tabla().getByText('2.º bloque').closest('tr')!)
    expect(
      secondRow.getByRole('button', { name: /llegó 12 min tarde.*Fallo del sistema/ })
    ).toBeInTheDocument()
    await userEvent.click(cards().getByRole('button', { name: 'Detalle de Ana Perez' }))
    expect(cards().getByText(/Tardía grave.*justificada/)).toBeInTheDocument()
    await userEvent.click(
      secondRow.getByRole('button', { name: 'Corregir marca de entrada del 2.º bloque' })
    )
    expect(screen.getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
  })

  it('lista un colaborador con su entrada y el estado de jornada abierta', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    expect(tabla().getByText('Ana Perez')).toBeInTheDocument()
    expect(tabla().getByText('08:04')).toBeInTheDocument()
    expect(tabla().getByText('En jornada')).toBeInTheDocument()
  })

  it('shows the mobile summary first and the six mark labels on expansion', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    expect(cards().getByText('Ana Perez')).toBeInTheDocument()
    expect(cards().getByText('Entró 08:04')).toBeInTheDocument()
    expect(cards().getByText('En jornada')).toBeInTheDocument()
    expect(cards().queryByText('Inicio almuerzo')).not.toBeInTheDocument()

    await userEvent.click(cards().getByRole('button', { name: 'Detalle de Ana Perez' }))
    for (const label of [
      'Entrada',
      'Inicio receso',
      'Fin receso',
      'Inicio almuerzo',
      'Fin almuerzo',
      'Salida',
    ]) {
      expect(cards().getByText(label)).toBeInTheDocument()
    }
  })

  it('sorts the full mobile list by attention, group, time and name while keeping desktop order', async () => {
    const rows = [
      person(1, 'Libre', 'libre', null),
      person(2, 'Ya salió', 'ya_salio', '07:00'),
      person(3, 'Por llegar', 'por_llegar', '09:00'),
      person(4, 'Zoe', 'en_jornada', '08:00'),
      person(5, 'Ana', 'en_jornada', '08:00'),
      person(6, 'Con tardía', 'ya_salio', '10:00', true),
      person(7, 'Pendiente', 'sin_marcar', '08:00', true),
      person(8, 'Justificada', 'justificada', '06:00'),
      person(9, 'Sin horario', 'sin_programacion', null),
      person(10, 'Sin salida', 'sin_salida', '09:00', true),
      person(11, 'Primero', 'sin_marcar', '06:30', true),
    ]
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={rows} canWrite={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Todos (11)' }))

    const mobileNames = cards()
      .getAllByRole('button', { name: /^Detalle de/ })
      .map((button) => button.getAttribute('aria-label'))
    expect(mobileNames).toEqual(
      [
        'Primero',
        'Pendiente',
        'Sin salida',
        'Con tardía',
        'Ana',
        'Zoe',
        'Por llegar',
        'Justificada',
        'Ya salió',
        'Libre',
      ].map((name) => `Detalle de ${name}`)
    )
    const desktopNames = tabla()
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[0].querySelector('p')?.textContent)
    expect(desktopNames).toEqual(rows.slice(0, 10).map(({ fullName }) => fullName))
  })

  it('oculta los botones de corregir/agregar marca cuando canWrite es false', () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={false} />)

    expect(screen.queryByLabelText('Corregir marca')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Agregar marca')).not.toBeInTheDocument()
  })

  it('abre el modal de correccion con los datos de la marca existente', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    await userEvent.click(tabla().getByLabelText('Corregir marca'))

    const modal = screen.getByRole('dialog')
    expect(within(modal).getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
    expect(within(modal).getByText(/Ana Perez/)).toBeInTheDocument()
  })

  describe('dia de varios bloques', () => {
    const dosBloques = makeRow({
      isOpen: false,
      entrada: { id: 1, time: '08:04', diffMinutes: 4 },
      salida: { id: 4, time: '17:00', diffMinutes: null },
      blocks: [
        {
          entrada: { id: 1, time: '08:04', diffMinutes: null },
          salida: { id: 2, time: '12:00', diffMinutes: null },
        },
        {
          entrada: { id: 3, time: '13:00', diffMinutes: null },
          salida: { id: 4, time: '17:00', diffMinutes: null },
        },
      ],
    })

    it('permite corregir la marca de un bloque intermedio', async () => {
      render(<DailyAttendanceTable dateISO="2026-07-25" rows={[dosBloques]} canWrite={true} />)

      // La salida de las 12:00 y la entrada de las 13:00 no estan en la fila:
      // solo se alcanzan desde el indicador de bloques.
      await userEvent.click(tabla().getByLabelText('Corregir salida de las 12:00'))

      const modal = screen.getByRole('dialog')
      expect(within(modal).getByRole('heading', { name: 'Corregir marca' })).toBeInTheDocument()
      expect(within(modal).getByText(/Salida/)).toBeInTheDocument()
    })

    it('sin permiso de escritura las horas del bloque no son botones', () => {
      render(<DailyAttendanceTable dateISO="2026-07-25" rows={[dosBloques]} canWrite={false} />)

      expect(tabla().queryByLabelText('Corregir salida de las 12:00')).not.toBeInTheDocument()
      expect(tabla().getByTitle('Bloques del día')).toHaveTextContent('13:00–17:00')
    })
  })

  it('abre el modal de agregar marca cuando la celda esta vacia', async () => {
    render(<DailyAttendanceTable dateISO="2026-07-25" rows={[makeRow()]} canWrite={true} />)

    // Todo menos la entrada viene null en makeRow(): esas celdas muestran
    // "Agregar marca", se toma la primera.
    await userEvent.click(tabla().getAllByLabelText('Agregar marca')[0])

    expect(screen.getByRole('heading', { name: 'Agregar marca' })).toBeInTheDocument()
  })
})
