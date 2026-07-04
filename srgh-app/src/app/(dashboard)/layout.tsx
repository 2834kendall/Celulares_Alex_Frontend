import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getClaims()

  if (error || !data?.claims) {
    redirect('/login')
  }

  const email = typeof data.claims.email === 'string' ? data.claims.email : 'Usuario autenticado'

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      <aside className="w-64 border-r border-slate-200 p-4 bg-white">
        <h2 className="font-extrabold mb-4 text-lg">SGRH</h2>
        <p className="text-xs text-slate-500">Dashboard Base</p>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="h-16 border-b border-slate-200 bg-white px-4 flex items-center justify-between">
          <span className="font-semibold">Celulares Alex</span>
          <span className="text-sm text-slate-600">{email}</span>
        </header>
        <main className="flex-1 p-4">{children}</main>
      </div>
    </div>
  )
}
