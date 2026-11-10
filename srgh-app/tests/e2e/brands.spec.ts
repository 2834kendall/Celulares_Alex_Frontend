import { execFileSync } from 'node:child_process'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { deriveBrandTokens } from '../../src/lib/utils/color'

/**
 * Commercial brands (Empresa → Marca → Sucursal) through the real app, Auth,
 * PostgREST and Storage of the dedicated local stack. Mocks cannot cover what
 * matters here: nested joins over the composite FK, RLS by role and JWT claims
 * produced by the real hook.
 *
 * Tests in this file share data and run in order. Each one uses the fixture
 * brand nobody else edits, and the company theme test goes last.
 */
const COMPANY = {
  name: 'Empresa E2E Uno',
  accent: '#166534',
  sidebar: '#eef1f4',
  logo: 'Logo de Empresa E2E Uno',
}
const UNO = { id: 1051, name: 'Marca E2E Uno', accent: '#9f1239', sidebar: '#1b2a41' }
const DOS = { id: 1052, name: 'Marca E2E Dos', accent: '#1e40af' }
const AJENA = { id: 1053, name: 'Marca E2E Ajena' }
const TIENDAS = { id: 1054, name: 'Marca E2E Tiendas' }
const PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
)

type Account = 'admin' | 'gerente' | 'gerente2' | 'empleado'

async function login(page: Page, account: Account) {
  await page.goto('/login')
  await page.locator('#email-input').fill(`${account}@e2e.sgrh.local`)
  await page.locator('#pass-input').fill('Sgrh105OnlyLocal!')
  await page.locator('#submit-login').click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 })
}

async function loginInNewContext(browser: Browser, account: Account) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, account)
  return { context, page }
}

const shellToken = (page: Page, token: string) =>
  page
    .locator('#app-shell-root')
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), token)

/** The theme the shell really paints, read from its inline tokens. */
async function expectTheme(page: Page, theme: { accent: string; sidebar: string }) {
  await expect
    .poll(() => shellToken(page, '--color-brand-action'))
    .toBe(deriveBrandTokens(theme.accent)['--color-brand-action'])
  await expect.poll(() => shellToken(page, '--sidebar-bg')).toBe(theme.sidebar)
}

/** Name and detail lines of the identity in the top bar. */
async function expectIdentity(page: Page, name: string, detail?: string) {
  const header = page.locator('header')
  await expect(header.getByTitle(name, { exact: true }).filter({ visible: true })).toBeVisible()
  if (detail) {
    await expect(header.getByText(detail, { exact: true }).filter({ visible: true })).toBeVisible()
  }
}

/** The logo really loads: a signed URL that fails would leave a broken image. */
async function expectLogo(page: Page, alt: string, srcPart: string) {
  const logo = page.locator('header').getByAltText(alt, { exact: true }).filter({ visible: true })
  await expect(logo).toHaveAttribute('src', new RegExp(srcPart))
  await expect
    .poll(() => logo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true)
}

const BRANDS_TAB = '/settings/profile?tab=marcas'

const switcher = (page: Page) =>
  page.locator('header').getByRole('button', { name: 'Marca', exact: true })

/** The selector cookie as the app writes it, for this account and any brand. */
function contextCookie(account: Account, marcaId: number, url: string) {
  const usrId = execFileSync(
    'docker',
    [
      'exec',
      'supabase_db_sgrh105-e2e',
      'psql',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-tAc',
      `SELECT usr_id FROM sgrh_usuarios WHERE usr_email='${account}@e2e.sgrh.local'`,
    ],
    { encoding: 'utf8' }
  ).trim()
  return {
    name: 'sgrh_marca_contexto',
    value: encodeURIComponent(JSON.stringify({ u: Number(usrId), m: marcaId })),
    url,
  }
}

async function chooseView(page: Page, option: string) {
  await switcher(page).click()
  await page.getByRole('listbox').getByRole('button', { name: option, exact: true }).click()
}

