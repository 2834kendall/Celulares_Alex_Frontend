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
    neq: vi.fn(() => builder),
    not: vi.fn(() => builder),
    order: vi.fn(() => builder),
    in: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    lte: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    single: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    returns: vi.fn(() => builder),
    then: (resolve: (value: QueryResult) => void) => resolve(result),
  }
  return builder
}

type StorageUploadResult = { data: { path: string } | null; error: unknown }
type StorageSignedUrlResult = { data: { signedUrl: string } | null; error: unknown }
type StorageSignedUrlsResult = {
  data: Array<{ path: string | null; signedUrl: string | null; error: string | null }> | null
  error: unknown
}
type StorageListResult = {
  data: Array<{
    id: string | null
    name: string
    created_at?: string | null
    metadata?: { size?: number; mimetype?: string } | null
  }> | null
  error: unknown
}
type StorageRemoveResult = { data: unknown; error: unknown }

interface StorageMockOptions {
  uploadResult?: StorageUploadResult
  signedUrlResult?: StorageSignedUrlResult
  signedUrlsResult?: StorageSignedUrlsResult
  listResult?: StorageListResult
  removeResult?: StorageRemoveResult
}

interface ClientMockOptions {
  /** Resultado por nombre de función para supabase.rpc('fn', args). */
  rpcResponses?: Record<string, QueryResult>
  /** Resultados de la API de storage (supabase.storage.from(bucket).*). */
  storage?: StorageMockOptions
}

/**
 * Superficie storage del cliente (supabase.storage.from(bucket)): un unico
 * builder compartido para poder asertar sobre las llamadas sin importar el
 * bucket, igual que la API admin de Auth.
 */
function createStorageMock(options: StorageMockOptions = {}) {
  const uploadResult = options.uploadResult ?? { data: { path: 'mock/path' }, error: null }
  const signedUrlResult = options.signedUrlResult ?? {
    data: { signedUrl: 'https://signed.example/mock' },
    error: null,
  }
  const signedUrlsResult = options.signedUrlsResult ?? { data: [], error: null }
  const listResult = options.listResult ?? { data: [], error: null }
  const removeResult = options.removeResult ?? { data: null, error: null }

  const bucketApi = {
    upload: vi.fn(async () => uploadResult),
    createSignedUrl: vi.fn(async () => signedUrlResult),
    createSignedUrls: vi.fn(async () => signedUrlsResult),
    list: vi.fn(async () => listResult),
    remove: vi.fn(async () => removeResult),
  }

  return { from: vi.fn(() => bucketApi), bucketApi }
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
    storage: createStorageMock(options.storage),
  }
}

type InviteResult = { data: { user: unknown }; error: unknown }
type UserResult = { data: { user: unknown }; error: unknown }
type ListUsersResult = { data: { users: unknown[] }; error: unknown }
type DeleteUserResult = { data: unknown; error: unknown }

interface AdminMockOptions extends ClientMockOptions {
  inviteResult?: InviteResult
  listUsersResult?: ListUsersResult
  getUserResult?: UserResult
  updateUserResult?: UserResult
  deleteUserResult?: DeleteUserResult
}

/**
 * Mocks createAdminClient(): same query builder per table plus the Auth admin
 * API (inviteUserByEmail, listUsers, getUserById, updateUserById, deleteUser)
 * used by the user-management actions.
 */
export function createSupabaseAdminClientMock(
  responses: Record<string, QueryResult | QueryResult[]>,
  options: AdminMockOptions = {}
) {
  const inviteResult = options.inviteResult ?? { data: { user: { id: 'auth-uuid' } }, error: null }
  const listUsersResult = options.listUsersResult ?? { data: { users: [] }, error: null }
  const getUserResult = options.getUserResult ?? { data: { user: null }, error: null }
  const updateUserResult = options.updateUserResult ?? {
    data: { user: { id: 'auth-uuid' } },
    error: null,
  }
  const deleteUserResult = options.deleteUserResult ?? { data: null, error: null }

  return {
    ...createSupabaseClientMock(responses, options),
    auth: {
      admin: {
        inviteUserByEmail: vi.fn(async () => inviteResult),
        listUsers: vi.fn(async () => listUsersResult),
        getUserById: vi.fn(async () => getUserResult),
        updateUserById: vi.fn(async () => updateUserResult),
        deleteUser: vi.fn(async () => deleteUserResult),
      },
    },
  }
}
