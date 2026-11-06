import { readFileSync } from 'node:fs'
import { defineConfig, devices } from '@playwright/test'

const local = JSON.parse(
  readFileSync('.e2e/connection.json', 'utf8').replace(/^\uFEFF/, '')
) as Record<string, string>
if (local.API_URL !== 'http://127.0.0.1:55421')
  throw new Error('E2E requires the dedicated local Supabase stack')

export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3105',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'chromium-mobile',
      testMatch: '**/critical-flows.spec.ts',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'pnpm exec next dev --hostname 127.0.0.1 --port 3105',
    url: 'http://127.0.0.1:3105/login',
    reuseExistingServer: false,
    timeout: 180000,
    env: {
      SGRH_E2E: '1',
      NEXT_PUBLIC_SUPABASE_URL: local.API_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.PUBLISHABLE_KEY || local.ANON_KEY,
      SUPABASE_SECRET_KEY: local.SECRET_KEY || local.SERVICE_ROLE_KEY,
      FACE_VECTOR_KEY: 'e2e-only-not-a-real-face-key',
      FACE_TICKET_SECRET: 'e2e-only-not-a-real-ticket-secret',
      NEXT_PUBLIC_FACE_VECTOR_KEY: '',
    },
  },
})