/** Sets both colors as the brand's own, whether or not they were inherited. */
async function saveColors(page: Page, accent: string, sidebar: string) {
  for (const checkbox of await page.getByRole('checkbox', { name: /^Usar el / }).all()) {
    await checkbox.uncheck()
  }
  await page.locator('#color-acento').fill(accent)
  await page.locator('#color-sidebar').fill(sidebar)
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Apariencia actualizada.')).toBeVisible()
}

/** Opens the brands tab once it can take clicks: buttons do nothing before hydration. */
async function gotoBrands(page: Page) {
  await page.goto(BRANDS_TAB)
  await page.waitForLoadState('networkidle')
}

async function createBrand(page: Page, name: string) {
  await page.getByRole('button', { name: 'Nueva marca', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Nueva marca' })
  await dialog.getByLabel('Nombre *').fill(name)
  await dialog.getByRole('button', { name: 'Crear marca', exact: true }).click()
  return dialog
}

async function pickFirstOption(page: Page, label: RegExp) {
  await page.getByRole('button', { name: label }).click()
  await page.getByRole('listbox').getByRole('button').first().click()
}

test('the general view shows the company logo, name and theme', async ({ page }) => {
  await login(page, 'admin')
  await expectIdentity(page, COMPANY.name)
  await expectTheme(page, COMPANY)
  await expectLogo(page, COMPANY.logo, '/logo/e2e-empresa')
  await expect(switcher(page)).toHaveText(/Todas las marcas/)
})

test('creating a brand rejects a duplicate name and a branch joins the brand it came from', async ({
  page,
}) => {
  await login(page, 'admin')

  await gotoBrands(page)
  const dialog = await createBrand(page, ' marca e2e UNO ')
  await expect(dialog.getByText('Ya existe una marca con ese nombre.')).toBeVisible()

  await dialog.getByLabel('Nombre *').fill('Temporal E2E Marca')
  await dialog.getByRole('button', { name: 'Crear marca', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByText('Temporal E2E Marca', { exact: true })).toBeVisible()

  // Without a brand, a branch is not saved.
  await page.goto('/settings/branches/new')
  await page.getByLabel('Nombre *').fill('Temporal E2E Sin Marca')
  await page.getByRole('button', { name: 'Crear sucursal', exact: true }).click()
  await expect(page.getByText('Elegí la marca de la sucursal.')).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/branches\/new$/)

  // "Agregar sucursal" brings the brand already selected.
  await gotoBrands(page)
  await page.getByRole('link', { name: 'Agregar sucursal de Temporal E2E Marca' }).click()
  await expect(page).toHaveURL(/\/settings\/branches\/new\?marca=\d+$/)
  const query = new URL(page.url()).search
  await expect(page.getByRole('button', { name: /Marca \*/ })).toHaveText(/Temporal E2E Marca/)

  await page.getByLabel('Nombre *').fill('Temporal E2E Tienda')
  await pickFirstOption(page, /Provincia/)
  await pickFirstOption(page, /Cantón/)
  await pickFirstOption(page, /Distrito/)
  await page.getByLabel('Señas exactas *').fill('Cien metros norte del parque central')
  await page.getByRole('button', { name: 'Crear sucursal', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/settings/branches/\\d+\\${query}$`))

  // Going back lands on the list filtered by the brand, not on the whole list.
  await page.getByRole('button', { name: 'Volver al listado', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/settings/branches\\${query}$`))
  await expect(page.getByRole('combobox', { name: 'Marca' })).toHaveValue(query.split('=')[1])
  await expect(
    page
      .getByRole('region', { name: 'Temporal E2E Marca' })
      .getByRole('link', { name: /Temporal E2E Tienda/ })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: /Sucursal E2E Uno/ })).toHaveCount(0)

  // From the brand card, the list arrives with that same filter.
  await gotoBrands(page)
  await page.getByRole('link', { name: 'Ver 1 sucursal de Temporal E2E Marca' }).click()
  await expect(page).toHaveURL(new RegExp(`/settings/branches\\${query}$`))
})

