import { vi } from 'vitest'

type QueryResult = { data: unknown; error: unknown }

/**
 * Thenable query-builder stub: every chain method (select/insert/eq/order/...)
 * returns itself, and awaiting it anywhere in the chain resolves to `result`.
 * Mirrors how supabase-js builders behave regardless of which method is last.
 */
export function createSupabaseQueryMock(result: QueryResult) {
  const builder: Record<string, unknown> = {
    select: vi.fn(() => builder),
    insert: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    returns: vi.fn(() => builder),
    then: (resolve: (value: QueryResult) => void) => resolve(result),
  }
  return builder
}

interface ClientMockOptions {
  /** Resultado por nombre de función para supabase.rpc('fn', args). */
  rpcResponses?: Record<string, QueryResult>
}

/**
 * Mocks createClient() so supabase.from(table) resolves to the given result per table.
 * A table can map to an array of results: each from(table) call consumes the next one
 * in order (for actions that hit the same table more than once, e.g. insert + rollback).
 */
export function createSupabaseClientMock(
  responses: Record<string, QueryResult | QueryResult[]>,
  options: ClientMockOptions = {}
) {
  const queues = new Map<string, QueryResult[]>()

  return {
    from: vi.fn((table: string) => {
      const response = responses[table]

      if (Array.isArray(response)) {
        if (!queues.has(table)) {
          queues.set(table, [...response])
        }
        const queue = queues.get(table)!
        const next = queue.length > 1 ? queue.shift()! : queue[0]
        return createSupabaseQueryMock(next)
      }

      return createSupabaseQueryMock(response)
    }),
    rpc: vi.fn(async (fnName: string) => {
      return options.rpcResponses?.[fnName] ?? { data: null, error: null }
    }),
  }
}

type InviteResult = { data: { user: unknown }; error: unknown }

/**
 * Mocks createAdminClient(): same query builder per table plus the Auth admin API
 * (auth.admin.inviteUserByEmail) used by user-invitation actions.
 */
export function createSupabaseAdminClientMock(
  responses: Record<string, QueryResult | QueryResult[]>,
  options: ClientMockOptions & { inviteResult?: InviteResult } = {}
) {
  const inviteResult = options.inviteResult ?? { data: { user: { id: 'auth-uuid' } }, error: null }

  return {
    ...createSupabaseClientMock(responses, options),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => inviteResult),
      },
    },
  }
}
