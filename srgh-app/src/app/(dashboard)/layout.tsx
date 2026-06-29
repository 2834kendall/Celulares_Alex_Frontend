import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen flex">
      {/* Esqueleto mínimo de sidebar */}
      <aside className="w-64 border-r p-4 bg-zinc-50">
        <h2 className="font-bold mb-4 text-lg">SGRH</h2>
        <p className="text-xs text-zinc-500">Dashboard Base</p>
      </aside>

      {/* Área principal */}
      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b px-4 flex items-center justify-between">
          <span className="font-semibold">Celulares Alex</span>
          <span className="text-sm text-zinc-600">{user.email}</span>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