test('a brand created by mistake can be deleted, and one with branches cannot', async ({
  page,
}) => {
  await login(page, 'admin')
  await gotoBrands(page)
  const dialog = await createBrand(page, 'Temporal E2E Por Error')
  await expect(dialog).toHaveCount(0)

  await page.getByRole('button', { name: 'Más acciones de Temporal E2E Por Error' }).click()
  await page.getByRole('button', { name: 'Eliminar marca', exact: true }).click()
  await page
    .getByRole('alertdialog', { name: '¿Eliminar Temporal E2E Por Error?' })
    .getByRole('button', { name: 'Eliminar', exact: true })
    .click()
  await expect(page.getByText('Marca eliminada.')).toBeVisible()
  await expect(page.getByText('Temporal E2E Por Error', { exact: true })).toHaveCount(0)

  // Its name is free again.
  await expect(await createBrand(page, 'Temporal E2E Por Error')).toHaveCount(0)
  await expect(page.getByText('Temporal E2E Por Error', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: `Más acciones de ${UNO.name}` }).click()
  await page.getByRole('button', { name: 'Eliminar marca', exact: true }).click()
  await expect(
    page
      .getByRole('dialog', { name: `No se puede eliminar ${UNO.name}` })
      .getByRole('link', { name: 'Ver sus sucursales' })
  ).toHaveAttribute('href', `/settings/branches?marca=${UNO.id}`)
})

test('editing a brand once recolors both of its stores', async ({ page, browser }) => {
  const nuevo = { accent: '#5b21b6', sidebar: '#15181d' }
  await login(page, 'admin')
  await gotoBrands(page)
  await page.getByRole('button', { name: `Colores de ${TIENDAS.name}` }).click()
  await saveColors(page, nuevo.accent, nuevo.sidebar)

  // Saving no longer moves the top bar selector: the brand is one explicit click away.
  await expect(switcher(page)).toHaveText(/Todas las marcas/)
  await page.getByRole('button', { name: 'Ver solo esta marca', exact: true }).click()
  await expect(switcher(page)).toHaveText(new RegExp(TIENDAS.name))
  await expect(page.getByRole('status').getByText(/Los totales son de esta marca/)).toBeVisible()

  // The historic bug of this form: "I change the colors, go to Inicio and the
  // old ones come back". It only showed on CLIENT navigation, so a page.goto
  // would hide it.
  await page.getByRole('link', { name: 'Volver al menú principal' }).click()
  await expect(page).not.toHaveURL(/\/settings/)
  await expectTheme(page, nuevo)
  await page.reload()
  await expectTheme(page, nuevo)
  await expectIdentity(page, TIENDAS.name, COMPANY.name)

  for (const [account, store] of [
    ['gerente', 'Mall E2E'],
    ['gerente2', 'Centro E2E'],
  ] as const) {
    const { context, page: manager } = await loginInNewContext(browser, account)
    await expectIdentity(manager, TIENDAS.name, store)
    await expectTheme(manager, nuevo)
    await context.close()
  }
})

test('a brand inherits unset colors and the logo from the company', async ({ page }) => {
  await login(page, 'admin')

  // Saving through the real form must keep the unset color inherited. The fixture
  // company sidebar happens to equal the system default, so only the last test of
  // this file (which changes it) would catch this one being stored as a fixed color.
  await gotoBrands(page)
  await page.getByRole('button', { name: `Colores de ${DOS.name}` }).click()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Apariencia actualizada.')).toBeVisible()

  await chooseView(page, DOS.name)
  await expectIdentity(page, DOS.name, COMPANY.name)
  await expectTheme(page, { accent: DOS.accent, sidebar: COMPANY.sidebar })
  await expectLogo(page, `Logo de ${DOS.name}`, '/logo/e2e-empresa')
})

test('a manager of one store gets the brand with no selector, no forged brand and no brand screens', async ({
  page,
  context,
}) => {
  await login(page, 'gerente')
  await expectIdentity(page, TIENDAS.name, 'Mall E2E')
  await expect(switcher(page)).toHaveCount(0)

  // With a single store there is nothing to choose: a cookie cannot change that.
  const before = await shellToken(page, '--sidebar-bg')
  await context.addCookies([contextCookie('gerente', UNO.id, page.url())])
  await page.reload()
  await expectIdentity(page, TIENDAS.name, 'Mall E2E')
  expect(await shellToken(page, '--sidebar-bg')).toBe(before)

  for (const path of [BRANDS_TAB, '/settings/profile?tab=apariencia', '/settings/appearance']) {
    await page.goto(path)
    await expect(page).not.toHaveURL(/\/settings\/(profile|appearance)/)
  }
})

