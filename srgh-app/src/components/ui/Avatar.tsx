'use client'

import { useState } from 'react'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

interface AvatarProps {
  /** URL firmada (string opaco: el componente no sabe qué proveedor hay detrás). */
  fotoUrl?: string | null
  /** Nombre completo — de aquí salen las iniciales del fallback. */
  nombre: string
  size?: AvatarSize
  className?: string
  /**
   * Iniciales explícitas, cuando NO salen del nombre. Único caso real: la
   * cuenta con la que se inició sesión, que se identifica por correo y no
   * por nombre (ver `initialsOfEmail`). Sin esto, el menú de usuario y la
   * ficha de perfil tenían que dibujar su propio círculo, y de ahí salía la
   * tercera y cuarta copia del avatar.
   */
  iniciales?: string
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-7 w-7 text-[10px]',
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
}

/**
 * Toma las primeras letras de las dos primeras palabras del nombre (nombre +
 * primer apellido).
 *
 * Se exporta porque hay lugares que necesitan las iniciales sin el círculo
 * (p. ej. una etiqueta de texto). Antes existían TRES copias de esta función
 * —aquí, en `evaluations/lib/scoring` y dentro de `WeeklyScheduleMatrix`— y no
 * se comportaban igual: la de Horarios no hacía `toUpperCase()`, así que un
 * colaborador cargado como "Pepe re fr" salía como "Pr" en la matriz de turnos
 * y como "PR" en el resto de la app.
 */
export function initialsOf(nombre: string): string {
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
 * que ya llegó a través del server component; sin foto (o si la firma expiró
 * en una pestaña vieja) cae a un círculo con iniciales.
 *
 * Es el ÚNICO avatar de la app (SGRH-82). Antes cada módulo dibujaba el suyo
 * a mano —Evaluaciones en celeste claro, Horarios en `bg-slate-800`, el menú
 * de usuario con el color de marca— y ninguno salvo Empleados sabía mostrar
 * una foto: por eso un colaborador con foto cargada seguía apareciendo como
 * iniciales en la matriz de turnos y en su expediente de desempeño.
 *
 * El fallback usa `bg-brand-700`, o sea el color de la plantilla de la
 * sucursal (ver `deriveBrandTokens`): sin foto, el círculo acompaña al tema
 * elegido en vez de imponer un color fijo.
 */
/**
 * Iniciales de una cuenta identificada por correo: las dos primeras letras,
 * que es lo único estable que tiene un correo (no hay apellido que separar).
 * Vivía duplicada tal cual en `UserMenu` y en `ProfileInfo`.
 */
export function initialsOfEmail(email: string): string {
  return email.slice(0, 2).toUpperCase() || '?'
}

export function Avatar({ fotoUrl, nombre, size = 'md', className = '', iniciales }: AvatarProps) {
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
      {iniciales ?? initialsOf(nombre)}
    </span>
  )
}
