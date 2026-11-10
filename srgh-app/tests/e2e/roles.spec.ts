import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { test, expect, type Browser, type Locator, type Page } from '@playwright/test'

/**
 * Roles per company (SGRH-108) through the real app, Auth, the access-token hook,
 * PostgREST and the role RPCs of the dedicated local stack.
 *
 * What only this layer can show: that the screens work on each company's own copy
 * of a role (never on a template), that a change reaches the next session of the
 * people who hold the role, and that the RPCs and tables are not reachable with a
 * browser session.
 *
 * The outcome of every action is read back from the database with the service
 * client, so no test depends on timing or on what a previous screen happened to
 * render. fixtures.sql resets the roles of both companies on every run; each test
 * also leaves them as it found them.
 */
const local = JSON.parse(readFileSync('.e2e/connection.json', 'utf8').replace(/^﻿/, '')) as Record<
  string,
  string
>
if (local.API_URL !== 'http://127.0.0.1:55421') throw new Error('Unexpected test API')
const db = createClient(local.API_URL, local.SECRET_KEY || local.SERVICE_ROLE_KEY)

const ADMIN = 'Administrador de Empresa'
const GERENTE = 'Gerente de Sucursal'
const EMPLEADO = 'Empleado'
const KIOSCO = 'Kiosco de asistencia'
const CREATED = 'Rol E2E Cajero'
/**
 * The roles brand-context.spec.ts invents for company 1051 (fixtures.sql). They are
 * roles of the company like any other, so the list and the invite form show them.
 */
const INVENTED = ['E2E_OPERADOR', 'E2E_SOLO_PERSONAL', 'E2E_NOMINA', 'E2E_TEMPORAL']

type Account = 'admin' | 'gerente' | 'gerente2'

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

async function roleId(code: string): Promise<number> {
  const { data, error } = await db
    .from('sgrh_cat_roles')
    .select('rol_id')
    .eq('rol_codigo', code)
    .single()
  if (error) throw error
  return data.rol_id
}

async function roleByName(empresa: number, name: string) {
  const { data, error } = await db
    .from('sgrh_cat_roles')
    .select('rol_id, rol_codigo')
    .eq('rol_empresa_id', empresa)
    .eq('rol_nombre', name)
    .maybeSingle()
  if (error) throw error
  return data
}

async function permissionsOf(rol: number): Promise<string[]> {
  const { data, error } = await db
    .from('sgrh_rol_permisos')
    .select('sgrh_cat_permisos ( per_codigo )')
    .eq('rpe_rol_id', rol)
    .returns<{ sgrh_cat_permisos: { per_codigo: string } }[]>()
  if (error) throw error
  return data.map((row) => row.sgrh_cat_permisos.per_codigo).sort()
}

/** The role of the account's active assignment in company 1051. */
async function roleOfAccount(account: Account): Promise<number> {
  const user = await db
    .from('sgrh_usuarios')
    .select('usr_id')
    .eq('usr_email', `${account}@e2e.sgrh.local`)
    .single()
  if (user.error) throw user.error
  const { data, error } = await db
    .from('sgrh_usuarios_empresa_rol')
    .select('uer_rol_id')
    .eq('uer_usuario_id', user.data.usr_id)
    .eq('uer_empresa_id', 1051)
    .eq('uer_activo', true)
    .single()
  if (error) throw error
  return data.uer_rol_id
}

const permission = (page: Page, label: string) =>
  page.getByRole('checkbox', { name: new RegExp(`^${label}`) })

const dialog = (page: Page) => page.getByRole('alertdialog')

/**
 * Waits until React has hydrated the element. The server-rendered form is on
 * screen before it reacts: what is typed or checked in that gap is lost when
 * React takes the controlled fields over, and the test would save something else.
 * React marks every hydrated host node with a `__reactProps$…` key.
 */
async function hydrated(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith('__reactProps$')))
    )
    .toBe(true)
}

async function openRole(page: Page, id: number, name: string) {
  await page.goto(`/settings/roles/${id}`)
  await expect(page.getByRole('heading', { name, exact: true, level: 1 })).toBeVisible()
  await hydrated(page.locator('#rol-nombre'))
}