test('an employee gets the brand of the contract, and a borrowed shift does not change it', async ({
  page,
}) => {
  await login(page, 'empleado')
  await expectIdentity(page, UNO.name, 'Sucursal E2E Uno')
  await expectTheme(page, UNO)
  await expect(switcher(page)).toHaveCount(0)

  // The shift today is really in a store of another brand...
  await page.goto('/my-schedule')
  await expect(page.getByTitle(`${DOS.name} · Otra E2E`).first()).toBeVisible()
  // ...and the theme is still the one of the contract.
  await expectIdentity(page, UNO.name, 'Sucursal E2E Uno')
  await expectTheme(page, UNO)
})

test('another company cannot open a brand nor choose it through a forged cookie', async ({
  page,
  context,
}) => {
  await login(page, 'admin')
  await gotoBrands(page)
  await expect(page.getByText(UNO.name, { exact: true })).toBeVisible()
  await expect(page.getByText(AJENA.name)).toHaveCount(0)

  await context.addCookies([contextCookie('admin', AJENA.id, page.url())])
  await page.goto('/dashboard')
  await expectIdentity(page, COMPANY.name)
  await expectTheme(page, COMPANY)
  await expect(page.getByText(AJENA.name)).toHaveCount(0)
})

test('a brand with active branches cannot be deactivated, and an inactive one is not offered', async ({
  page,
}) => {
  await login(page, 'admin')

  await gotoBrands(page)
  await page.getByRole('button', { name: `Editar ${TIENDAS.name}` }).click()
  const editing = page.getByRole('dialog', { name: `Editar ${TIENDAS.name}` })
  await expect(editing.getByLabel('Marca activa')).toBeDisabled()
  await expect(editing.getByLabel('Marca activa')).toBeChecked()
  // Saving something else must not deactivate it behind the user's back.
  await editing.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByText('Marca actualizada.')).toBeVisible()

  await expect(await createBrand(page, 'Temporal E2E Inactiva')).toHaveCount(0)
  await page.getByRole('button', { name: 'Editar Temporal E2E Inactiva' }).click()
  const inactive = page.getByRole('dialog', { name: 'Editar Temporal E2E Inactiva' })
  await inactive.getByLabel('Marca activa').uncheck()
  await inactive.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(inactive).toHaveCount(0)
  await expect(
    page
      .getByRole('listitem')
      .filter({ hasText: 'Temporal E2E Inactiva' })
      .getByText('Inactiva', { exact: true })
  ).toBeVisible()

  await page.goto('/settings/branches/new')
  await page.getByRole('button', { name: /Marca \*/ }).click()
  const options = page.getByRole('listbox')
  await expect(options.getByRole('button', { name: UNO.name, exact: true })).toBeVisible()
  await expect(options.getByRole('button', { name: 'Temporal E2E Inactiva' })).toHaveCount(0)
})

test('a brand logo uploads to real Storage and falls back to the company when removed', async ({
  page,
}) => {
  await login(page, 'admin')
  await gotoBrands(page)
  await page.getByRole('button', { name: `Cambiar logo de ${UNO.name}` }).click()
  const dialog = page.getByRole('dialog', { name: `Logo de ${UNO.name}` })
  await dialog.getByTestId('photo-dropzone-input').setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: PIXEL_PNG,
  })
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByText('Logo actualizado.')).toBeVisible()

  await chooseView(page, UNO.name)
  await expectLogo(page, `Logo de ${UNO.name}`, `/marcas/${UNO.id}/`)

  await page.getByRole('button', { name: `Cambiar logo de ${UNO.name}` }).click()
  await dialog.getByRole('button', { name: 'Quitar logo', exact: true }).click()
  await page
    .getByRole('alertdialog', { name: '¿Quitar el logo?' })
    .getByRole('button', { name: 'Quitar', exact: true })
    .click()
  await expect(page.getByText('Logo eliminado.')).toBeVisible()
  await expectLogo(page, `Logo de ${UNO.name}`, '/logo/e2e-empresa')
})

