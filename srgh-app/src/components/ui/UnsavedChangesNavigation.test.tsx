import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { useRouter } from 'next/navigation'
import { UnsavedChangesProvider } from './UnsavedChangesProvider'
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges'

/** Exercise the actual adapter lifecycle, not a mocked confirmation hook. */
function setup() {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }
  function Editor() {
    const navigation = useRouter()
    const [name, setName] = useState('')
    const guard = useUnsavedChanges({ label: 'la sucursal', value: name })
    return (
      <div ref={(element) => guard.bindRoot(element)}>
        <input aria-label="Nombre" value={name} onChange={(e) => setName(e.target.value)} />
        <button onClick={() => navigation.push('/settings/branches')}>Volver al listado</button>
      </div>
    )
  }
  render(
    <AppRouterContext.Provider value={router}>
      <UnsavedChangesProvider>
        <Editor />
      </UnsavedChangesProvider>
    </AppRouterContext.Provider>
  )
  return { router, user: userEvent.setup() }
}

describe('real App Router guard integration', () => {
  it('completes an accepted navigation exactly once after cleaning the baseline', async () => {
    const { router, user } = setup()
    await user.type(screen.getByLabelText('Nombre'), 'Cambio pendiente')
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }))
    expect(router.push).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/settings/branches'))
    expect(router.push).toHaveBeenCalledTimes(1)
  })
  it('keeps the original data after rejection and accepts a subsequent attempt', async () => {
    const { router, user } = setup()
    await user.type(screen.getByLabelText('Nombre'), 'Centro')
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }))
    await user.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Nombre')).toHaveValue('Centro')
    await user.click(screen.getByRole('button', { name: 'Volver al listado' }))
    await user.click(screen.getByRole('button', { name: 'Salir sin guardar' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1))
  })
})
