import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

/**
 * Setup SOLO del proyecto "dom" (ver vitest.config.ts). Los tests de logica
 * pura corren en el proyecto "node", sin este archivo: no usan matchers de
 * jest-dom ni Testing Library, asi que cargarlo ahi era costo puro.
 *
 * En algunas combinaciones de Node (el localStorage nativo experimental de
 * Node 22+ choca con el de jsdom en ciertas versiones) window.localStorage
 * queda undefined en vez del storage simulado que jsdom deberia dar. Se
 * verifica UNA vez al arrancar y, si falta, se instala un polyfill minimo en
 * memoria — no reemplaza nada si jsdom ya funciona bien.
 */
if (typeof window !== 'undefined' && typeof window.localStorage?.clear !== 'function') {
  const store = new Map<string, string>()
  const memoryStorage: Storage = {
    getItem: (key) => (store.has(key) ? (store.get(key) ?? null) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }
  Object.defineProperty(window, 'localStorage', {
    value: memoryStorage,
    writable: true,
    configurable: true,
  })
}

/**
 * jsdom no implementa `Element.prototype.scrollIntoView` (existe en todo
 * navegador real, asi que esto NUNCA es un bug de produccion). Lo usa
 * SelectMenu para mantener la opcion resaltada a la vista al navegar con
 * flechas — sin el polyfill, cualquier test que abra su listbox revienta con
 * "scrollIntoView is not a function".
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {}
}

/**
 * `findBy*` / `waitFor` esperan 1 s por defecto. Componentes pesados como
 * EmployeeWizard (validacion Zod de ~10 campos por paso) resuelven de sobra en
 * ese margen cuando el archivo corre solo, pero con la suite completa en
 * paralelo la contencion entre workers lo excede y el test falla de forma
 * intermitente. Subir el margen no cambia lo que se afirma, solo cuanto se
 * espera antes de darlo por fallado.
 */
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
