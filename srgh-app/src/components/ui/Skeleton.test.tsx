import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PageSkeleton, Skeleton, SkeletonRegion, TableSkeleton, TabsSkeleton } from './Skeleton'

describe('Skeleton', () => {
  it('es decorativo: no lo leen los lectores de pantalla', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />)

    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(container.firstElementChild).toHaveClass('skeleton', 'rounded-md')
  })

  it('el redondeo se elige aparte, sin competir con el de por defecto', () => {
    const { container } = render(<Skeleton rounded="rounded-full" />)

    expect(container.firstElementChild).toHaveClass('rounded-full')
    expect(container.firstElementChild).not.toHaveClass('rounded-md')
  })

  it('SkeletonRegion se anuncia una sola vez como "Cargando…"', () => {
    render(
      <SkeletonRegion>
        <Skeleton />
      </SkeletonRegion>
    )

    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-busy', 'true')
    expect(region).toHaveTextContent('Cargando…')
  })

  it('PageSkeleton muestra la flecha de volver solo con back', () => {
    const { container, rerender } = render(<PageSkeleton />)
    const circles = () => container.querySelectorAll('.rounded-full.skeleton')
    expect(circles()).toHaveLength(0)

    rerender(<PageSkeleton back />)
    expect(circles()).toHaveLength(1)
  })

  it('TabsSkeleton dibuja tantas pestañas como se piden', () => {
    const { container } = render(<TabsSkeleton count={3} />)

    expect(container.querySelectorAll('.skeleton')).toHaveLength(3)
  })

  it('TableSkeleton sin toolbar no dibuja barra de filtros', () => {
    const { container, rerender } = render(<TableSkeleton rows={2} columns={3} />)
    const toolbarBlocks = () => container.querySelectorAll('.rounded-xl.skeleton')
    expect(toolbarBlocks()).toHaveLength(0)

    rerender(<TableSkeleton rows={2} columns={3} toolbar={2} />)
    // Buscador + 2 selects.
    expect(toolbarBlocks()).toHaveLength(3)
  })
})
