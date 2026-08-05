import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EmployeeProfileTabs, resolveProfileTab } from './EmployeeProfileTabs'

const push = vi.fn()
let searchString = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/employees/10',
  useSearchParams: () => new URLSearchParams(searchString),
}))

function renderTabs(documentosContent: React.ReactNode | null = <div>Contenido documentos</div>) {
  return render(
    <EmployeeProfileTabs
      perfilContent={<div>Contenido perfil</div>}
      documentosContent={documentosContent}
    />
  )
}

describe('resolveProfileTab', () => {
  it('devuelve perfil por defecto', () => {
    expect(resolveProfileTab(null, true)).toBe('perfil')
    expect(resolveProfileTab('inexistente', true)).toBe('perfil')
  })

  it('devuelve documentos solo si el param coincide y hay documentos', () => {
    expect(resolveProfileTab('documentos', true)).toBe('documentos')
  })

  // Sin DOCUMENTOS_READ el tab no existe: forzar ?tab=documentos en la URL no
  // debe dejar la ficha en un estado donde el botón Editar quede oculto.
  it('ignora ?tab=documentos si el rol no puede ver documentos', () => {
    expect(resolveProfileTab('documentos', false)).toBe('perfil')
  })
})

describe('<EmployeeProfileTabs />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchString = ''
  })

  it('sin parámetro "tab" muestra el perfil como pestaña activa por defecto', () => {
    renderTabs()

    expect(screen.getByText('Contenido perfil')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Perfil/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('muestra el contenido de documentos cuando ?tab=documentos', () => {
    searchString = 'tab=documentos'
    renderTabs()

    expect(screen.getByText('Contenido documentos')).toBeInTheDocument()
    expect(screen.queryByText('Contenido perfil')).not.toBeInTheDocument()
  })

  it('cae de vuelta al perfil si el tab de la url es inválido', () => {
    searchString = 'tab=inexistente'
    renderTabs()

    expect(screen.getByText('Contenido perfil')).toBeInTheDocument()
  })

  it('al hacer click en una pestaña navega agregando el query param', async () => {
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Documentos/ }))

    expect(push).toHaveBeenCalledWith('/employees/10?tab=documentos')
  })

  it('al volver a la pestaña perfil quita el query param', async () => {
    searchString = 'tab=documentos'
    renderTabs()

    await userEvent.click(screen.getByRole('tab', { name: /Perfil/ }))

    expect(push).toHaveBeenCalledWith('/employees/10')
  })

  it('sin permiso de documentos (contenido null) no renderiza tabs', () => {
    renderTabs(null)

    expect(screen.getByText('Contenido perfil')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })
})
