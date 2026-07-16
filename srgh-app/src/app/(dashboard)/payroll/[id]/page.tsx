import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { requirePermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'
import { getPeriodoDetail } from '@/modules/payroll/actions/getPeriodoDetail'
import { PeriodoDetail } from '@/modules/payroll/components/PeriodoDetail'

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <p>{message}</p>
    </div>
  )
}

interface PeriodoDetailPageProps {
  params: Promise<{ id: string }>
}

export default async function PeriodoDetailPage({ params }: PeriodoDetailPageProps) {
  const { id } = await params
  const periodoId = Number(id)

  if (!Number.isInteger(periodoId) || periodoId <= 0) {
    notFound()
  }

  await requirePermission(PERMISOS.NOMINA_READ)

  const detailResult = await getPeriodoDetail(periodoId)

  if (!detailResult.ok) {
    if (detailResult.notFound) {
      notFound()
    }
    return <ErrorBanner message={detailResult.error} />
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/payroll"
          aria-label="Volver al listado"
          className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-base font-bold text-slate-900">Detalle del periodo</h1>
          <p className="text-xs text-slate-500">Planilla del periodo y estado de pago.</p>
        </div>
      </div>

      <PeriodoDetail periodo={detailResult.data} />
    </div>
  )
}
