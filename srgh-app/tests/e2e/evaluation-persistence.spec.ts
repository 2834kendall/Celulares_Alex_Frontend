import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { test, expect } from '@playwright/test'

const local = JSON.parse(
  readFileSync('.e2e/connection.json', 'utf8').replace(/^\uFEFF/, '')
) as Record<string, string>
if (local.API_URL !== 'http://127.0.0.1:55421') throw new Error('Unexpected test API')

test('note updates confirm an owned row and return null for foreign or missing evaluations', async () => {
  const client = createClient(local.API_URL, local.PUBLISHABLE_KEY || local.ANON_KEY)
  expect(
    (
      await client.auth.signInWithPassword({
        email: 'admin@e2e.sgrh.local',
        password: 'Sgrh105OnlyLocal!',
      })
    ).error
  ).toBeNull()
  const write = (id: number) =>
    client
      .from('sgrh_evaluaciones')
      .update({ eve_observaciones: 'verified update' })
      .eq('eve_id', id)
      .select('eve_id')
      .maybeSingle()
  expect(await write(1051)).toMatchObject({ error: null, data: { eve_id: 1051 } })
  expect(await write(1052)).toMatchObject({ error: null, data: null })
  expect(await write(999999)).toMatchObject({ error: null, data: null })
  const admin = createClient(local.API_URL, local.SECRET_KEY || local.SERVICE_ROLE_KEY)
  expect(
    (await admin.from('sgrh_evaluaciones').select('eve_observaciones').eq('eve_id', 1051).single())
      .data
  ).toEqual({ eve_observaciones: 'verified update' })
  expect(
    (await admin.from('sgrh_evaluaciones').select('eve_observaciones').eq('eve_id', 1052).single())
      .data
  ).toEqual({ eve_observaciones: 'foreign evaluation' })
})

test('kiosk sessions cannot change evaluation notes through the Data API', async () => {
  const client = createClient(local.API_URL, local.PUBLISHABLE_KEY || local.ANON_KEY)
  expect(
    (
      await client.auth.signInWithPassword({
        email: 'kiosco@e2e.sgrh.local',
        password: 'Sgrh105OnlyLocal!',
      })
    ).error
  ).toBeNull()
  const result = await client
    .from('sgrh_evaluaciones')
    .update({ eve_observaciones: 'forbidden update' })
    .eq('eve_id', 1051)
    .select('eve_id')
    .maybeSingle()
  expect(result.error).toBeNull()
  expect(result.data).toBeNull()
})
