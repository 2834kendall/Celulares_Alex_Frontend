import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { PostulacionPanel } from './PostulacionPanel'
import { savePostulacionScores } from '@/modules/recruitment/actions/savePostulacionScores'
import { advanceStage } from '@/modules/recruitment/actions/advanceStage'
import type { CriterioSeleccionItem, PostulacionDetalle } from '@/modules/recruitment/types'
import { chooseSelectMenuOption } from '@/test/selectMenu'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/recruitment/actions/savePostulacionScores', () => ({
  savePostulacionScores: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/advanceStage', () => ({ advanceStage: vi.fn() }))
vi.mock('@/modules/recruitment/actions/rejectPostulacion', () => ({ rejectPostulacion: vi.fn() }))

const criterios: CriterioSeleccionItem[] = [
  {
    id: 1,
    descripcion: 'Experiencia previa en ventas',
    areaId: 1,
    areaNombre: 'Experiencia',
    color: null,
    peso: 2,
  },
  { id: 2, descripcion: 'Actitud', areaId: 2, areaNombre: 'Actitud', color: null, peso: 1 },
]

const postulacion = {
  pos_id: 9,
  pos_estado_final: 'en_proceso',
  pos_fecha_postula: '2026-09-01',
  pos_fecha_cierre: null,
  pos_motivo_descarte: null,
  pos_observaciones: null,
  pos_puntaje_promedio: null,
  pos_empleado_id: null,
  puestoNombre: 'Vendedor',
  sucursalNombre: 'Centro',
  etapaActual: null,
  etapas: [],
  puntajes: [],
} as unknown as PostulacionDetalle

function renderPanel() {
  render(
    <PostulacionPanel
      candidatoId={3}
      postulacion={postulacion}
      etapas={[{ id: 5, nombre: 'Entrevista RRHH', orden: 1, fase: 2, color: null }]}
      criterios={criterios}
      canWrite
    />
  )
}

describe('<PostulacionPanel />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('el promedio se actualiza en vivo al calificar y avisa cambios sin guardar', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(screen.getByRole('button', { name: 'Guardar puntaje' })).toBeDisabled()

    const experiencia = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    const actitud = screen.getByRole('radiogroup', { name: 'Puntaje de Actitud' })
    await user.click(experiencia.querySelector('[aria-label="8"]')!)
    await user.click(actitud.querySelector('[aria-label="6"]')!)

    expect(screen.getByText(/Promedio: 7\/10/)).toBeInTheDocument()
    expect(screen.getByText('Cambios sin guardar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar puntaje' })).toBeEnabled()
  })

  it('guardar confirma con un toast y limpia el aviso de cambios', async () => {
    vi.mocked(savePostulacionScores).mockResolvedValue({ ok: true, promedio: 7 })
    const user = userEvent.setup()
    renderPanel()

    const experiencia = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    const actitud = screen.getByRole('radiogroup', { name: 'Puntaje de Actitud' })
    await user.click(experiencia.querySelector('[aria-label="8"]')!)
    await user.click(actitud.querySelector('[aria-label="No aplica"]')!)
    await user.click(screen.getByRole('button', { name: 'Guardar puntaje' }))

    expect(savePostulacionScores).toHaveBeenCalledWith({
      postulacionId: 9,
      puntajes: [
        { criterioId: 1, puntaje: 8, noAplica: false, observacion: null },
        { criterioId: 2, puntaje: null, noAplica: true, observacion: null },
      ],
    })
    expect(toast.success).toHaveBeenCalledWith('Puntaje guardado: 7/10.')
    expect(screen.queryByText('Cambios sin guardar')).not.toBeInTheDocument()
  })

  it('registrar etapa usa el resultado elegido y confirma con un toast', async () => {
    vi.mocked(advanceStage).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderPanel()

    await chooseSelectMenuOption(user, 'Avanzar a etapa', 'Entrevista RRHH')
    await user.click(screen.getByRole('radio', { name: 'Aprobado' }))
    await user.click(screen.getByRole('button', { name: 'Registrar etapa' }))

    expect(advanceStage).toHaveBeenCalledWith(
      expect.objectContaining({ postulacionId: 9, etapaId: 5, resultado: 'aprobado' })
    )
    expect(toast.success).toHaveBeenCalledWith('Etapa registrada: Entrevista RRHH.')
    expect(refresh).toHaveBeenCalled()
  })

  it('"Contratar" es un único enlace, no un botón dentro de un enlace', () => {
    renderPanel()
    const contratar = screen.getByRole('link', { name: /contratar/i })
    expect(contratar).toHaveAttribute('href', '/recruitment/candidates/3/hire?postulacionId=9')
    expect(contratar.querySelector('button')).toBeNull()
  })
})

describe('<PostulacionPanel /> — títulos de los criterios', () => {
  it('el nombre del criterio es el título; la descripción solo si agrega algo', () => {
    renderPanel()

    // Con descripción distinta y peso: ambos como ayuda.
    expect(screen.getByText('Experiencia')).toBeInTheDocument()
    expect(screen.getByText(/Experiencia previa en ventas · pesa ×2/)).toBeInTheDocument()

    // Descripción igual al nombre: no se repite.
    expect(screen.getAllByText('Actitud')).toHaveLength(1)
  })
})