test('branches read as "Marca · Sucursal" through real PostgREST embedding', async ({ page }) => {
  await login(page, 'admin')
  await page.goto('/employees')
  await expect(page.locator('table tbody tr').filter({ hasText: 'Empleado E2E' })).toContainText(
    `${UNO.name} · Sucursal E2E Uno`
  )
})

// Last on purpose: every other test compares against the fixture company theme.
test('a lost connection or an expired session never traps a dialog', async ({ page, context }) => {
  await login(page, 'admin')
  await gotoBrands(page)
  const temporal = 'Temporal E2E Sin Red'
  await expect(await createBrand(page, temporal)).toHaveCount(0)

  // Server actions POST to the current URL: reads keep working, the action fails.
  await page.route('**/settings/profile**', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue()
  )

  await page.getByRole('button', { name: `Colores de ${temporal}` }).click()
  const colors = page.getByRole('dialog', { name: `Colores de ${temporal}` })
  const save = colors.getByRole('button', { name: 'Guardar cambios', exact: true })
  await save.click()
  await expect(page.getByText(/^No se pudo confirmar el guardado/)).toBeVisible()
  await expect(save).toBeEnabled()
  await colors.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(colors).toHaveCount(0)

  await page.getByRole('button', { name: `Más acciones de ${temporal}` }).click()
  await page.getByRole('button', { name: 'Eliminar marca', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByText(/^No se pudo confirmar la eliminación/)).toBeVisible()
  await expect(page.getByRole('button', { name: `Editar ${temporal}` })).toBeVisible()

  await page.unroute('**/settings/profile**')

  // Session gone: the proxy answers the action with the login page, which Next cannot
  // read as an action response. No navigation happens, so it reads as one more failure
  // and the dialog stays usable. The next navigation is what lands on login.
  await gotoBrands(page)
  await page.getByRole('button', { name: `Colores de ${temporal}` }).click()
  await context.clearCookies()
  await save.click()
  await expect(page.getByText(/^No se pudo confirmar el guardado/)).toBeVisible()
  await expect(save).toBeEnabled()
  await page.reload()
  await expect(page).toHaveURL(/\/login/)
})

test('losing the permission mid-session redirects, without claiming a failure', async ({
  page,
  context,
  browser,
}) => {
  await login(page, 'admin')
  await gotoBrands(page)
  await page.getByRole('button', { name: `Colores de ${TIENDAS.name}` }).click()

  // Live session, no EMPRESAS_WRITE: the proxy lets it through and the guard redirects.
  const gerente = await loginInNewContext(browser, 'gerente')
  const cookies = await gerente.context.cookies()
  await gerente.context.close()
  await context.clearCookies()
  await context.addCookies(cookies)

  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page).toHaveURL(/\/unauthorized/)
  // A single read on purpose: toHaveCount(0) retries for 15 s, a toast leaves by itself
  // after 5, and the test passed with the guard removed. Verified by breaking the guard.
  await page.waitForTimeout(500)
  expect(await page.getByText(/^No se pudo confirmar/).count()).toBe(0)
})

test('the company theme is editable and reaches the brands that inherit it', async ({ page }) => {
  const nuevo = { accent: '#1e40af', sidebar: '#f1efe8' }
  await login(page, 'admin')
  // The old route keeps working: it lands on the tab that replaced it.
  await page.goto('/settings/appearance')
  await expect(page).toHaveURL(/\/settings\/profile\?tab=apariencia$/)
  await page.waitForLoadState('networkidle')
  await saveColors(page, nuevo.accent, nuevo.sidebar)

  await page.getByRole('link', { name: 'Volver al menú principal' }).click()
  await expect(page).not.toHaveURL(/\/settings/)
  await expectTheme(page, nuevo)
  await page.reload()
  await expectTheme(page, nuevo)

  await chooseView(page, DOS.name)
  await expectTheme(page, { accent: DOS.accent, sidebar: nuevo.sidebar })
})
