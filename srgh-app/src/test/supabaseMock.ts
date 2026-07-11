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
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    single: vi.fn(() => builder),
    returns: vi.fn(() => builder),
    then: (resolve: (value: QueryResult) => void) => resolve(result),
  }
  return builder
}

/** Mocks createClient() so supabase.from(table) resolves to the given result per table. */
export function createSupabaseClientMock(responses: Record<string, QueryResult>) {
  return {
    from: vi.fn((table: string) => createSupabaseQueryMock(responses[table])),
  }
}
