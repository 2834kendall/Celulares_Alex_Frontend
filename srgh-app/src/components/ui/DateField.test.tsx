import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DateField } from '@/components/ui/DatePickerButton'

const alCambiar = vi.fn()

beforeEach(() => {
  alCambiar.mockClear()
})

/**
 * El campo es controlado, asi que el test necesita un padre que de verdad
 * guarde el valor: sin eso, lo que se teclea no vuelve y la mascara no se
 * puede observar.
 */
function Campo({
  inicial = '',
  ...resto
}: {
  inicial?: string
  minISO?: string
  maxISO?: string
  invalid?: boolean
  todayISO?: string
}) {
  const [valor, setValor] = useState(inicial)
  return (
    <>
      <DateField
        label="Fecha de nacimiento"
        value={valor}
        onChange={(iso) => {
          setValor(iso)
          alCambiar(iso)
        }}
        {...resto}
      />
      <button type="button" onClick={() => setValor('2026-12-25')}>
        Poner navidad
      </button>
    </>
  )
}

function campo() {
  return screen.getByRole('combobox', { name: 'Fecha de nacimiento' })
}

function calendario() {
  return within(screen.getByRole('dialog', { name: 'Fecha de nacimiento' }))
}

describe('DateField — escribir la fecha', () => {
  it('enmascara mientras se teclea y emite el ISO al completarla', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.type(campo(), '15082026')

    expect(campo()).toHaveValue('15/08/2026')
    expect(alCambiar).toHaveBeenCalledTimes(1)
    expect(alCambiar).toHaveBeenCalledWith('2026-08-15')
  })

  it('pone las barras sin que se las teclee', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.type(campo(), '15')
    expect(campo()).toHaveValue('15/')

    await user.type(campo(), '08')
    expect(campo()).toHaveValue('15/08/')
  })

  it('no emite nada con una fecha a medio escribir', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.type(campo(), '1508')

    expect(campo()).toHaveValue('15/08/')
    expect(alCambiar).not.toHaveBeenCalled()
  })

  it('llega a una fecha lejana de un tiron', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.type(campo(), '10031985')

    expect(alCambiar).toHaveBeenCalledWith('1985-03-10')
  })

  it('acepta los digitos aunque se tecleen las barras', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.type(campo(), '15/08/2026')

    expect(campo()).toHaveValue('15/08/2026')
    expect(alCambiar).toHaveBeenCalledWith('2026-08-15')
  })
})

describe('DateField — fechas que no sirven', () => {
  // Es el caso que no puede atrapar ningun esquema de Zod: el formato es
  // correcto, la fecha no existe.
  it('avisa que la fecha no existe y deja el formulario vacio', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.clear(campo())
    await user.type(campo(), '31022026')

    expect(campo()).toHaveValue('31/02/2026')
    expect(screen.getByText('Esa fecha no existe.')).toBeInTheDocument()
    // Lo que importa: NO quedo guardado el 15 de agosto que ya no se ve.
    expect(alCambiar).toHaveBeenLastCalledWith('')
  })

  it('conserva en pantalla el texto imposible para poder corregirlo', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.clear(campo())
    await user.type(campo(), '31022026')
    expect(campo()).toHaveValue('31/02/2026')
    expect(screen.getByText('Esa fecha no existe.')).toBeInTheDocument()

    // Borrar el año y volver a escribirlo: el texto sigue ahi, no se vacio
    // solo, asi que se corrige sin teclear los ocho digitos de nuevo.
    await user.type(campo(), '{backspace}{backspace}{backspace}{backspace}')
    expect(campo()).toHaveValue('31/02/')

    await user.type(campo(), '2026')
    expect(campo()).toHaveValue('31/02/2026')
  })

  // Editar en medio es donde se nota la reubicacion del caret: sin ella, el
  // cursor se va al final en cada tecla y se escribe al reves.
  it('deja corregir el dia sin perder el resto de la fecha', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.type(campo(), '20', { initialSelectionStart: 0, initialSelectionEnd: 2 })

    expect(campo()).toHaveValue('20/08/2026')
    expect(alCambiar).toHaveBeenLastCalledWith('2026-08-20')
  })

  it('rechaza una fecha anterior al minimo', async () => {
    const user = userEvent.setup()
    render(<Campo minISO="2026-08-10" />)

    await user.type(campo(), '01082026')

    expect(screen.getByText('Tiene que ser el 10/08/2026 o despues.')).toBeInTheDocument()
    expect(alCambiar).not.toHaveBeenCalledWith('2026-08-01')
  })

  it('rechaza una fecha posterior al maximo', async () => {
    const user = userEvent.setup()
    render(<Campo maxISO="2026-08-10" />)

    await user.type(campo(), '20082026')

    expect(screen.getByText('Tiene que ser el 10/08/2026 o antes.')).toBeInTheDocument()
    expect(alCambiar).not.toHaveBeenCalledWith('2026-08-20')
  })

  it('acepta una fecha dentro del rango', async () => {
    const user = userEvent.setup()
    render(<Campo minISO="2026-08-01" maxISO="2026-08-31" />)

    await user.type(campo(), '15082026')

    expect(alCambiar).toHaveBeenCalledWith('2026-08-15')
    expect(screen.queryByText(/Tiene que ser/)).not.toBeInTheDocument()
  })

  // Enter manda el formulario sin pasar por blur, asi que el texto a medias
  // tiene que resolverse antes o se enviaria el valor viejo.
  it('al salir del campo con la fecha a medias avisa y vacia el valor', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.clear(campo())
    await user.type(campo(), '1508')
    await user.tab()

    expect(screen.getByText('Fecha incompleta.')).toBeInTheDocument()
    expect(alCambiar).toHaveBeenLastCalledWith('')
  })
})

