import { defineConfig } from 'vitest/config'
import base from './vitest.config'

// Independent module gates: the default config retains its 100% security gate.
// These floors start at the measured SGRH-105 baseline and can only rise as
// coverage improves; untested production files remain in the denominator.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    coverage: {
      provider: 'v8',
      include: [
        'src/modules/attendance/**/*.{ts,tsx}',
        'src/modules/dashboard/**/*.{ts,tsx}',
        'src/modules/recruitment/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage/modules',
      thresholds: {
        'src/modules/attendance/**': { lines: 87, branches: 74 },
        'src/modules/dashboard/**': { lines: 44, branches: 34 },
        'src/modules/recruitment/**': { lines: 73, branches: 68 },
      },
    },
  },
})
