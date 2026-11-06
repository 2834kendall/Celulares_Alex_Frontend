import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BranchesPanel } from './BranchesPanel'
import type { BranchSettings } from './types'
describe('branch listing', () => {
  it('finds inactive branches by code and retains their detail links', async () => {
    const data = {
      branches: [
        { suc_id: 10, suc_nombre: 'Centro', suc_codigo_interno: 'CEN', suc_activa: true },
        { suc_id: 20, suc_nombre: 'Norte', suc_codigo_interno: 'NOR', suc_activa: false },
      ],
      kiosks: [],
      legacy: [],
      audit: [],
      canManageKiosks: true,
    } as unknown as BranchSettings
    render(<BranchesPanel data={data} />)
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Estado de la sucursal' }),
      'inactivas'
    )
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar sucursal' }), 'nor')
    expect(screen.getByRole('link', { name: /Norte/ })).toHaveAttribute(
      'href',
      '/settings/branches/20'
    )
    expect(screen.queryByRole('link', { name: /Centro/ })).not.toBeInTheDocument()
  })
})