async function openNewRole(page: Page) {
  await page.goto('/settings/roles/new')
  await hydrated(page.locator('#rol-nombre'))
}

/** Saving an existing role goes back to the list; the toast confirms the server answered. */
async function saveChanges(page: Page) {
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Rol actualizado.')).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/roles(\?.*)?$/)
}

/** The roles the "invite user" form offers, sorted (the screen's own order is not under test). */
async function offeredRoles(page: Page): Promise<string[]> {
  await page.goto('/employees')
  const tab = page.getByRole('tab', { name: /Usuarios/ })
  await hydrated(tab)
  await tab.click()
  await page.getByRole('button', { name: 'Invitar usuario' }).click()
  await page.locator('label', { hasText: 'Rol *' }).getByRole('button').click()
  const options = page.getByRole('listbox').getByRole('option')
  await expect(options.first()).toBeVisible()
  return (await options.allTextContents()).map((text) => text.trim()).sort()
}

const sidebarLink = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name, exact: true })

let ids: { admin: number; gerente: number; empleado: number; kiosco: number }
let template: { gerente: number }
let foreign: { gerente: number }

test.beforeAll(async () => {
  ids = {
    admin: await roleId('EMPRESA_1051_ADMIN'),
    gerente: await roleId('EMPRESA_1051_GERENTE'),
    empleado: await roleId('EMPRESA_1051_EMPLEADO'),
    kiosco: await roleId('KIOSCO'),
  }
  template = { gerente: await roleId('GERENTE') }
  foreign = { gerente: await roleId('EMPRESA_1052_GERENTE') }
})

test('each company starts with its own copy of the templates and its accounts use it', async () => {
  // Same permissions as the template, in a row of its own.
  expect(ids.gerente).not.toBe(template.gerente)
  expect(foreign.gerente).not.toBe(ids.gerente)
  expect(await permissionsOf(ids.gerente)).toEqual(await permissionsOf(template.gerente))
  expect(await permissionsOf(foreign.gerente)).toEqual(await permissionsOf(template.gerente))
  expect(await roleOfAccount('admin')).toBe(ids.admin)
  expect(await roleOfAccount('gerente')).toBe(ids.gerente)
  expect(await roleOfAccount('gerente2')).toBe(ids.gerente)
})

test('the roles screen lists the company roles and the kiosk, and the session shows the role name', async ({
  page,
}) => {
  await login(page, 'admin')
  // The top bar shows the name of the role, not the generated code of the JWT.
  // The app's top bar is the first <header>; dashboard panels have their own.
  const header = page.locator('header').first()
  await expect(header.getByText(ADMIN, { exact: true }).filter({ visible: true })).toBeVisible()
  await expect(header).not.toContainText('EMPRESA_1051')

  await page.goto('/settings/roles')
  const list = page.getByRole('list', { name: 'Roles' })
  // Every card opens the company's copy, never the template row.
  for (const [name, id] of [
    [ADMIN, ids.admin],
    [GERENTE, ids.gerente],
    [EMPLEADO, ids.empleado],
  ] as const) {
    await expect(list.getByRole('link', { name, exact: true })).toHaveAttribute(
      'href',
      `/settings/roles/${id}`
    )
  }
  const kiosk = list.getByRole('listitem').filter({ hasText: KIOSCO })
  await expect(kiosk.getByText('No asignable')).toBeVisible()
  await expect(kiosk.getByRole('link', { name: 'Ver permisos' })).toBeVisible()
  // Three copies, the four roles brand-context.spec.ts invents for this company, and
  // the kiosk: no inactive template reaches the screen.
  await expect(list.getByRole('listitem')).toHaveCount(3 + INVENTED.length + 1)
  await expect(list).not.toContainText('Encargado de Recursos Humanos')

  await page.goto('/profile')
  const profile = page.locator('main')
  await expect(profile.getByText('Rol en el sistema')).toBeVisible()
  await expect(profile.getByText(ADMIN, { exact: true })).toBeVisible()
  await expect(profile).not.toContainText('EMPRESA_1051')
})

