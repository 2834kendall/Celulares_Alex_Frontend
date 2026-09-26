import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { PostulacionPanel } from './PostulacionPanel'
import { savePostulacionScores } from '@/modules/recruitment/actions/savePostulacionScores'
import { advanceStage } from '@/modules/recruitment/actions/advanceStage'
import type { CriterioSeleccionItem, PostulacionDetalle } from '@/modules/recruitment/types'

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

    expect(screen.getByRole('img', { name: /Promedio 7 de 10/ })).toBeInTheDocument()
    expect(screen.getByText('2 de 2 calificados')).toBeInTheDocument()
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

    // Un toque abre la ventana con la siguiente etapa ya elegida.
    await user.click(screen.getByRole('button', { name: /Avanzar a: Entrevista RRHH/ }))
    expect(screen.getByLabelText('Etapa')).toHaveTextContent('Entrevista RRHH')
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

describe('<PostulacionPanel /> — postulación cerrada', () => {
  it('descartada y sin puntaje: no muestra la escala ni las acciones', () => {
    render(
      <PostulacionPanel
        candidatoId={3}
        postulacion={
          {
            ...postulacion,
            pos_estado_final: 'descartado',
            pos_motivo_descarte: 'No aplica',
          } as PostulacionDetalle
        }
        etapas={[]}
        criterios={criterios}
        canWrite
      />
    )

    expect(screen.queryByRole('radiogroup', { name: /Puntaje de/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /contratar/i })).not.toBeInTheDocument()
  })

  it('descartada con puntaje: la escala queda de solo lectura', () => {
    render(
      <PostulacionPanel
        candidatoId={3}
        postulacion={
          {
            ...postulacion,
            pos_estado_final: 'descartado',
            puntajes: [
              {
                criterioId: 1,
                criterioDescripcion: 'Experiencia previa en ventas',
                areaNombre: 'Experiencia',
                color: null,
                peso: 2,
                puntaje: 8,
                noAplica: false,
                observacion: null,
              },
            ],
          } as unknown as PostulacionDetalle
        }
        etapas={[]}
        criterios={criterios}
        canWrite
      />
    )

    const escala = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    expect(escala.querySelector('[aria-label="8"]')).toHaveAttribute('aria-checked', 'true')
    expect(escala.querySelector('[aria-label="8"]')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Guardar puntaje' })).not.toBeInTheDocument()
  })
})

describe('<PostulacionPanel /> — etapas y secciones', () => {
  const entrevista = { id: 5, nombre: 'Entrevista RRHH', orden: 30, fase: 2 as const, color: null }
  const prueba = { id: 6, nombre: 'Prueba práctica', orden: 31, fase: 2 as const, color: '#1e3a8a' }
  const decision = {
    id: 7,
    nombre: 'Pendiente de decisión',
    orden: 1,
    fase: 3 as const,
    color: null,
  }

  function renderEnPrueba() {
    render(
      <PostulacionPanel
        candidatoId={3}
        postulacion={{ ...postulacion, etapaActual: prueba } as PostulacionDetalle}
        etapas={[decision, prueba, entrevista]}
        criterios={criterios}
        canWrite
      />
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('solo ofrece etapas posteriores a la actual', async () => {
    const user = userEvent.setup()
    renderEnPrueba()

    await user.click(screen.getByRole('button', { name: /Avanzar a: Pendiente de decisión/ }))
    await user.click(screen.getByLabelText('Etapa'))

    const opciones = screen.getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Pendiente de decisión'])
  })

  it('la barra de pasos marca la etapa actual y nombra la siguiente', () => {
    renderEnPrueba()

    expect(
      screen.getByText('Prueba práctica', { selector: 'span.font-semibold' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Siguiente: Pendiente de decisión/)).toBeInTheDocument()
    const pasos = screen.getByRole('list', { name: 'Etapas del proceso' })
    expect(pasos.querySelector('[aria-current="step"]')).toHaveAttribute('title', 'Prueba práctica')
  })

  it('en la última etapa no hay "Avanzar" y Contratar pasa a ser la acción principal', () => {
    render(
      <PostulacionPanel
        candidatoId={3}
        postulacion={{ ...postulacion, etapaActual: decision } as PostulacionDetalle}
        etapas={[entrevista, prueba, decision]}
        criterios={criterios}
        canWrite
      />
    )

    expect(screen.queryByRole('button', { name: /Avanzar a:/ })).not.toBeInTheDocument()
    expect(screen.getByText('Ya pasó por todas las etapas: falta decidir.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contratar/i }).className).toContain('bg-brand-600')
  })

  it('Puntaje e Historial arrancan cerrados y se abren con un toque', async () => {
    const user = userEvent.setup()
    render(
      <PostulacionPanel
        candidatoId={3}
        postulacion={
          {
            ...postulacion,
            etapas: [
              {
                pet_id: 1,
                pet_etapa_id: 5,
                pet_fecha: '2026-09-20',
                pet_resultado: 'aprobado',
                pet_notas: null,
                etapaNombre: 'Entrevista RRHH',
                responsableNombre: null,
              },
            ],
          } as PostulacionDetalle
        }
        etapas={[entrevista]}
        criterios={criterios}
        canWrite
      />
    )

    const puntaje = screen.getByRole('button', { name: /^Puntaje/ })
    const historial = screen.getByRole('button', { name: /^Historial/ })
    expect(puntaje).toHaveAttribute('aria-expanded', 'false')
    expect(historial).toHaveAttribute('aria-expanded', 'false')
    expect(historial).toHaveTextContent('1 registro')

    await user.click(puntaje)
    expect(puntaje).toHaveAttribute('aria-expanded', 'true')
  })
})
