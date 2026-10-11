import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Tests que SI tocan el DOM (React Testing Library, localStorage, IndexedDB)
 * y por lo tanto necesitan jsdom. Todo lo demas — logica pura, server actions
 * con Supabase mockeado, schemas de Zod — corre en Node.
 *
 * Motivo: montar un jsdom por archivo era el mayor costo de la suite. De 160
 * archivos de test solo 60 tocan el DOM; los otros 100 pagaban ese arranque
 * sin usarlo.
 *
 * Los tests de subida de archivos (storage) quedan del lado de Node aunque
 * usen File y FormData: son globales nativos desde Node 20, verificado
 * corriendolos con environment=node.
 *
 * Los .tsx entran completos aunque no vivan en components/: un .tsx implica
 * React, y equivocarse hacia jsdom solo cuesta tiempo, mientras que
 * equivocarse hacia Node rompe el test.
 */
const DOM_TEST_GLOBS = [
  'src/**/components/**/*.test.{ts,tsx}',
  'src/**/hooks/**/*.test.{ts,tsx}',
  'src/**/*.test.tsx',
]

export default defineConfig({
  plugins: [react()],
  test: {
    // Workers como hilos en vez de procesos: mismo aislamiento por archivo,
    // menos costo de arranque.
    pool: 'threads',
    // Los tests de componentes pesados (EmployeeWizard valida ~10 campos con
    // Zod por paso) tardan segundos en jsdom. Con la suite completa en paralelo
    // el limite de 5 s por test se quedaba corto y fallaban de forma
    // intermitente; va de la mano con `asyncUtilTimeout` en test/setup.ts.
    // Los proyectos lo heredan por `extends: true`.
    testTimeout: 20000,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: DOM_TEST_GLOBS,
          // Sin setup: estos tests no usan Testing Library ni matchers de
          // jest-dom (verificado), cargarlos aca era costo puro.
          setupFiles: [],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: DOM_TEST_GLOBS,
          setupFiles: ['./src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cobertura 100% exigida sobre el modulo de auth y permisos.
      // lib/storage entra tambien: paths.ts y validation.ts son el codigo que
      // decide el aislamiento entre empresas y que bytes entran al sistema.
      // lib/crypto por el mismo criterio: cifra los datos de pago at-rest, y un
      // fallo suyo no se nota mirando la UI — se nota cuando el dato ya se perdio.
      include: [
        'src/modules/auth/**/*.{ts,tsx}',
        'src/lib/auth/**/*.ts',
        'src/lib/permissions/**/*.ts',
        'src/lib/storage/**/*.ts',
        'src/lib/crypto/**/*.ts',
        'src/hooks/usePermisos.ts',
        'src/components/layout/Sidebar.tsx',
      ],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
