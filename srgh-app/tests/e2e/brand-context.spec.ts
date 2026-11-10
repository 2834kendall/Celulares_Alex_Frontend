import { execFileSync } from 'node:child_process'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { deriveBrandTokens } from '../../src/lib/utils/color'

/**
 * The top bar selector filtering data, through the real app, Auth, PostgREST and
 * RLS of the dedicated local stack.
 *
 * Accounts are built from INVENTED roles with chosen permissions (see fixtures.sql):
 * nothing here may depend on a known role, because roles can be created and edited.
 *
 * Tests share data and run in order: the shift moved near the end stays moved.
 */
const COMPANY = { name: 'Empresa E2E Uno', accent: '#166534', sidebar: '#eef1f4' }
const UNO = { id: 1051, name: 'Marca E2E Uno' }
const DOS = { id: 1052, name: 'Marca E2E Dos' }
const TIENDAS = { id: 1054, name: 'Marca E2E Tiendas', accent: '#334155', sidebar: '#f1efe8' }

const CONTEXT_COOKIE = 'sgrh_marca_contexto'

// Base in UNO, shift today in DOS.
const EMPLEADO = 'Empleado E2E'
// Base in TIENDAS.
const NOELIA = 'Noelia Tiendas'
// Base in TIENDAS, shift today in DOS, with a sick leave that same day.
const PRISCILA = 'Priscila Prestada'
// Moved from UNO to DOS this cycle.
const TERESA = 'Teresa Trasladada'
// Former employee: an old contract in DOS, the last one in UNO.
const ELENA = 'Elena Exempleada'

async function signIn(page: Page, account: string) {
  await page.goto('/login')
  await page.locator('#email-input').fill(`${account}@e2e.sgrh.local`)
  await page.locator('#pass-input').fill('Sgrh105OnlyLocal!')
  await page.locator('#submit-login').click()
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30000 })
}

/** Ends the session and keeps every other cookie, as a browser left open would. */
async function switchAccount(page: Page, context: BrowserContext, account: string) {
  await context.clearCookies({ name: /^sb-/ })
  await signIn(page, account)
}

