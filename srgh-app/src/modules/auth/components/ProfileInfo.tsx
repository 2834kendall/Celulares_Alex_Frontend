import { Briefcase, Building2, Mail } from 'lucide-react'
import { BreakableEmail } from '@/components/ui/BreakableEmail'
import { Avatar, initialsOfEmail } from '@/components/ui/Avatar'

interface ProfileInfoProps {
  email: string
  rol: string | null
  /** Nombre real de la empresa (cargado server-side desde sgrh_empresas). */
  empresaNombre: string
}

/**
 * Tarjeta de perfil del usuario con su informacion personal.
 * Cuando exista el modulo de empleados, aqui se enlazara el expediente
 * completo (datos personales, contrato, puesto).
 */
export function ProfileInfo({ email, rol, empresaNombre }: ProfileInfoProps) {
  const detalles = [
    { key: 'correo', icon: Mail, etiqueta: 'Correo electronico', valor: email },
    { key: 'empresa', icon: Building2, etiqueta: 'Empresa', valor: empresaNombre },
    { key: 'rol', icon: Briefcase, etiqueta: 'Rol en el sistema', valor: rol ?? 'Sin asignar' },
  ]

  return (
    <section className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-4">
          <Avatar size="lg" nombre={email} iniciales={initialsOfEmail(email)} />
          <div className="min-w-0 leading-tight">
            <h1 className="text-xl font-extrabold text-slate-900">
              <BreakableEmail email={email} />
            </h1>
            <p className="mt-1 text-sm text-slate-500">{empresaNombre}</p>
          </div>
        </div>

        <dl className="mt-8 space-y-4 border-t border-slate-100 pt-6">
          {detalles.map(({ key, icon: Icon, etiqueta, valor }) => (
            <div key={key} className="flex items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-400 ring-1 ring-inset ring-slate-200">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 leading-tight">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {etiqueta}
                </dt>
                <dd className="break-words text-sm font-medium text-slate-700">
                  {key === 'correo' ? <BreakableEmail email={valor} /> : valor}
                </dd>
              </div>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-xs leading-relaxed text-slate-400">
          Los datos del expediente (contrato, puesto, sucursal) estaran disponibles cuando el modulo
          de empleados entre en operacion.
        </p>
      </div>
    </section>
  )
}
