import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeDetail } from './EmployeeDetail'
import { BANCOS, EMPLEADO_DETALLE, TERRITORIO, TIPOS_IDENTIFICACION } from './testFixtures'

// EmployeeDetail lee ?tab= (y monta EmployeeProfileTabs, que además navega):
// el mock debe cubrir las tres APIs o TODOS los tests del archivo revientan.
const push = vi.fn()
let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => '/employees/1',
  useSearchParams: () => new URLSearchParams(searchString),
}))

vi.mock('@/modules/employees/actions/updateEmployee', () => ({
  updateEmployee: vi.fn(),
}))

// EmployeeDetail renderiza EmployeePhotoModal (aunque cerrado por defecto),
// que importa estas actions — mockeadas para no cargar @/lib/supabase/server
// real (valida env vars al importarse) y para no arrastrar next/navigation.
vi.mock('@/modules/employees/actions/setEmployeePhoto', () => ({
  setEmployeePhoto: vi.fn(),
}))
vi.mock('@/modules/employees/actions/removeEmployeePhoto', () => ({
  removeEmployeePhoto: vi.fn(),
}))

// EmployeeDetail renderiza EmployeeDocumentsSection cuando documentos no es
// null — mockeadas por la misma razón que las de foto arriba.
vi.mock('@/modules/employees/actions/addEmployeeDocument', () => ({
  addEmployeeDocument: vi.fn(),
}))
vi.mock('@/modules/employees/actions/updateEmployeeDocument', () => ({
  updateEmployeeDocument: vi.fn(),
}))
vi.mock('@/modules/employees/actions/deleteEmployeeDocument', () => ({
  deleteEmployeeDocument: vi.fn(),
}))
vi.mock('@/modules/employees/actions/getEmployeeDocumentDownloadUrl', () => ({
  getEmployeeDocumentDownloadUrl: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}))