test('the kiosk role is read-only and nobody removes role administration from their own role', async ({
  page,
}) => {
  await login(page, 'admin')
  await openRole(page, ids.kiosco, KIOSCO)
  await expect(page.getByText('Rol de la cuenta del kiosco: no se edita.')).toBeVisible()
  await expect(page.locator('#rol-nombre')).toHaveAttribute('readonly', '')
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Eliminar rol' })).toHaveCount(0)
  for (const checkbox of await page.getByRole('checkbox').all()) {
    await expect(checkbox).toBeDisabled()
  }

  await openRole(page, ids.admin, ADMIN)
  const own = permission(page, 'Administrar roles y permisos')
  await expect(own).toBeChecked()
  await expect(own).toBeDisabled()
  // Control: the lock is about that one permission, not the whole form.
  await expect(permission(page, 'Ver reportes')).toBeEnabled()
})

test('a template and a role of another company cannot be opened', async ({ page }) => {
  await login(page, 'admin')
  for (const id of [template.gerente, foreign.gerente]) {
    await page.goto(`/settings/roles/${id}`)
    await expect(page.getByText('No encontramos esta página')).toBeVisible()
    await expect(page.locator('#rol-nombre')).toHaveCount(0)
  }
  // Control: the same route does open the company's own role.
  await openRole(page, ids.gerente, GERENTE)
})

test('a browser session cannot run the role RPCs nor write the role tables directly', async () => {
  const client = createClient(local.API_URL, local.PUBLISHABLE_KEY || local.ANON_KEY)
  const session = await client.auth.signInWithPassword({
    email: 'admin@e2e.sgrh.local',
    password: 'Sgrh105OnlyLocal!',
  })
  expect(session.error).toBeNull()
  const actor = session.data.user!.id
  const before = {
    own: await permissionsOf(ids.gerente),
    template: await permissionsOf(template.gerente),
  }

  // The RPCs take the actor as a parameter: only the server may call them.
  const save = await client.rpc('sgrh_save_role', {
    p_actor: actor,
    p_empresa: 1051,
    p_id: ids.gerente,
    p_nombre: GERENTE,
    p_descripcion: null,
    p_permisos: [],
  })
  expect(save.error).not.toBeNull()
  const remove = await client.rpc('sgrh_delete_role', {
    p_actor: actor,
    p_empresa: 1051,
    p_id: ids.empleado,
  })
  expect(remove.error).not.toBeNull()

  // Table writes: whatever PostgREST answers, nothing changes.
  await client.from('sgrh_cat_roles').update({ rol_nombre: 'Tomado E2E' }).eq('rol_id', ids.gerente)
  await client
    .from('sgrh_cat_roles')
    .update({ rol_nombre: 'Tomado E2E' })
    .eq('rol_id', template.gerente)
  await client.from('sgrh_rol_permisos').delete().eq('rpe_rol_id', ids.gerente)
  await client.from('sgrh_rol_permisos').delete().eq('rpe_rol_id', template.gerente)

  expect(await permissionsOf(ids.gerente)).toEqual(before.own)
  expect(await permissionsOf(template.gerente)).toEqual(before.template)
  expect(await roleByName(1051, 'Tomado E2E')).toBeNull()
  expect(await roleId('GERENTE')).toBe(template.gerente)
  expect(await roleId('EMPRESA_1051_EMPLEADO')).toBe(ids.empleado)
  // Control: the session is real and does read its company's roles.
  const read = await client.from('sgrh_cat_roles').select('rol_id').eq('rol_id', ids.gerente)
  expect(read.data).toEqual([{ rol_id: ids.gerente }])
  // ...but not the ones of another company.
  const other = await client.from('sgrh_cat_roles').select('rol_id').eq('rol_id', foreign.gerente)
  expect(other.data).toEqual([])
})