function sql(query: string): string {
  return execFileSync(
    'docker',
    ['exec', 'supabase_db_sgrh105-e2e', 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', query],
    { encoding: 'utf8' }
  ).trim()
}

const usrId = (account: string) =>
  Number(sql(`SELECT usr_id FROM sgrh_usuarios WHERE usr_email='${account}@e2e.sgrh.local'`))

async function forgeContext(page: Page, context: BrowserContext, account: string, marcaId: number) {
  await context.addCookies([
    {
      name: CONTEXT_COOKIE,
      value: encodeURIComponent(JSON.stringify({ u: usrId(account), m: marcaId })),
      url: page.url(),
    },
  ])
}

const switcher = (page: Page) =>
  page.locator('header').getByRole('button', { name: 'Marca', exact: true })

const banner = (page: Page) => page.getByRole('status').filter({ hasText: 'Viendo solo' })

async function chooseBrand(page: Page, name: string) {
  await switcher(page).click()
  await page.getByRole('listbox').getByRole('button', { name, exact: true }).click()
  await expect(switcher(page)).toContainText(name)
}

async function expectNames(page: Page, present: string[], absent: string[]) {
  for (const name of present) {
    await expect(page.getByText(name).filter({ visible: true }).first()).toBeVisible()
  }
  for (const name of absent) {
    await expect(page.getByText(name)).toHaveCount(0)
  }
}

const shellToken = (page: Page, token: string) =>
  page
    .locator('#app-shell-root')
    .evaluate((el, name) => getComputedStyle(el).getPropertyValue(name).trim(), token)

async function expectTheme(page: Page, theme: { accent: string; sidebar: string }) {
  await expect
    .poll(() => shellToken(page, '--color-brand-action'))
    .toBe(deriveBrandTokens(theme.accent)['--color-brand-action'])
  await expect.poll(() => shellToken(page, '--sidebar-bg')).toBe(theme.sidebar)
}

test('choosing a brand narrows every list and paints it, and "Todas" brings everything back', async ({
  page,
}) => {
  await signIn(page, 'admin')
  await expect(switcher(page)).toContainText('Todas las marcas')
  await expectTheme(page, COMPANY)
  await expect(banner(page)).toHaveCount(0)

  await page.goto('/employees')
  await expectNames(page, [EMPLEADO, NOELIA, TERESA], [])

  // In place, with no reload: what the person really does.
  await chooseBrand(page, TIENDAS.name)
  await expect(banner(page)).toContainText(TIENDAS.name)
  await expectTheme(page, TIENDAS)
  await expectNames(page, [NOELIA, PRISCILA], [EMPLEADO, TERESA, ELENA])

  await page.goto('/evaluations')
  await expectNames(page, [NOELIA], [EMPLEADO, TERESA])

  await page.goto('/recruitment')
  await expectNames(page, ['Clara Tiendas'], ['Uma Marcauno'])

  await page.goto('/attendance')
  await expectNames(page, [NOELIA], [EMPLEADO, TERESA])

  await page.goto('/payroll')
  await expect(page.getByText(`${DOS.name} · Otra E2E`)).toHaveCount(0)
  await expect(page.getByText(`${UNO.name} · Sucursal E2E Uno`)).toHaveCount(0)

  await page.goto('/settings/branches')
  await expectNames(page, ['Mall E2E', 'Centro E2E'], ['Otra E2E', 'Sucursal E2E Uno'])

  await chooseBrand(page, UNO.name)
  await page.goto('/employees')
  // The former employee counts for the brand of her LAST contract.
  await expectNames(page, [EMPLEADO, ELENA], [NOELIA, TERESA])

  await page.goto('/payroll')
  await expectNames(page, [`${UNO.name} · Sucursal E2E Uno`], [`${DOS.name} · Otra E2E`])

  await chooseBrand(page, DOS.name)
  await page.goto('/employees')
  await expectNames(page, [TERESA], [ELENA, EMPLEADO])

  await page.goto('/dashboard')
  await expect(banner(page)).toContainText(DOS.name)

  await page.goto('/employees')
  await chooseBrand(page, 'Todas las marcas')
  await expect(banner(page)).toHaveCount(0)
  await expectTheme(page, COMPANY)
  await expectNames(page, [EMPLEADO, NOELIA, TERESA], [])
})

test('the choice survives a reload and only leaves with "Ver todas"', async ({ page }) => {
  await signIn(page, 'admin')
  await chooseBrand(page, TIENDAS.name)

  await page.reload()
  await expect(banner(page)).toContainText(TIENDAS.name)

  await banner(page).getByRole('button', { name: 'Ver todas', exact: true }).click()
  await expect(banner(page)).toHaveCount(0)
  await expect(switcher(page)).toContainText('Todas las marcas')
})

test('accounts with an invented role get the selector by permission and stores, not by role', async ({
  page,
  context,
}) => {
  // Reads data, stores in two brands: only those two brands, and it narrows.
  await signIn(page, 'asist2m')
  await switcher(page).click()
  const options = page.getByRole('listbox').getByRole('button')
  await expect(options).toHaveText(['Todas las marcas', DOS.name, UNO.name])
  await page.keyboard.press('Escape')
  await page.goto('/attendance')
  await expectNames(page, [EMPLEADO], [NOELIA])
  await chooseBrand(page, DOS.name)
  await expectNames(page, [EMPLEADO, PRISCILA], [NOELIA])
  await chooseBrand(page, UNO.name)
  // Her shift today is in DOS: under UNO she is gone, as for a manager of that store.
  await expect(page.getByText(EMPLEADO)).toHaveCount(0)

  // Reads data, two stores of ONE brand: nothing to choose, and both stores show.
  await context.clearCookies()
  await signIn(page, 'asist1m')
  await expect(switcher(page)).toHaveCount(0)
  await page.goto('/attendance')
  await expectNames(page, [NOELIA], [])

  // Reads data at company level WITHOUT EMPRESAS_WRITE: it has the selector.
  await context.clearCookies()
  await signIn(page, 'asistempresa')
  await expect(switcher(page)).toContainText('Todas las marcas')

  // Stores in two brands but no data to filter: no selector, whatever the stores.
  await context.clearCookies()
  await signIn(page, 'personal2m')
  await expect(switcher(page)).toHaveCount(0)
})

test('a company with a single brand has no selector and no way to choose it', async ({ page }) => {
  await signIn(page, 'admin2')
  await expect(switcher(page)).toHaveCount(0)

  await page.goto('/settings/profile?tab=marcas')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /^Más acciones de / }).click()
  await expect(page.getByRole('button', { name: 'Eliminar marca', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ver solo esta marca', exact: true })).toHaveCount(
    0
  )
})

test('a forged cookie is ignored, and the next account does not inherit the filter', async ({
  page,
  context,
}) => {
  // Valid format and owner, but a brand this account cannot reach.
  await signIn(page, 'asist2m')
  await forgeContext(page, context, 'asist2m', TIENDAS.id)
  await page.goto('/attendance')
  await expect(banner(page)).toHaveCount(0)
  await expectNames(page, [EMPLEADO], [])

  // A brand of ANOTHER company.
  await forgeContext(page, context, 'asist2m', 1053)
  await page.goto('/attendance')
  await expect(banner(page)).toHaveCount(0)
  await expect(page.getByText('Marca E2E Ajena')).toHaveCount(0)
  await expectNames(page, [EMPLEADO], [])

  // Shared machine: the session ends without logout and somebody else signs in.
  await chooseBrand(page, DOS.name)
  await expect(banner(page)).toBeVisible()
  await switchAccount(page, context, 'asistempresa')
  await expect(switcher(page)).toContainText('Todas las marcas')
  await expect(banner(page)).toHaveCount(0)
})

test('logging out deletes the choice', async ({ page, context }) => {
  await signIn(page, 'admin')
  await chooseBrand(page, DOS.name)
  expect((await context.cookies()).some((c) => c.name === CONTEXT_COOKIE)).toBe(true)

  await page.locator('header').getByRole('button', { name: 'Menu de usuario' }).click()
  await page.getByRole('button', { name: /Cerrar sesi/ }).click()
  await expect(page).toHaveURL(/\/login/)
  expect((await context.cookies()).some((c) => c.name === CONTEXT_COOKIE)).toBe(false)
})

test('losing the permission turns the filter off on the next token', async ({ page, context }) => {
  const quitar = `DELETE FROM sgrh_rol_permisos WHERE rpe_rol_id=(SELECT rol_id FROM sgrh_cat_roles WHERE rol_codigo='E2E_TEMPORAL') AND rpe_permiso_id=(SELECT per_id FROM sgrh_cat_permisos WHERE per_codigo='ASISTENCIA_READ')`
  const devolver = `INSERT INTO sgrh_rol_permisos (rpe_rol_id, rpe_permiso_id) SELECT r.rol_id, p.per_id FROM sgrh_cat_roles r, sgrh_cat_permisos p WHERE r.rol_codigo='E2E_TEMPORAL' AND p.per_codigo='ASISTENCIA_READ' ON CONFLICT DO NOTHING`

  await signIn(page, 'temporal')
  await chooseBrand(page, DOS.name)
  await expect(banner(page)).toBeVisible()

  sql(quitar)
  try {
    await switchAccount(page, context, 'temporal')
    expect((await context.cookies()).some((c) => c.name === CONTEXT_COOKIE)).toBe(true)
    await expect(switcher(page)).toHaveCount(0)
    await expect(banner(page)).toHaveCount(0)
  } finally {
    sql(devolver)
  }
})

test('a borrowed shift shows where it is worked, and only there', async ({ page }) => {
  await signIn(page, 'admin')
  await chooseBrand(page, DOS.name)

  await page.goto('/schedule')
  await expectNames(page, [EMPLEADO, PRISCILA, TERESA], [NOELIA])

  await page.goto('/attendance')
  await expectNames(page, [EMPLEADO], [NOELIA])

  // The person is still of the brand of the contract.
  await page.goto('/employees')
  await expectNames(page, [TERESA], [EMPLEADO, PRISCILA])
})

test('an absence on a borrowed shift still blocks the cell and "Pegar" does not overwrite it', async ({
  page,
}) => {
  const hoyPrg = () =>
    sql(`SELECT prg_hora_entrada_custom FROM sgrh_programacion_semanal WHERE prg_id=1053`)
  const filasDeLaSemana = () =>
    Number(
      sql(
        `SELECT count(*) FROM sgrh_programacion_semanal WHERE prg_historial_laboral_id=1053 AND prg_fecha >= date_trunc('week', (now() AT TIME ZONE 'America/Costa_Rica')::date)`
      )
    )

  await signIn(page, 'admin')
  await chooseBrand(page, DOS.name)
  await page.goto('/schedule')

  const fila = page.locator('tr').filter({ hasText: PRISCILA })
  await expect(
    fila
      .getByTitle(/Incapacidad/)
      .filter({ visible: true })
      .first()
  ).toBeVisible()
  expect(hoyPrg()).toBe('08:00:00')
  const antes = filasDeLaSemana()

  // Last week she worked two days, at other hours: copy it and paste it over this one.
  await page.getByRole('button', { name: 'Semana anterior', exact: true }).click()
  // Waits for that week, with no absence: copying THIS week would prove nothing.
  await expect(page).toHaveURL(/[?&]week=/)
  await expect(fila.getByTitle(/Incapacidad/)).toHaveCount(0)
  await page.getByRole('button', { name: 'Copiar el horario de esta vista', exact: true }).click()
  await expect(page.getByText(/^Semana copiada/)).toBeVisible()
  await page.getByRole('button', { name: 'Semana siguiente', exact: true }).click()
  await expect(
    fila
      .getByTitle(/Incapacidad/)
      .filter({ visible: true })
      .first()
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Pegar el horario copiado en esta vista', exact: true })
    .click()
  await expect(page.getByText('Horario pegado.')).toBeVisible()

  // The paste really happened: the free day of this week was filled...
  await expect.poll(filasDeLaSemana).toBe(antes + 1)
  // ...and the day with the absence kept its hours.
  expect(hoyPrg()).toBe('08:00:00')
})

test('with a brand chosen a shift can still move to a store of another brand', async ({ page }) => {
  const sucursalDelTurno = () =>
    sql(`SELECT prg_sucursal_id FROM sgrh_programacion_semanal WHERE prg_id=1052`)

  await signIn(page, 'admin')
  await chooseBrand(page, TIENDAS.name)
  await page.goto('/schedule')
  expect(sucursalDelTurno()).toBe('1053')

  await page
    .getByRole('button', { name: new RegExp(`^Sucursal de ${NOELIA} Prueba el `) })
    .first()
    .click()
  await page
    .getByRole('listbox')
    .getByRole('button', { name: `${DOS.name} · Otra E2E`, exact: true })
    .click()
  await expect.poll(sucursalDelTurno).toBe('1055')

  // Now she works today in DOS. Her contract still belongs to TIENDAS.
  await chooseBrand(page, DOS.name)
  await expectNames(page, [NOELIA], [])
  await page.goto('/attendance')
  await expectNames(page, [NOELIA], [])
  await page.goto('/employees')
  await expect(page.getByText(NOELIA)).toHaveCount(0)
})

test('a transferred person keeps the whole aguinaldo under a brand, and it stays payable', async ({
  page,
}) => {
  // An invented role with payroll and stores in two brands: no active role has that today.
  await signIn(page, 'nomina2m')
  await page.goto('/payroll/aguinaldo-liquidacion')
  const fila = page.getByRole('row', { name: new RegExp(TERESA) })
  await expect(fila).toBeVisible()
  const completa = await fila.textContent()
  expect(completa).toMatch(/30[\s.,]?000/)

  await chooseBrand(page, DOS.name)
  await expect(banner(page)).toBeVisible()
  await expect(fila).toBeVisible()
  await expect.poll(() => fila.textContent()).toBe(completa)
  await expect(page.getByText(/sucursal que tu usuario no ve/)).toHaveCount(0)

  // Her current contract is in DOS: under UNO the row is not listed.
  await chooseBrand(page, UNO.name)
  await expect(fila).toHaveCount(0)
})

test('the branches screen can leave the brand of the top bar and stay there', async ({ page }) => {
  await signIn(page, 'admin')
  await chooseBrand(page, TIENDAS.name)
  await page.goto('/settings/branches')
  await page.waitForLoadState('networkidle')
  await expectNames(page, ['Mall E2E'], ['Otra E2E'])

  await page
    .locator('select')
    .filter({ hasText: 'Todas las marcas' })
    .selectOption({ label: 'Todas las marcas' })
  await expect(page).toHaveURL(/\/settings\/branches\?marca=todas$/)
  await expectNames(page, ['Mall E2E', 'Otra E2E'], [])

  // Going to a branch and back must not fall back to the top bar brand.
  await page.getByRole('link', { name: /Otra E2E/ }).click()
  await expect(page).toHaveURL(/\/settings\/branches\/1055\?marca=todas$/)
  await page.goBack()
  await expectNames(page, ['Mall E2E', 'Otra E2E'], [])
  await expect(page).toHaveURL(/marca=todas/)
})

test('changing the brand resets the filters of the screen', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/schedule')
  await page.waitForLoadState('networkidle')
  const filtro = page.getByRole('combobox', { name: 'Filtrar por sucursal', exact: true })
  await filtro.click()
  await page.getByRole('listbox').getByText(`${TIENDAS.name} · Mall E2E`).click()
  await expect(filtro).toHaveValue(/Mall E2E/)

  await chooseBrand(page, UNO.name)
  await expect(filtro).toHaveValue('Todas las sucursales')
})

test('with no connection the selector warns, and nothing is lost', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/employees')
  await page.waitForLoadState('networkidle')

  await page.route('**/employees**', (route) =>
    route.request().method() === 'POST' ? route.abort() : route.continue()
  )
  await switcher(page).click()
  await page.getByRole('listbox').getByRole('button', { name: DOS.name, exact: true }).click()
  await expect(page.getByText(/^No se pudo cambiar la marca/)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await expect(banner(page)).toHaveCount(0)
})

test('with unsaved changes the selector asks first', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/settings/profile')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  const comercial = page.locator('input[name="org_nombre_fantasia"]')
  await comercial.fill('Cambio sin guardar')

  await switcher(page).click()
  await page.getByRole('listbox').getByRole('button', { name: DOS.name, exact: true }).click()
  await page.getByRole('button', { name: 'Seguir editando', exact: true }).click()
  await expect(comercial).toHaveValue('Cambio sin guardar')
  await expect(banner(page)).toHaveCount(0)

  await switcher(page).click()
  await page.getByRole('listbox').getByRole('button', { name: DOS.name, exact: true }).click()
  await page.getByRole('button', { name: 'Salir sin guardar', exact: true }).click()
  await expect(banner(page)).toContainText(DOS.name)
})

test('on a phone the selector lives in the menu and nothing overflows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'admin')
  await expect(switcher(page)).toBeHidden()

  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click()
  await page.getByRole('button', { name: 'Marca', exact: true }).filter({ visible: true }).click()
  await page.getByRole('listbox').getByRole('button', { name: TIENDAS.name, exact: true }).click()
  await expect(banner(page)).toContainText(TIENDAS.name)
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true)
})
