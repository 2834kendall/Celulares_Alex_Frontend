import { test, expect, type Page } from '@playwright/test'

async function login(page: Page, role: 'admin' | 'kiosco' = 'admin') {
  await page.goto('/login')
  await page.locator('#email-input').fill(`${role}@e2e.sgrh.local`)
  await page.locator('#pass-input').fill('Sgrh105OnlyLocal!')
  await page.locator('#submit-login').click()
  await expect(page).toHaveURL(role === 'kiosco' ? /\/kiosco$/ : /\/dashboard$/, { timeout: 30000 })
}

test('dashboard customization persists after reload through the real preferences API', async ({
  page,
}) => {
  await login(page)
  await page.getByRole('button', { name: 'Personalizar', exact: true }).click()
  const hide = page.getByRole('button', { name: /^Ocultar / }).first()
  const label = (await hide.getAttribute('aria-label'))!.replace(/^Ocultar /, '')
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/dashboard/prefs') && response.request().method() === 'POST'
  )
  await hide.click()
  expect((await saved).ok()).toBe(true)
  await page.reload()
  await page.getByRole('button', { name: 'Personalizar', exact: true }).click()
  await expect(page.getByRole('toolbar', { name: `Controles de ${label}` })).toHaveCount(0)
  await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
})

test('candidate document validation preserves the selected file, then upload and download work', async ({
  page,
}) => {
  await login(page)
  await page.goto('/recruitment/candidates/1051')
  await expect(page.getByRole('heading', { name: 'Ana E2E Prueba' })).toBeVisible()
  await page.getByRole('button', { name: /Documentos/ }).click()
  await page.locator('input[type=file]').setInputFiles({
    name: 'CV-E2E.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF'),
  })
  const dialog = page.getByRole('dialog', { name: 'Guardar documento' })
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nombre', { exact: true }).fill('A')
  await dialog.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(dialog.getByText('Ingrese un nombre para el documento.')).toBeVisible()
  await expect(dialog.getByText('Archivo: CV-E2E.pdf')).toBeVisible()
  await dialog.getByLabel('Nombre', { exact: true }).fill('CV E2E 105')
  await dialog.getByRole('button', { name: 'Guardar documento', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await page.reload()
  await page.getByRole('button', { name: /Documentos/ }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Abrir CV E2E 105', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('CV E2E 105.pdf')
})

test('foreign candidate details are unavailable to the authenticated company', async ({ page }) => {
  await login(page)
  await page.goto('/recruitment/candidates/1052')
  // App Router may already have streamed a 200 before notFound() resolves.
  await expect(page.getByRole('heading', { name: 'No encontramos esta página' })).toBeVisible()
  await expect(page.getByText('Candidata Ajena E2E')).toHaveCount(0)
})

test('kiosk login goes to the terminal and cannot open administrative recruitment', async ({
  page,
}) => {
  await login(page, 'kiosco')
  await expect(page).toHaveURL(/\/kiosco$/)
  await page.goto('/recruitment/candidates/1051')
  await expect(page).not.toHaveURL(/\/recruitment\/candidates/)
  await expect(page.getByRole('heading', { name: 'Ana E2E Prueba' })).toHaveCount(0)
})
