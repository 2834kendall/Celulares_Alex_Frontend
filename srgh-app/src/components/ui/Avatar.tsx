'use client'

import { useState } from 'react'

export type AvatarSize = 'sm' | 'md' | 'xl'

interface AvatarProps {
  /** URL firmada (string opaco: el componente no sabe qué proveedor hay detrás). */
  fotoUrl?: string | null
  /** Nombre completo — de aquí salen las iniciales del fallback. */
  nombre: string
  size?: AvatarSize
  className?: string
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  xl: 'h-24 w-24 text-2xl',
}

/**
 * Toma las primeras letras de las dos primeras palabras del nombre (nombre +
 * primer apellido). Mismo criterio de "dos letras" que UserMenu, pero por
 * nombre en vez de email — más legible para identificar personas en listas.
 */
function initials(nombre: string): string {
  const words = nombre.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) {
    return '?'
  }
  const first = words[0][0]
  const second = words[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

/**
 * Avatar genérico reutilizable (SGRH-67): con foto renderiza la URL firmada
 * que ya llegó a través del server component; sin foto (o si la firma
 * expiró en una pestaña vieja) cae a un círculo con iniciales — mismo token
 * visual que el círculo azul de UserMenu.
 */
export function Avatar({ fotoUrl, nombre, size = 'md', className = '' }: AvatarProps) {
  const [imgFailed, setImgFailed] = useState(false)
  const sizeClasses = SIZE_CLASSES[size]

  if (fotoUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL firmada externa, no un asset local.
      <img
        src={fotoUrl}
        alt={`Foto de ${nombre}`}
        onError={() => setImgFailed(true)}
        className={`shrink-0 rounded-full object-cover ${sizeClasses} ${className}`}
      />
    )
  }

  return (
    <span
      role="img"
      aria-label={`Foto de ${nombre}`}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand-700 font-bold text-white ${sizeClasses} ${className}`}
    >
      {initials(nombre)}
    </span>
  )
}
