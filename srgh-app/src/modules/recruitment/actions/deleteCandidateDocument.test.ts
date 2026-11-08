import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteCandidateDocument } from './deleteCandidateDocument'
import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/auth/require-permission'
import { getStorageProvider } from '@/lib/storage'
import { revalidatePath } from 'next/cache'
import { createSupabaseQueryMock } from '@/test/supabaseMock'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/auth/require-permission', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/storage', () => ({ getStorageProvider: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function setup(found = true, deleteError: unknown = null) {
  const read = createSupabaseQueryMock({
    data: found ? { cdo_id: 8, cdo_path: '1/candidatos/4/cv.pdf', cdo_candidato_id: 4 } : null,
    error: null,
  })
  const deletion = createSupabaseQueryMock({ data: null, error: deleteError })
  const from = vi.fn().mockReturnValueOnce(read).mockReturnValueOnce(deletion)
  vi.mocked(createClient).mockResolvedValue({ from } as unknown as Awaited<
    ReturnType<typeof createClient>
  >)
  const remove = vi.fn().mockResolvedValue({ ok: true })
  vi.mocked(getStorageProvider).mockReturnValue({ remove } as unknown as ReturnType<
    typeof getStorageProvider
  >)
  return { from, deletion, remove }
}

describe('candidate document deletion effects', () => {
  beforeEach(() => vi.resetAllMocks())

  it.each([0, -1, 1.5, NaN])(
    'rejects invalid id %s before authorization or storage access',
    async (id) => {
      expect((await deleteCandidateDocument(id)).ok).toBe(false)
      expect(requirePermission).not.toHaveBeenCalled()
      expect(createClient).not.toHaveBeenCalled()
    }
  )

  it('does not delete or remove storage when the row is invisible or missing', async () => {
    const { from, remove } = setup(false)
    expect((await deleteCandidateDocument(8)).ok).toBe(false)
    expect(requirePermission).toHaveBeenCalledWith('RECLUTAMIENTO_WRITE')
    expect(from).toHaveBeenCalledTimes(1)
    expect(remove).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('keeps the file when database deletion fails', async () => {
    const { remove } = setup(true, { message: 'failed' })
    expect((await deleteCandidateDocument(8)).ok).toBe(false)
    expect(remove).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('deletes the exact row before cleaning storage and refreshes the candidate', async () => {
    const { deletion, remove } = setup()
    remove.mockImplementation(async () => {
      expect(deletion.delete).toHaveBeenCalledTimes(1)
      expect(deletion.eq).toHaveBeenCalledWith('cdo_id', 8)
      return { ok: true }
    })
    expect(await deleteCandidateDocument(8)).toEqual({ ok: true })
    expect(remove).toHaveBeenCalledWith('CV_CANDIDATO', ['1/candidatos/4/cv.pdf'])
    expect(revalidatePath).toHaveBeenCalledWith('/recruitment/candidates/4')
  })

  it('does not report a deleted database row as pending when storage cleanup fails', async () => {
    const { remove } = setup()
    remove.mockResolvedValue({ ok: false, error: 'UNAVAILABLE' })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await deleteCandidateDocument(8)).toEqual({ ok: true })
      expect(log).toHaveBeenCalledOnce()
      expect(revalidatePath).toHaveBeenCalledWith('/recruitment/candidates/4')
    } finally {
      log.mockRestore()
    }
  })

  it('propagates permission denial without reading or deleting data', async () => {
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
    await expect(deleteCandidateDocument(8)).rejects.toThrow('forbidden')
    expect(createClient).not.toHaveBeenCalled()
    expect(getStorageProvider).not.toHaveBeenCalled()
  })
})
