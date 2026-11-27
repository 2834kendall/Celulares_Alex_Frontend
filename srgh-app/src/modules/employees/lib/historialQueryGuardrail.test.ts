import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(fullPath))
    } else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !entry.name.includes('.test.') &&
      relative(resolve('src'), fullPath).replaceAll('\\', '/') !== 'types/database.types.ts'
    ) {
      out.push(fullPath)
    }
  }
  return out
}

function skipBalancedParens(text: string, openIdx: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = openIdx; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === '\\') {
        i++
      } else if (ch === quote) {
        quote = null
      }
      continue
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
    } else if (ch === '(') {
      depth++
    } else if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function skipWhitespaceAndComments(text: string, idx: number): number {
  let i = idx
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++
      continue
    }
    if (text.startsWith('//', i)) {
      const nl = text.indexOf('\n', i)
      i = nl === -1 ? text.length : nl + 1
      continue
    }
    if (text.startsWith('/*', i)) {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 2
      continue
    }
    break
  }
  return i
}

function inspectSelectBody(selectArgs: string): string[] {
  const reasons: string[] = []
  if (
    /(['"`])\s*\*\s*\1/.test(selectArgs) ||
    /\bsgrh_historial_laboral\s*\(\s*\*/.test(selectArgs)
  ) {
    reasons.push('uses wildcard * on sgrh_historial_laboral')
  }
  if (/\blab_salario_base\b|\blab_salario_real\b/.test(selectArgs)) {
    reasons.push('selects revoked salary columns (lab_salario_base / lab_salario_real)')
  }
  return reasons
}

describe('SGRH-118 guardrail: sgrh_historial_laboral client queries', () => {
  it('bans SELECT *, salary columns, and direct DML on sgrh_historial_laboral across src/', () => {
    const srcDir = resolve('src')
    const files = collectSourceFiles(srcDir)
    const violations: string[] = []

    for (const file of files) {
      const content = readFileSync(file, 'utf8')
      const rel = relative(srcDir, file).replaceAll('\\', '/')

      const fromRegex = /\.from\(\s*(['"`])sgrh_historial_laboral\1\s*\)/g
      for (const match of content.matchAll(fromRegex)) {
        let cursor = match.index + match[0].length
        while (cursor < content.length) {
          cursor = skipWhitespaceAndComments(content, cursor)
          if (content[cursor] !== '.') break
          const methodMatch = content.slice(cursor + 1).match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/)
          if (!methodMatch) break

          const method = methodMatch[1]
          const openIdx = cursor + 1 + methodMatch[0].length - 1
          const closeIdx = skipBalancedParens(content, openIdx)
          if (closeIdx === -1) break

          const args = content.slice(openIdx + 1, closeIdx)
          if (
            method === 'insert' ||
            method === 'update' ||
            method === 'delete' ||
            method === 'upsert'
          ) {
            violations.push(`${rel}: direct .${method}() on sgrh_historial_laboral`)
          } else if (method === 'select') {
            for (const reason of inspectSelectBody(args)) {
              violations.push(`${rel}: .select(...) ${reason}`)
            }
          }
          cursor = closeIdx + 1
        }
      }

      // Guard embedded PostgREST joins like `sgrh_historial_laboral ( ... )`
      const embeddedRegex = /\bsgrh_historial_laboral(?:!inner)?\s*\(/g
      for (const match of content.matchAll(embeddedRegex)) {
        const openIdx = match.index + match[0].length - 1
        const closeIdx = skipBalancedParens(content, openIdx)
        if (closeIdx === -1) continue
        const inner = content.slice(openIdx + 1, closeIdx)
        if (inner.trim() === '*' || /\*/.test(inner)) {
          violations.push(`${rel}: embedded sgrh_historial_laboral (*) wildcard`)
        }
        if (/\blab_salario_base\b|\blab_salario_real\b/.test(inner)) {
          violations.push(`${rel}: embedded sgrh_historial_laboral selects salary column`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