describe('<EmployeeDetail />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchString = ''
  })

  it('muestra la ficha completa con el contrato vigente', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.getByRole('heading', { name: 'Ana Mora' })).toBeInTheDocument()
    expect(screen.getByText('Activo')).toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()
    expect(screen.getByText('Central')).toBeInTheDocument()
    expect(screen.getByText('Diurna')).toBeInTheDocument()
    expect(screen.getByText('Femenino')).toBeInTheDocument()
    expect(screen.getByText('ana@mail.com')).toBeInTheDocument()
    // El banco se muestra por nombre (join al catálogo), no por id.
    expect(screen.getByText('BAC Credomatic')).toBeInTheDocument()
  })

  it('muestra la dirección resuelta hasta provincia y su código postal', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    // Provincia y cantón no se guardan en la fila: llegan por el join.
    expect(screen.getByText('10201')).toBeInTheDocument()
    expect(screen.getByText('200 m norte de la iglesia')).toBeInTheDocument()
  })

  // La columna ya es NOT NULL, pero el view model admite null por si el join
  // no resuelve la fila; la ficha no debe romperse por eso.
  it('tolera un empleado sin dirección resuelta', () => {
    render(
      <EmployeeDetail
        empleado={{ ...EMPLEADO_DETALLE, direccion: null }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.getByRole('heading', { name: 'Dirección' })).toBeInTheDocument()
    expect(screen.queryByText('200 m norte de la iglesia')).not.toBeInTheDocument()
  })

  it('muestra aviso cuando no hay contrato vigente', () => {
    render(
      <EmployeeDetail
        empleado={{ ...EMPLEADO_DETALLE, historial_activo: null }}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.getByText('Sin contrato vigente')).toBeInTheDocument()
    expect(screen.getByText(/no tiene un contrato vigente/i)).toBeInTheDocument()
  })

  it('oculta el botón Editar sin canWrite', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite={false}
      />
    )

    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
  })

  it('alterna entre modo lectura y edición', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    // Nombre exacto: con la foto ahora también hay un botón "Editar foto",
    // que /editar/i matchearía igual.
    await user.click(screen.getByRole('button', { name: 'Editar' }))

    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Nombre *')).toHaveValue('Ana')

    await user.click(screen.getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByRole('button', { name: /guardar cambios/i })).not.toBeInTheDocument()
    expect(screen.getByText('Cajera')).toBeInTheDocument()
  })

  it('muestra el avatar con iniciales cuando el empleado no tiene foto', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.getByText('AM')).toBeInTheDocument()
  })

  it('oculta el botón de editar foto sin canWrite', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite={false}
      />
    )

    expect(screen.queryByRole('button', { name: /editar foto/i })).not.toBeInTheDocument()
  })

  it('fuera de modo edición no hay botón de editar foto, aunque canWrite sea true', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.queryByRole('button', { name: /editar foto/i })).not.toBeInTheDocument()
  })

  it('el botón de editar foto solo aparece DENTRO de modo edición', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    await user.click(screen.getByRole('button', { name: 'Editar' }))

    expect(screen.getByRole('button', { name: /editar foto/i })).toBeInTheDocument()
  })

  it('abre y cierra el modal de foto desde el botón de cámara, en modo edición', async () => {
    const user = userEvent.setup()
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    await user.click(screen.getByRole('button', { name: 'Editar' }))
    await user.click(screen.getByRole('button', { name: /editar foto/i }))
    expect(screen.getByText('Foto del colaborador')).toBeInTheDocument()

    // Hay dos "Cancelar" en pantalla (el de la ficha y el del modal de foto):
    // se acota al dialog para cerrar solo el modal de foto.
    const photoDialog = screen.getByRole('dialog')
    await user.click(within(photoDialog).getByRole('button', { name: /cancelar/i }))

    expect(screen.queryByText('Foto del colaborador')).not.toBeInTheDocument()
    // Cerrar el modal de foto no debe sacarnos del modo edición de la ficha.
    expect(screen.getByRole('button', { name: /guardar cambios/i })).toBeInTheDocument()
  })

  it('muestra el cumpleaños como dia y mes, aparte de la fecha de nacimiento', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    // El fixture nace el 1990-05-10.
    expect(screen.getByText('Cumpleaños')).toBeInTheDocument()
    expect(screen.getByText('10 de mayo')).toBeInTheDocument()
    expect(screen.getByText('10/05/1990')).toBeInTheDocument()
    expect(screen.queryByText('Hoy')).not.toBeInTheDocument()
  })

  it('el dia del cumpleaños marca la pastilla "Hoy"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-05-10T09:00:00'))

    try {
      render(
        <EmployeeDetail
          empleado={EMPLEADO_DETALLE}
          tiposIdentificacion={TIPOS_IDENTIFICACION}
          bancos={BANCOS}
          territorio={TERRITORIO}
          canWrite
        />
      )

      // La pastilla se resuelve en un efecto (evita el mismatch de hidratacion),
      // asi que aparece despues del primer render.
      expect(await screen.findByText('Hoy')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('sin la prop documentos (default null) no hay tabs: la ficha se ve como antes', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
      />
    )

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datos personales' })).toBeInTheDocument()
  })

  it('con documentos muestra los tabs Perfil | Documentos', () => {
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
        documentos={[]}
      />
    )

    expect(screen.getByRole('tab', { name: /Perfil/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /Documentos/ })).toBeInTheDocument()
    // El perfil sigue siendo el tab por defecto.
    expect(screen.getByRole('heading', { name: 'Datos personales' })).toBeInTheDocument()
  })

  it('en el tab de documentos se ve el expediente y NO las secciones del perfil', () => {
    searchString = 'tab=documentos'
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
        documentos={[]}
      />
    )

    expect(screen.getByText(/todavía no tiene documentos/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Datos personales' })).not.toBeInTheDocument()
  })

  // El botón "Editar" gobierna el formulario del perfil: dejarlo visible desde
  // el tab de documentos no tendría a qué aplicar.
  it('el botón Editar solo aparece en el tab de perfil', () => {
    searchString = 'tab=documentos'
    render(
      <EmployeeDetail
        empleado={EMPLEADO_DETALLE}
        tiposIdentificacion={TIPOS_IDENTIFICACION}
        bancos={BANCOS}
        territorio={TERRITORIO}
        canWrite
        documentos={[]}
      />
    )

    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument()
  })
})
