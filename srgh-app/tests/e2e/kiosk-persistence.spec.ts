import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'

// HTTP integration through real PostgREST/RPC. This does not simulate a face
// verification or claim to test the full camera-to-mark browser journey.
const local = JSON.parse(
  readFileSync('.e2e/connection.json', 'utf8').replace(/^\uFEFF/, '')
) as Record<string, string>
if (local.API_URL !== 'http://127.0.0.1:55421') throw new Error('Unexpected test API')
const server = createClient(local.API_URL, local.SECRET_KEY || local.SERVICE_ROLE_KEY)
const mark = {
  mar_operacion_id: '00000000-0000-4000-8000-000000001051',
  mar_historial_laboral_id: 1051,
  mar_sucursal_id: 1051,
  mar_tipo: 'entrada',
  mar_fecha_hora: '2026-11-06 08:00:00',
  mar_metodo_verificacion: 'FACIAL',
}
const args = { p_marca: mark, p_snapshot: [], p_empresa_id: 1051 }

test('atomic kiosk HTTP retries persist exactly one mark and reject altered operation content', async () => {
  const first = await server.rpc('registrar_marca_kiosco_atomica', args)
  expect(first.error).toBeNull()
  expect(first.data).toBe('inserted')
  const retry = await server.rpc('registrar_marca_kiosco_atomica', args)
  expect(retry.error).toBeNull()
  expect(retry.data).toBe('duplicate')
  const altered = await server.rpc('registrar_marca_kiosco_atomica', {
    ...args,
    p_marca: { ...mark, mar_tipo: 'salida' },
  })
  expect(altered.error).toBeNull()
  expect(altered.data).toBe('conflict')
  const persisted = await server
    .from('sgrh_marcas_asistencia')
    .select('mar_tipo,mar_operacion_id')
    .eq('mar_historial_laboral_id', 1051)
  expect(persisted.error).toBeNull()
  expect(persisted.data).toEqual([{ mar_tipo: 'entrada', mar_operacion_id: mark.mar_operacion_id }])
})

test('anonymous and kiosk sessions cannot call the server-only atomic RPC directly', async () => {
  const client = createClient(local.API_URL, local.PUBLISHABLE_KEY || local.ANON_KEY)
  expect((await client.rpc('registrar_marca_kiosco_atomica', args)).error).not.toBeNull()
  const login = await client.auth.signInWithPassword({
    email: 'kiosco@e2e.sgrh.local',
    password: 'Sgrh105OnlyLocal!',
  })
  expect(login.error).toBeNull()
  expect((await client.rpc('registrar_marca_kiosco_atomica', args)).error).not.toBeNull()
})
