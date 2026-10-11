import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { PostulacionPanel } from './PostulacionPanel'
import { savePostulacionScores } from '@/modules/recruitment/actions/savePostulacionScores'
import { moveApplicationToStage } from '@/modules/recruitment/actions/moveApplicationToStage'
import type { CriterioSeleccionItem, PostulacionDetalle } from '@/modules/recruitment/types'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/recruitment/actions/savePostulacionScores', () => ({
  savePostulacionScores: vi.fn(),
}))
vi.mock('@/modules/recruitment/actions/moveApplicationToStage', () => ({
  moveApplicationToStage: vi.fn(),
}))
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

// El guardado automático espera una pausa corta tras el último toque.
const AUTOSAVE = { timeout: 4000 }

function renderPanel() {
  render(
    <PostulacionPanel
      candidatoId={3}
      postulacion={postulacion}
      etapas={[{ id: 5, nombre: 'Entrevista RRHH', orden: 0, color: null }]}
      criterios={criterios}
      canWrite
    />
  )
}

describe('<PostulacionPanel />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(savePostulacionScores).mockResolvedValue({ ok: true, promedio: null })
  })

  it('no hay botón de guardar: el promedio cambia al calificar y se guarda solo', async () => {
    const user = userEvent.setup()
    renderPanel()

    expect(screen.queryByRole('button', { name: /Guardar/ })).not.toBeInTheDocument()
    expect(screen.getByText('Se guarda solo al calificar.')).toBeInTheDocument()

    const experiencia = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    const actitud = screen.getByRole('radiogroup', { name: 'Puntaje de Actitud' })
    await user.click(experiencia.querySelector('[aria-label="8"]')!)
    await user.click(actitud.querySelector('[aria-label="6"]')!)

    // El promedio se ve al instante, antes de que llegue a guardarse.
    expect(screen.getByRole('img', { name: /Promedio 7 de 10/ })).toBeInTheDocument()
    expect(screen.getByText('2 de 2 calificados')).toBeInTheDocument()

    await waitFor(
      () =>
        expect(savePostulacionScores).toHaveBeenLastCalledWith({
          postulacionId: 9,
          puntajes: [
            { criterioId: 1, puntaje: 8, noAplica: false, observacion: null },
            { criterioId: 2, puntaje: 6, noAplica: false, observacion: null },
          ],
        }),
      AUTOSAVE
    )
    expect(await screen.findByText('Guardado')).toBeInTheDocument()
    // Sin toast por cada toque: el aviso es el "Guardado" de la propia sección.
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('se puede calificar de a poco: solo viaja lo ya calificado', async () => {
    const user = userEvent.setup()
    renderPanel()

    const experiencia = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    await user.click(experiencia.querySelector('[aria-label="8"]')!)

    await waitFor(
      () =>
        expect(savePostulacionScores).toHaveBeenCalledWith({
          postulacionId: 9,
          puntajes: [{ criterioId: 1, puntaje: 8, noAplica: false, observacion: null }],
        }),
      AUTOSAVE
    )
    expect(screen.getByText(/Falta 1 criterio/)).toBeInTheDocument()
  })

  it('varios toques seguidos se juntan en un solo guardado, con lo último', async () => {
    const user = userEvent.setup()
    renderPanel()

    const experiencia = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    await user.click(experiencia.querySelector('[aria-label="3"]')!)
    await user.click(experiencia.querySelector('[aria-label="5"]')!)
    await user.click(experiencia.querySelector('[aria-label="No aplica"]')!)

    await waitFor(() => expect(savePostulacionScores).toHaveBeenCalled(), AUTOSAVE)
    expect(savePostulacionScores).toHaveBeenCalledTimes(1)
    expect(savePostulacionScores).toHaveBeenCalledWith({
      postulacionId: 9,
      puntajes: [{ criterioId: 1, puntaje: null, noAplica: true, observacion: null }],
    })
  })

  it('si no se pudo guardar lo dice y deja reintentar sin volver a calificar', async () => {
    vi.mocked(savePostulacionScores).mockResolvedValueOnce({
      ok: false,
      error: 'No se pudo guardar el puntaje.',
    })
    const user = userEvent.setup()
    renderPanel()

    const experiencia = screen.getByRole('radiogroup', { name: 'Puntaje de Experiencia' })
    await user.click(experiencia.querySelector('[aria-label="8"]')!)

    expect(
      await screen.findByText('No se pudo guardar el puntaje.', undefined, AUTOSAVE)
    ).toBeInTheDocument()
    // Aviso visible también con la sección cerrada.
    expect(screen.getByText('Sin guardar')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByText('Guardado')).toBeInTheDocument()
    expect(savePostulacionScores).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Sin guardar')).not.toBeInTheDocument()
  })

  it('"Pasar a" mueve de un toque, sin ventana ni resultado, y confirma con un toast', async () => {
    vi.mocked(moveApplicationToStage).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderPanel()

    // Sin etapa todavía: la siguiente es la primera columna del tablero.
    await user.click(screen.getByRole('button', { name: /Pasar a: Entrevista RRHH/ }))

    expect(moveApplicationToStage).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: 9, stageId: 5 })
    )
    // Ya no existe el paso de "aprobado / rechazado / pendiente".
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Aprobado' })).not.toBeInTheDocument()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Pasó a Entrevista RRHH.'))
    expect(refresh).not.toHaveBeenCalled()
  })

  it('si el movimiento falla muestra el error del servidor, sin toast de éxito', async () => {
    vi.mocked(moveApplicationToStage).mockResolvedValue({
      ok: false,
      error: 'La postulación ya está cerrada.',
    })
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Pasar a: Entrevista RRHH/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('La postulación ya está cerrada.'))
    expect(toast.success).not.toHaveBeenCalled()
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
    // Cerrada no se califica: ni escala activa ni aviso de guardado.
    expect(screen.queryByText('Se guarda solo al calificar.')).not.toBeInTheDocument()
  })
})

