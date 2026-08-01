import path from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Cobertura 100% exigida sobre el modulo de auth y permisos.
      // lib/storage entra tambien: paths.ts y validation.ts son el codigo que
      // decide el aislamiento entre empresas y que bytes entran al sistema.
      include: [
        'src/modules/auth/**/*.{ts,tsx}',
        'src/lib/auth/**/*.ts',
        'src/lib/permissions/**/*.ts',
        'src/lib/storage/**/*.ts',
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