test('editing Gerente changes this company only and reaches the manager on the next login', async ({
  page,
  browser,
}) => {
  const original = await permissionsOf(ids.gerente)
  expect(original).toContain('EVALUACIONES_READ')

  // Control: before the change the manager does get the Evaluations screen.
  const antes = await loginInNewContext(browser, 'gerente')
  await expect(sidebarLink(antes.page, 'Evaluaciones').first()).toBeVisible()
  await antes.context.close()

  await login(page, 'admin')
  await openRole(page, ids.gerente, GERENTE)
  await permission(page, 'Ver evaluaciones').uncheck()
  // Unchecking "see" drops what depends on it.
  await expect(permission(page, 'Editar evaluaciones')).not.toBeChecked()
  await saveChanges(page)

  const expected = original.filter((code) => !code.startsWith('EVALUACIONES_'))
  expect(await permissionsOf(ids.gerente)).toEqual(expected)
  // The other company's Gerente and the template keep theirs.
  expect(await permissionsOf(foreign.gerente)).toEqual(original)
  expect(await permissionsOf(template.gerente)).toEqual(original)

  // A new session of the manager is built by the real hook from the edited role.
  const despues = await loginInNewContext(browser, 'gerente')
  await expect(sidebarLink(despues.page, 'Asistencia').first()).toBeVisible()
  await expect(sidebarLink(despues.page, 'Evaluaciones')).toHaveCount(0)
  await despues.context.close()

  // Restore through the same screen: the administrator has both permissions, so may grant them.
  await openRole(page, ids.gerente, GERENTE)
  await permission(page, 'Editar evaluaciones').check()
  await expect(permission(page, 'Ver evaluaciones')).toBeChecked()
  await saveChanges(page)
  expect(await permissionsOf(ids.gerente)).toEqual(original)
})

test('a created role rejects a duplicate name, is offered when inviting a user and can be deleted', async ({
  page,
}) => {
  await login(page, 'admin')
  await openNewRole(page)
  await page.locator('#rol-nombre').fill(CREATED)
  await permission(page, 'Registrar asistencia').check()
  // Checking "write" checks "see".
  await expect(permission(page, 'Ver asistencia')).toBeChecked()
  await page.getByRole('button', { name: 'Crear rol' }).click()
  await expect(page.getByText('Rol creado.')).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/roles\/\d+$/)

  const created = await roleByName(1051, CREATED)
  expect(created).not.toBeNull()
  expect(page.url()).toContain(`/settings/roles/${created!.rol_id}`)
  expect(await permissionsOf(created!.rol_id)).toEqual(['ASISTENCIA_READ', 'ASISTENCIA_WRITE'])
  // It belongs to this company alone.
  expect(await roleByName(1052, CREATED)).toBeNull()

  // The same name, written differently, is the same name.
  await openNewRole(page)
  await page.locator('#rol-nombre').fill(` ${CREATED.toUpperCase()} `)
  await page.getByRole('button', { name: 'Crear rol' }).click()
  await expect(page.getByText('Ya existe un rol con ese nombre.')).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/roles\/new$/)

  // Inviting a user offers the company roles: no template, no kiosk.
  expect(await offeredRoles(page)).toEqual([ADMIN, EMPLEADO, GERENTE, CREATED, ...INVENTED].sort())

  await openRole(page, created!.rol_id, CREATED)
  await page.getByRole('button', { name: 'Eliminar rol' }).click()
  await dialog(page).getByRole('button', { name: 'Eliminar', exact: true }).click()
  await expect(page.getByText('Rol eliminado.')).toBeVisible()
  await expect(page).toHaveURL(/\/settings\/roles(\?.*)?$/)
  expect(await roleByName(1051, CREATED)).toBeNull()
  expect(await offeredRoles(page)).toEqual([ADMIN, EMPLEADO, GERENTE, ...INVENTED].sort())
})

test('a role is never tied to a branch, and one in use cannot be deleted', async ({ page }) => {
  await login(page, 'admin')
  // Two managers of two different branches hold the same role.
  expect(await roleOfAccount('gerente')).toBe(ids.gerente)
  expect(await roleOfAccount('gerente2')).toBe(ids.gerente)

  await openRole(page, ids.gerente, GERENTE)
  // The editor has no branch to choose and no per-branch permissions.
  await expect(page.getByLabel('Sucursal')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Permisos por sucursal' })).toHaveCount(0)
  // Control: the form is there.
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeEnabled()
  // A role in use cannot be deleted, and says why.
  await expect(page.getByRole('button', { name: 'Eliminar rol' })).toBeDisabled()
  await expect(page.getByText(/primero asigná otro rol a sus 2 usuarios/)).toBeVisible()

  // The list is one list: no tabs per branch.
  await page.goto('/settings/roles')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.getByRole('list', { name: 'Roles' }).getByRole('listitem')).toHaveCount(
    3 + INVENTED.length + 1
  )
})
