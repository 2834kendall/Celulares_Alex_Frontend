'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FIELD_ERROR } from '@/components/ui/styles'
import { buscarComprobante } from '@/modules/payroll/actions/buscarComprobante'

/**
 * Buscador por código de verificación. El código va impreso en cada
 * comprobante (planilla, aguinaldo o liquidación) y antes nada lo leía: no
 * servía para nada. Con el código se abre el comprobante registrado, con su
 * periodo, y se puede cotejar contra el papel.
 */
export function BuscarComprobante() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setBuscando(true)
    setError(null)
    try {
      const result = await buscarComprobante(codigo)
      if (result.ok) {
        router.push(result.href)
        return
      }
      setError(result.error)
    } catch {
      setError('No se pudo buscar el comprobante.')
    } finally {
      setBuscando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Código de verificación del comprobante</span>
          <input
            type="search"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Buscar comprobante por código de verificación (XXXX-XXXX-XXXX)…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'buscar-comprobante-error' : undefined}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-3 font-mono text-xs uppercase text-slate-800 shadow-sm outline-none transition placeholder:font-sans placeholder:normal-case hover:border-slate-300 focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10 pointer-coarse:min-h-11"
          />
        </label>
        <Button type="submit" variant="secondary" size="md" disabled={buscando}>
          {buscando ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Search className="h-3.5 w-3.5" />
          )}
          Buscar comprobante
        </Button>
      </div>
      {error && (
        <p id="buscar-comprobante-error" role="alert" className={FIELD_ERROR}>
          {error}
        </p>
      )}
    </form>
  )
}
