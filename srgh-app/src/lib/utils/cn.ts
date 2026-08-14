export type ClassValue = string | number | null | undefined | false | ClassValue[]

/**
 * Une clases condicionales de Tailwind. Es un `clsx` minimo escrito en casa a
 * proposito: no agrega dependencias al proyecto y cubre lo unico que la UI
 * necesita (concatenar y descartar falsy).
 *
 * OJO: no hace merge de clases en conflicto (no es `tailwind-merge`). Por eso
 * los primitivos de `components/ui/` exponen `variant`/`size`/`tone` en vez de
 * esperar que el llamador sobreescriba padding o color por `className`. Lo que
 * si es seguro pasar por `className` es layout que la base no define: `w-full`,
 * `mt-*`, `shrink-0`, `min-w-0`, etc.
 */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = []

  for (const input of inputs) {
    if (!input) continue
    if (Array.isArray(input)) {
      const nested = cn(...input)
      if (nested) out.push(nested)
    } else {
      out.push(String(input))
    }
  }

  return out.join(' ')
}
