import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { EmployeeFaceSection } from './EmployeeFaceSection'
import { enrollFace } from '@/modules/attendance/actions/enrollFace'
import { deleteFaceEnrollment } from '@/modules/attendance/actions/deleteFaceEnrollment'
import type { FaceStatus } from '@/modules/attendance/actions/getFaceStatus'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/modules/attendance/actions/enrollFace', () => ({ enrollFace: vi.fn() }))
vi.mock('@/modules/attendance/actions/deleteFaceEnrollment', () => ({
  deleteFaceEnrollment: vi.fn(),
}))

const PAYLOAD = { iv: 'iv', data: 'cifrado' }

// La camara real (MediaPipe, modelos, getUserMedia) no existe en jsdom: el
// doble expone un boton por cada desenlace que FaceScan le informa al padre.
const mockPreload = vi.hoisted(() => vi.fn())
vi.mock('@/modules/attendance/components/kiosk/face/FaceScan', () => ({
  preloadFaceScan: mockPreload,
  FaceScan: (props: {
    enrollment?: boolean
    onEmbedding: (p: typeof PAYLOAD) => Promise<void>
    onUnavailable: (reason: string) => void
    onSpoof?: () => void
  }) => (
    <div data-testid="face-scan" data-enrollment={String(props.enrollment)}>
      <button onClick={() => void props.onEmbedding(PAYLOAD)}>simular captura</button>
      <button onClick={() => props.onUnavailable('Sin cámara')}>simular sin cámara</button>
      <button onClick={() => props.onSpoof?.()}>simular foto</button>
    </div>
  ),
}))

const mockEnrollFace = vi.mocked(enrollFace)
const mockDelete = vi.mocked(deleteFaceEnrollment)

const SIN_REGISTRO: FaceStatus = { enrolled: false }
const REGISTRADO: FaceStatus = {
  enrolled: true,
  updatedAt: '2026-11-01T15:30:00',
  currentModel: true,
}
const MODELO_VIEJO: FaceStatus = {
  enrolled: true,
  updatedAt: '2026-01-10T09:00:00',
  currentModel: false,
}

function renderSection(
  status: FaceStatus | null,
  opts: { contrato?: boolean; error?: string } = {}
) {
  return render(
    <EmployeeFaceSection
      empId={10}
      status={status}
      error={opts.error ?? null}
      hasActiveContract={opts.contrato ?? true}
    />
  )
}

