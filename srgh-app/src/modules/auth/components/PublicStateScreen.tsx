import type { ReactNode } from 'react'
import { StateScene, type StateKind } from '@/components/scene/StateScene'
import { AUTH_TITLE, AuthBadge, AuthShell, enterStep } from '@/modules/auth/components/AuthShell'

interface PublicStateScreenProps {
  kind: StateKind
  /** Icono de la tarjeta, ya renderizado (ej. `<ShieldX className="h-6 w-6" />`). */
  badge: ReactNode
  title: string
  description: string
  /** Las salidas: enlaces o botones con AUTH_SUBMIT. */
  children: ReactNode
}

/**
 * Pantalla de estado fuera de la app (404 general, acceso no autorizado,
 * error de la raíz): el mismo marco que el login, con una escena de estado
 * en lugar de las figuras del formulario. Comparte con el login el azul del
 * sistema (`.login-screen`), porque acá no hay sucursal de la que tomar color.
 */
export function PublicStateScreen({
  kind,
  badge,
  title,
  description,
  children,
}: PublicStateScreenProps) {
  return (
    <AuthShell
      scene={
        // La escena se dibuja en un lienzo chico: con un tope de tamaño no
        // queda gruesa en pantallas grandes.
        <div className="absolute inset-0 m-auto h-full max-h-80 w-full max-w-xl">
          <StateScene kind={kind} />
        </div>
      }
    >
      <div className="login-enter" style={enterStep(0)}>
        <AuthBadge>{badge}</AuthBadge>
        <h2 className={AUTH_TITLE}>{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500 auth-short:mt-1">
          {description}
        </p>
      </div>
      <div className="login-enter space-y-3" style={enterStep(1)}>
        {children}
      </div>
    </AuthShell>
  )
}
