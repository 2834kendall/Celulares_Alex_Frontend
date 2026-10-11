/**
 * Diagnóstico de latencia: con `SGRH_DEBUG_TIMING=1` cada petición del
 * servidor a Supabase se loguea con su duración. Sirve para ver cuántas
 * consultas hace una página y cuáles van en serie (Supabase está en
 * us-east-1: cada viaje cuesta ~200 ms desde Costa Rica, así que el número de
 * viajes encadenados pesa mucho más que el de filas).
 *
 *   [sgrh:db] GET  rest sgrh_empleados        212 ms
 *   [sgrh:db] POST rest rpc/terminar_contrato 305 ms
 *
 * Apagado (el default) exporta `undefined` y el cliente usa el fetch normal.
 */
export function describeRequest(input: RequestInfo | URL, method: string): string {
  const url = new URL(input instanceof Request ? input.url : String(input))
  // /rest/v1/sgrh_empleados → "rest sgrh_empleados"; /storage/v1/object/... → "storage object/..."
  const [, servicio = '', , ...resto] = url.pathname.split('/')
  return `${method.padEnd(6)} ${servicio} ${resto.join('/')}`.trimEnd()
}

export function createTimedFetch(
  baseFetch: typeof fetch,
  log: (line: string) => void,
  now: () => number
): typeof fetch {
  return async (input, init) => {
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    const inicio = now()
    try {
      return await baseFetch(input, init)
    } finally {
      log(`[sgrh:db] ${describeRequest(input, method)} ${Math.round(now() - inicio)} ms`)
    }
  }
}

export const timedFetch: typeof fetch | undefined =
  process.env.SGRH_DEBUG_TIMING === '1'
    ? createTimedFetch(
        (...args) => fetch(...args),
        (line) => console.log(line),
        () => performance.now()
      )
    : undefined
