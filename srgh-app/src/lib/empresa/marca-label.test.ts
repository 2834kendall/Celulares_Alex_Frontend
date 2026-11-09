import { describe, expect, it } from 'vitest'
import { formatSucursalLabel, shellIdentity } from './marca-label'

describe('formatSucursalLabel', () => {
  it('muestra "Marca · Sucursal"', () => {
    expect(formatSucursalLabel('Celulares Alex', 'Mall')).toBe('Celulares Alex · Mall')
  })

  it('sin marca muestra solo la sucursal', () => {
    expect(formatSucursalLabel(null, 'Mall')).toBe('Mall')
    expect(formatSucursalLabel(undefined, 'Mall')).toBe('Mall')
  })

  it('no repite el nombre si la sucursal se llama igual que su marca', () => {
    expect(formatSucursalLabel('Celulares Alex', ' celulares alex ')).toBe(' celulares alex ')
  })
})

describe('shellIdentity', () => {
  it('con marca: la marca y debajo la sucursal propia', () => {
    expect(shellIdentity('Grupo A', 'Celulares Alex', 'Mall')).toEqual({
      nombre: 'Celulares Alex',
      detalle: 'Mall',
    })
  })

  it('con marca y sin sucursal (admin en preview): debajo la empresa', () => {
    expect(shellIdentity('Grupo A', 'Infinity', null)).toEqual({
      nombre: 'Infinity',
      detalle: 'Grupo A',
    })
  })

  it('sin marca: la empresa y debajo la sucursal, o nada', () => {
    expect(shellIdentity('Grupo A', null, 'Mall')).toEqual({ nombre: 'Grupo A', detalle: 'Mall' })
    expect(shellIdentity('Grupo A', null, null)).toEqual({ nombre: 'Grupo A', detalle: null })
  })

  it('omite el detalle que repetiría el nombre', () => {
    expect(shellIdentity('Grupo A', 'Celulares Alex', 'Celulares Alex').detalle).toBeNull()
    expect(shellIdentity('Infinity', 'Infinity', null).detalle).toBeNull()
  })
})
