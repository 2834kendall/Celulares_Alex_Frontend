import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BirthdaysPanel } from './BirthdaysPanel'
import type { UpcomingBirthday } from '../lib/birthdays'

// The panel's behavior does not depend on the decorative scene's physics.
vi.mock('./BirthdayCake', () => ({
  BirthdayCake: ({ party }: { party: boolean }) => <div data-testid="cake" data-party={party} />,
}))
const birthday = (id: number, patch: Partial<UpcomingBirthday> = {}): UpcomingBirthday => ({
  id,
  nombre: `Persona ${id}`,
  puesto: 'Ventas',
  sucursal: 'Central',
  fotoUrl: null,
  month: 11,
  day: id + 1,
  daysUntil: id,
  dateLabel: `${id + 1} nov`,
  weekday: 'lunes',
  ...patch,
})
const people = Array.from({ length: 7 }, (_, index) => birthday(index + 1))
const props = { birthdays: people, canSee: true, todayMonth: 11, canOpenProfiles: true }
const scroll = vi.fn()
const writeText = vi.fn()
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  )
  vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(scroll)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  writeText.mockResolvedValue(undefined)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard)
  else Reflect.deleteProperty(navigator, 'clipboard')
})
const row = (name = 'Persona 1') => screen.getByText(name).closest('li')!
async function expand() {
  await userEvent.click(screen.getByRole('button', { name: 'Ver todos' }))
}

describe('birthday dashboard interactions', () => {
  it('does not expose people or controls when employee access is unavailable', () => {
    render(<BirthdaysPanel {...props} canSee={false} />)
    expect(screen.getByText(/Tu rol no tiene acceso/)).toBeInTheDocument()
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('explains missing birth dates without offering expansion', () => {
    render(<BirthdaysPanel {...props} birthdays={[]} />)
    expect(
      screen.getByText('Todavía no hay fechas de nacimiento cargadas en los expedientes.')
    ).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
  it('starts with two rows and expands to five, then all, then five again', async () => {
    render(<BirthdaysPanel {...props} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    await expand()
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'auto' })
    await userEvent.click(screen.getByRole('button', { name: 'Ver todos (7)' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: 'Reducir' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
  it('filters by month, orders by birthday day and explains empty months', async () => {
    render(
      <BirthdaysPanel
        {...props}
        birthdays={[birthday(1, { day: 20 }), birthday(2, { day: 5 }), birthday(3, { month: 12 })]}
      />
    )
    await expand()
    await userEvent.click(screen.getByRole('tab', { name: 'Por mes' }))
    expect(screen.getByRole('button', { name: 'noviembre: 2 cumpleaños' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    expect(
      screen.getAllByRole('listitem').map((node) => within(node).getByText(/Persona/).textContent)
    ).toEqual(['Persona 2', 'Persona 1'])
    await userEvent.click(screen.getByRole('button', { name: 'diciembre: 1 cumpleaños' }))
    expect(screen.getByText('Persona 3')).toBeInTheDocument()
    expect(screen.queryByText('Persona 1')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'enero: 0 cumpleaños' }))
    expect(screen.getByText('Nadie cumple años en enero.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: 'Próximos' }))
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
  it('opens one person at a time and removes collapsed actions from keyboard tab order', async () => {
    render(<BirthdaysPanel {...props} />)
    const first = within(row()).getByRole('button', { expanded: false })
    const second = within(row('Persona 2')).getByRole('button', { expanded: false })
    expect(within(row()).getByRole('link')).toHaveAttribute('tabindex', '-1')
    await userEvent.click(first)
    expect(first).toHaveAttribute('aria-expanded', 'true')
    expect(within(row()).getByRole('link', { name: 'Ver perfil' })).toHaveAttribute(
      'href',
      '/employees/1'
    )
    expect(within(row()).getByRole('link')).toHaveAttribute('tabindex', '0')
    await userEvent.click(second)
    expect(first).toHaveAttribute('aria-expanded', 'false')
    expect(second).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(second)
    expect(second).toHaveAttribute('aria-expanded', 'false')
  })
  it('does not offer profile navigation for sample data', async () => {
    render(<BirthdaysPanel {...props} canOpenProfiles={false} />)
    await userEvent.click(within(row()).getByRole('button', { expanded: false }))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
  it('uses a fallback when position and branch are absent', () => {
    render(
      <BirthdaysPanel {...props} birthdays={[birthday(1, { puesto: null, sucursal: null })]} />
    )
    expect(screen.getByText('Sin puesto asignado')).toBeInTheDocument()
  })
  it.each([1, 2])('announces birthdays today with singular/plural text (%s)', (count) => {
    render(
      <BirthdaysPanel
        {...props}
        birthdays={Array.from({ length: count }, (_, i) =>
          birthday(i + 1, { nombre: ['Ana Prueba', 'Luis Prueba'][i], daysUntil: 0 })
        )}
      />
    )
    expect(
      screen.getByText(count === 1 ? 'Ana cumple años' : 'Ana, Luis cumplen años')
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Celebrar' }))
    expect(screen.getByTestId('cake')).toHaveAttribute('data-party', 'true')
  })
  it('remembers congratulations per person and clears the party timer', () => {
    vi.useFakeTimers()
    render(<BirthdaysPanel {...props} />)
    fireEvent.click(within(row()).getByRole('button', { expanded: false }))
    fireEvent.click(within(row()).getByRole('button', { name: 'Felicitar' }))
    expect(within(row()).getByRole('button', { name: 'Felicitado' })).toBeInTheDocument()
    expect(within(row('Persona 2')).getByRole('button', { name: 'Felicitar' })).toBeInTheDocument()
    expect(screen.getByTestId('cake')).toHaveAttribute('data-party', 'true')
    act(() => vi.advanceTimersByTime(1700))
    expect(screen.getByTestId('cake')).toHaveAttribute('data-party', 'false')
  })
  it('copies a first-name greeting and confirms it only after clipboard success', async () => {
    render(
      <BirthdaysPanel {...props} birthdays={[birthday(1, { nombre: '  Ana Maria Prueba' })]} />
    )
    const item = row('Ana Maria Prueba')
    fireEvent.click(within(item).getByRole('button', { expanded: false }))
    await act(async () =>
      fireEvent.click(within(item).getByRole('button', { name: 'Copiar mensaje' }))
    )
    expect(writeText).toHaveBeenCalledExactlyOnceWith(
      '¡Feliz cumpleaños, Ana! Que tengas un gran día.'
    )
    expect(within(item).getByRole('button', { name: 'Copiado' })).toBeInTheDocument()
  })
  it.each(['missing', 'denied'])(
    'never claims a successful copy when clipboard is %s',
    async (mode) => {
      if (mode === 'missing')
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
      else writeText.mockRejectedValueOnce(new Error('permission denied'))
      render(<BirthdaysPanel {...props} />)
      fireEvent.click(within(row()).getByRole('button', { expanded: false }))
      await act(async () =>
        fireEvent.click(within(row()).getByRole('button', { name: 'Copiar mensaje' }))
      )
      expect(screen.queryByRole('button', { name: 'Copiado' })).not.toBeInTheDocument()
    }
  )
})
