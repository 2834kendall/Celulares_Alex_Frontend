import { defineConfig } from 'vitest/config'
import base from './vitest.config'

const securityIncludes = base.test?.coverage?.include
if (!securityIncludes?.length) throw new Error('The security coverage scope must not be empty')
const securityThresholds = Object.fromEntries(
  securityIncludes.map((pattern) => [
    pattern,
    { lines: 100, branches: 100, functions: 100, statements: 100 },
  ])
)

// One instrumented run enforces every existing security scope at 100% and the
// independent module gates. The default security-only config is unchanged.
// These floors start at the measured SGRH-105 baseline and can only rise as
// coverage improves; untested production files remain in the denominator.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    coverage: {
      provider: 'v8',
      include: [
        ...securityIncludes,
        'src/modules/attendance/**/*.{ts,tsx}',
        'src/modules/dashboard/**/*.{ts,tsx}',
        'src/modules/recruitment/**/*.{ts,tsx}',
        'src/modules/evaluations/**/*.{ts,tsx}',
      ],
      exclude: ['**/*.test.*', '**/*.d.ts'],
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage/modules',
      thresholds: {
        ...securityThresholds,
        'src/modules/attendance/**': { lines: 87, branches: 74 },
        'src/modules/dashboard/**': { lines: 44, branches: 34 },
        'src/modules/recruitment/**': { lines: 73, branches: 68 },
        'src/modules/evaluations/**': { lines: 46, branches: 34 },
      },
    },
  },
})