describe('<PostulacionPanel /> — etapas y secciones', () => {
  // Las columnas del tablero, en su orden.
  const entrevista = { id: 5, nombre: 'Entrevista RRHH', orden: 0, color: null }
  const prueba = { id: 6, nombre: 'Prueba práctica', orden: 1, color: '#1e3a8a' }
  const decision = { id: 7, nombre: 'Pendiente de decisión', orden: 2, color: null }
  const columnas = [entrevista, prueba, decision]

  function renderEn(etapaActual: PostulacionDetalle['etapaActual'], etapas = columnas) {
    render(
      <PostulacionPanel
        candidatoId={3}
        postulacion={{ ...postulacion, etapaActual } as PostulacionDetalle}
        etapas={etapas}
        criterios={criterios}
        canWrite
      />
    )
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('"Otra etapa" ofrece todas menos la actual: también las anteriores', async () => {
    const user = userEvent.setup()
    renderEn(prueba)

    await user.click(screen.getByRole('button', { name: /Otra etapa/ }))
    await user.click(screen.getByLabelText('Etapa'))

    const opciones = screen.getAllByRole('option').map((o) => o.textContent)
    expect(opciones).toEqual(['Entrevista RRHH', 'Pendiente de decisión'])
  })

  it('"Otra etapa" permite devolverla a una anterior, con una nota para el historial', async () => {
    vi.mocked(moveApplicationToStage).mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    renderEn(prueba)

    await user.click(screen.getByRole('button', { name: /Otra etapa/ }))
    // Arranca en la primera opción: la etapa anterior.
    expect(screen.getByLabelText('Etapa')).toHaveTextContent('Entrevista RRHH')
    await user.type(screen.getByLabelText('Nota (opcional)'), 'Se reprograma la prueba')
    await user.click(screen.getByRole('button', { name: 'Mover' }))

    expect(moveApplicationToStage).toHaveBeenCalledWith({
      applicationId: 9,
      stageId: 5,
      note: 'Se reprograma la prueba',
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Pasó a Entrevista RRHH.'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('la barra de pasos marca la etapa actual y nombra la siguiente', () => {
    renderEn(prueba)

    expect(
      screen.getByText('Prueba práctica', { selector: 'span.font-semibold' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Siguiente: Pendiente de decisión/)).toBeInTheDocument()
    const pasos = screen.getByRole('list', { name: 'Etapas del proceso' })
    expect(pasos.querySelector('[aria-current="step"]')).toHaveAttribute('title', 'Prueba práctica')
    expect(screen.getByRole('button', { name: /Pasar a: Pendiente de decisión/ })).toBeEnabled()
  })

  it('en la última etapa no hay "Pasar a" y Contratar pasa a ser la acción principal', () => {
    renderEn(decision)

    expect(screen.queryByRole('button', { name: /Pasar a:/ })).not.toBeInTheDocument()
    expect(screen.getByText('Está en la última etapa: falta decidir.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /contratar/i }).className).toContain('bg-brand-600')
    // Todavía se puede devolver a una etapa anterior.
    expect(screen.getByRole('button', { name: /Otra etapa/ })).toBeEnabled()
  })

  it('si su etapa ya no es una columna, se nombra igual y vuelve a entrar por la primera', () => {
    renderEn({ id: 99, nombre: 'Assessment Center', color: null })

    expect(screen.getByText('Assessment Center')).toBeInTheDocument()
    const pasos = screen.getByRole('list', { name: 'Etapas del proceso' })
    expect(pasos.querySelector('[aria-current="step"]')).toBeNull()
    expect(screen.getByRole('button', { name: /Pasar a: Entrevista RRHH/ })).toBeInTheDocument()
  })

  it('sin columnas en el tablero, manda a crearlas ahí en vez de ofrecer movimientos', () => {
    renderEn(null, [])

    expect(screen.queryByRole('button', { name: /Pasar a:/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Otra etapa/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'tablero de Reclutamiento' })).toHaveAttribute(
      'href',
      '/recruitment'
    )
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
                pet_resultado: null,
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
