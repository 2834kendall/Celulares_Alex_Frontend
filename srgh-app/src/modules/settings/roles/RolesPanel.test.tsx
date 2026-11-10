import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RolesPanel } from './RolesPanel'
import type { RoleSummary, RolesSettings } from './types'

const rol = (id: number, nombre: string, sistema: boolean): RoleSummary => ({
  id,
  nombre,
  descripcion: null,
  sistema,
  asignable: true,
  permisos: [],
  usuarios: 0,
})

const data: RolesSettings = {
  // Todos los roles son de la empresa (las copias de las plantillas incluidas).
  propios: [
    rol(1, 'Administrador de Empresa', false),
    rol(9, 'Auditor Interno', false),
    rol(40, 'Supervisor de Tienda', false),
  ],
  // El único sin empresa que llega a la pantalla: el del kiosco.
  sistema: [{ ...rol(13, 'Kiosco de asistencia', true), asignable: false }],
  actorRolId: 1,
  actorPermisos: [],
}

const buscar = () => screen.getByRole('searchbox', { name: 'Buscar rol' })

const nombres = () =>
  within(screen.getByRole('list', { name: 'Roles' }))
    .getAllByRole('listitem')
    .map((li) => within(li).getAllByText(/./)[0].textContent)

describe('RolesPanel', () => {
  it('lista los roles de la empresa y al final el del kiosco', () => {
    render(<RolesPanel data={data} />)
    expect(nombres()).toEqual([
      'Administrador de Empresa',
      'Auditor Interno',
      'Supervisor de Tienda',
      'Kiosco de asistencia',
    ])
  })

  it('un rol de la empresa se abre y se duplica; el del kiosco solo se ve', () => {
    render(<RolesPanel data={data} />)
    expect(screen.getByRole('link', { name: 'Auditor Interno' })).toHaveAttribute(
      'href',
      '/settings/roles/9'
    )
    expect(screen.getByRole('link', { name: 'Duplicar Auditor Interno' })).toHaveAttribute(
      'href',
      '/settings/roles/new?desde=9'
    )
    const kiosco = screen.getByText('Kiosco de asistencia').closest('li') as HTMLElement
    expect(within(kiosco).getByText('No asignable')).toBeInTheDocument()
    expect(within(kiosco).getByRole('link', { name: 'Ver permisos' })).toHaveAttribute(
      'href',
      '/settings/roles/13'
    )
    expect(within(kiosco).queryByRole('link', { name: /Duplicar/ })).not.toBeInTheDocument()
  })

  it('no hay filtro por sucursal: los roles valen para toda la empresa', () => {
    render(<RolesPanel data={data} />)
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    expect(screen.queryByText('Toda la empresa')).not.toBeInTheDocument()
  })

  it('filtra por nombre sin distinguir mayúsculas ni tildes', async () => {
    render(<RolesPanel data={data} />)
    await userEvent.type(buscar(), 'AUDÍTOR')
    expect(nombres()).toEqual(['Auditor Interno'])
  })

  it('avisa cuando ningún rol coincide', async () => {
    render(<RolesPanel data={data} />)
    await userEvent.type(buscar(), 'contador')
    expect(screen.getByRole('status')).toHaveTextContent('Ningún rol se llama así')
    expect(screen.queryByRole('list', { name: 'Roles' })).not.toBeInTheDocument()
  })
})
