import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getQueuedMarks, queueOfflineMark, removeQueuedMark, type QueuedMark } from './offlineQueue'

function mark(overrides: Partial<QueuedMark> = {}): QueuedMark {
  return {
    id: 'mark-1',
    employeeId: 10,
    tipo: 'entrada',
    fechaHora: '2026-07-25 08:04:00',
    latitud: null,
    longitud: null,
    pin: null,
    dispositivoId: null,
    ...overrides,
  }
}

describe('offlineQueue', () => {
  beforeEach(async () => {
    for (const m of await getQueuedMarks()) {
      await removeQueuedMark(m.id)
    }
  })

  it('empieza vacia', async () => {
    expect(await getQueuedMarks()).toEqual([])
  })

  it('guarda y recupera una marca', async () => {
    await queueOfflineMark(mark())

    const marks = await getQueuedMarks()

    expect(marks).toHaveLength(1)
    expect(marks[0]).toEqual(mark())
  })

  it('guarda varias marcas de forma independiente', async () => {
    await queueOfflineMark(mark({ id: 'mark-1' }))
    await queueOfflineMark(mark({ id: 'mark-2', tipo: 'salida' }))

    const marks = await getQueuedMarks()

    expect(marks.map((m) => m.id).sort()).toEqual(['mark-1', 'mark-2'])
  })

  it('quita una marca de la cola', async () => {
    await queueOfflineMark(mark({ id: 'mark-1' }))
    await queueOfflineMark(mark({ id: 'mark-2' }))

    await removeQueuedMark('mark-1')

    const marks = await getQueuedMarks()
    expect(marks.map((m) => m.id)).toEqual(['mark-2'])
  })
})