describe('<EmployeeFaceSection />', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('estado del registro', () => {
    it('sin registro avisa que el kiosco no lo reconoce y ofrece capturar', () => {
      renderSection(SIN_REGISTRO)

      expect(screen.getByText('Sin registro')).toBeInTheDocument()
      expect(screen.getByText(/el kiosco no puede reconocer a esta persona/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /capturar rostro/i })).toBeEnabled()
      expect(screen.queryByRole('button', { name: /eliminar registro/i })).not.toBeInTheDocument()
    })

    it('registrado muestra la fecha de la última captura y ofrece reemplazar o eliminar', () => {
      renderSection(REGISTRADO)

      expect(screen.getByText('Registrado')).toBeInTheDocument()
      expect(screen.getByText(/última captura: 01\/11\/2026/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reemplazar/i })).toBeEnabled()
      expect(screen.getByRole('button', { name: /eliminar registro/i })).toBeEnabled()
    })

    // Un vector de otro modelo el kiosco no lo compara nunca: para el kiosco la
    // persona no está registrada, aunque haya fila.
    it('con un modelo anterior pide capturar de nuevo', () => {
      renderSection(MODELO_VIEJO)

      expect(screen.getByText('Requiere nueva captura')).toBeInTheDocument()
      expect(screen.getByText(/versión anterior del reconocimiento/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /capturar de nuevo/i })).toBeEnabled()
      expect(screen.queryByText(/última captura/i)).not.toBeInTheDocument()
    })

    it('si no se pudo cargar, muestra el error y ninguna acción', () => {
      renderSection(null, { error: 'No se pudo cargar el registro facial.' })

      expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar el registro facial.')
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })

    it('sin contrato vigente no deja capturar, pero sí eliminar', () => {
      renderSection(REGISTRADO, { contrato: false })

      expect(
        screen.getByText(
          /solo se puede registrar el rostro de un colaborador con contrato vigente/i
        )
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /reemplazar/i })).toBeDisabled()
      expect(screen.getByRole('button', { name: /eliminar registro/i })).toBeEnabled()
    })
  })

  describe('precarga', () => {
    it('empieza a bajar los modelos al abrir la pestaña si se puede capturar', async () => {
      renderSection(SIN_REGISTRO)
      await waitFor(() => expect(mockPreload).toHaveBeenCalledWith(true))
    })

    it('no baja nada sin contrato vigente', async () => {
      renderSection(SIN_REGISTRO, { contrato: false })
      await new Promise((r) => setTimeout(r, 700))
      expect(mockPreload).not.toHaveBeenCalled()
    })
  })

  describe('captura', () => {
    async function openCamera() {
      await userEvent.click(screen.getByRole('button', { name: /capturar rostro/i }))
      await userEvent.click(screen.getByRole('button', { name: /empezar captura/i }))
    }

    it('explica qué hacer y precarga los modelos antes de abrir la cámara', async () => {
      renderSection(SIN_REGISTRO)

      await userEvent.click(screen.getByRole('button', { name: /capturar rostro/i }))

      expect(screen.getByRole('heading', { name: 'Antes de capturar' })).toBeInTheDocument()
      expect(screen.getByText('Sin nada en la cara')).toBeInTheDocument()
      expect(screen.getByText('Lentes claros, sí')).toBeInTheDocument()
      // Los modelos se bajan mientras se lee la guía; la cámara todavía no.
      expect(mockPreload).toHaveBeenCalledWith(true)
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByText('Antes de capturar')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /capturar rostro/i })).toBeEnabled()
    })

    it('abre la cámara en modo enrolamiento y Cancelar la cierra', async () => {
      renderSection(SIN_REGISTRO)

      await openCamera()
      // enrollment: tres capturas consistentes, prueba de vida y sin manos.
      expect(screen.getByTestId('face-scan')).toHaveAttribute('data-enrollment', 'true')

      await userEvent.click(screen.getByRole('button', { name: /cancelar/i }))
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })

    it('guarda solo el vector de ESTE empleado en cuanto la cámara lo valida', async () => {
      mockEnrollFace.mockResolvedValue({ ok: true })
      renderSection(SIN_REGISTRO)

      await openCamera()
      await userEvent.click(screen.getByRole('button', { name: /simular captura/i }))

      expect(mockEnrollFace).toHaveBeenCalledWith({ employeeId: 10, vector: PAYLOAD })
      expect(toast.success).toHaveBeenCalledWith('Rostro registrado.')
      expect(refresh).toHaveBeenCalledTimes(1)
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })

    it('bloquea cancelar y duplicar la captura durante el guardado', async () => {
      let finish!: (value: { ok: true }) => void
      mockEnrollFace.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          })
      )
      renderSection(SIN_REGISTRO)
      await openCamera()
      await userEvent.click(screen.getByRole('button', { name: /simular captura/i }))
      expect(screen.getByRole('status')).toHaveTextContent('Guardando registro facial')
      expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled()
      await userEvent.click(screen.getByRole('button', { name: /simular captura/i }))
      expect(mockEnrollFace).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('face-scan')).toBeInTheDocument()
      await act(async () => finish({ ok: true }))
      await waitFor(() => expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument())
      expect(refresh).toHaveBeenCalledTimes(1)
    })

    it('permite reintentar cuando la llamada de guardado rechaza por red', async () => {
      mockEnrollFace.mockRejectedValueOnce(new TypeError('Network failed'))
      renderSection(SIN_REGISTRO)
      await openCamera()
      await userEvent.click(screen.getByRole('button', { name: /simular captura/i }))
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/conexión/))
      )
      expect(screen.getByRole('button', { name: /capturar rostro/i })).toBeEnabled()
      expect(refresh).not.toHaveBeenCalled()
    })

    it('si el servidor rechaza, muestra su error y no refresca', async () => {
      mockEnrollFace.mockResolvedValue({
        ok: false,
        error: 'El empleado no tiene un contrato activo.',
      })
      renderSection(SIN_REGISTRO)

      await openCamera()
      await userEvent.click(screen.getByRole('button', { name: /simular captura/i }))

      expect(toast.error).toHaveBeenCalledWith('El empleado no tiene un contrato activo.')
      expect(refresh).not.toHaveBeenCalled()
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })

    it('sin cámara disponible avisa y cierra el escaneo', async () => {
      renderSection(SIN_REGISTRO)

      await openCamera()
      await userEvent.click(screen.getByRole('button', { name: /simular sin cámara/i }))

      expect(toast.error).toHaveBeenCalledWith('Sin cámara')
      expect(mockEnrollFace).not.toHaveBeenCalled()
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })

    it('ante una imagen plana no guarda nada y pide a la persona presente', async () => {
      renderSection(SIN_REGISTRO)

      await openCamera()
      await userEvent.click(screen.getByRole('button', { name: /simular foto/i }))

      expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/persona presente/i))
      expect(mockEnrollFace).not.toHaveBeenCalled()
      expect(screen.queryByTestId('face-scan')).not.toBeInTheDocument()
    })
  })

  describe('eliminar', () => {
    it('libera los controles y avisa cuando el transporte rechaza el borrado', async () => {
      mockDelete.mockRejectedValueOnce(new TypeError('Network failed'))
      renderSection(REGISTRADO)
      await userEvent.click(screen.getByRole('button', { name: /eliminar registro/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/conexión/))
      )
      expect(screen.getByRole('button', { name: /eliminar registro/i })).toBeEnabled()
      expect(screen.getByRole('button', { name: /reemplazar/i })).toBeEnabled()
      expect(toast.success).not.toHaveBeenCalled()
    })
    it('pide confirmación, y Cancelar no borra nada', async () => {
      renderSection(REGISTRADO)

      await userEvent.click(screen.getByRole('button', { name: /eliminar registro/i }))
      expect(screen.getByRole('alertdialog')).toHaveTextContent(/el kiosco dejará de reconocer/i)

      await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
      expect(mockDelete).not.toHaveBeenCalled()
    })

    it('al confirmar borra el registro de este empleado', async () => {
      mockDelete.mockResolvedValue({ ok: true })
      renderSection(REGISTRADO)

      await userEvent.click(screen.getByRole('button', { name: /eliminar registro/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

      expect(mockDelete).toHaveBeenCalledWith(10)
      expect(toast.success).toHaveBeenCalledWith('Registro facial eliminado.')
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    })

    it('si el borrado falla, muestra el error del servidor', async () => {
      mockDelete.mockResolvedValue({
        ok: false,
        error: 'No se encontró un registro facial de este empleado que pueda eliminar.',
      })
      renderSection(REGISTRADO)

      await userEvent.click(screen.getByRole('button', { name: /eliminar registro/i }))
      await userEvent.click(screen.getByRole('button', { name: 'Eliminar' }))

      expect(toast.error).toHaveBeenCalledWith(
        'No se encontró un registro facial de este empleado que pueda eliminar.'
      )
      expect(toast.success).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: /eliminar registro/i })).toBeEnabled()
    })
  })
})