describe('DateField — borrar', () => {
  it('borrar todo emite cadena vacia', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    expect(campo()).toHaveValue('15/08/2026')
    await user.clear(campo())

    expect(campo()).toHaveValue('')
    expect(alCambiar).toHaveBeenLastCalledWith('')
  })

  // Sin tratarlo aparte, la mascara repone la barra recien borrada y el campo
  // queda trabado en "15/".
  it('borrar sobre una barra se lleva el digito anterior', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.type(campo(), '15')
    expect(campo()).toHaveValue('15/')

    await user.type(campo(), '{backspace}')
    expect(campo()).toHaveValue('1')
  })
})

describe('DateField — pegar', () => {
  it('reacomoda un pegado con separadores y mes de una cifra', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.click(campo())
    await user.paste('15/8/2026')

    expect(campo()).toHaveValue('15/08/2026')
    expect(alCambiar).toHaveBeenCalledWith('2026-08-15')
  })

  it('acepta un pegado con guiones', async () => {
    const user = userEvent.setup()
    render(<Campo />)

    await user.click(campo())
    await user.paste('15-08-2026')

    expect(alCambiar).toHaveBeenCalledWith('2026-08-15')
  })
})

describe('DateField — el calendario sigue funcionando', () => {
  it('abre con el boton del icono', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Abrir calendario' }))

    expect(calendario().getByText('Agosto de 2026')).toBeInTheDocument()
  })

  it('abre con la flecha abajo desde el campo', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.click(campo())
    await user.keyboard('{ArrowDown}')

    expect(screen.getByRole('dialog', { name: 'Fecha de nacimiento' })).toBeInTheDocument()
  })

  it('elegir un dia en el calendario repinta el texto del campo', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.click(screen.getByRole('button', { name: 'Abrir calendario' }))
    await user.click(calendario().getByRole('button', { name: /22 de agosto de 2026/ }))

    expect(alCambiar).toHaveBeenCalledWith('2026-08-22')
    expect(campo()).toHaveValue('22/08/2026')
  })

  it('Escape cierra el calendario y devuelve el foco al campo', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.click(screen.getByRole('button', { name: 'Abrir calendario' }))
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(campo()).toHaveFocus()
  })

  it('expone aria-expanded y aria-controls como un combobox', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    expect(campo()).toHaveAttribute('aria-expanded', 'false')
    expect(campo()).not.toHaveAttribute('aria-controls')

    await user.click(screen.getByRole('button', { name: 'Abrir calendario' }))

    expect(campo()).toHaveAttribute('aria-expanded', 'true')
    expect(campo()).toHaveAttribute(
      'aria-controls',
      screen.getByRole('dialog', { name: 'Fecha de nacimiento' }).id
    )
  })
})

describe('DateField — valor que cambia desde afuera', () => {
  it('repinta el texto cuando el formulario pone otra fecha', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.click(screen.getByRole('button', { name: 'Poner navidad' }))

    expect(campo()).toHaveValue('25/12/2026')
  })

  it('repinta el texto cuando el formulario borra la fecha', async () => {
    const user = userEvent.setup()
    render(<Campo inicial="2026-08-15" />)

    await user.type(campo(), '{backspace}')
    await user.click(screen.getByRole('button', { name: 'Poner navidad' }))

    expect(campo()).toHaveValue('25/12/2026')
  })
})

describe('DateField — estados', () => {
  it('marca el campo con aria-invalid cuando el formulario lo pide', () => {
    render(<Campo invalid />)
    expect(campo()).toHaveAttribute('aria-invalid', 'true')
  })

  it('no pone aria-invalid cuando el campo esta bien', () => {
    render(<Campo />)
    expect(campo()).not.toHaveAttribute('aria-invalid')
  })
})
