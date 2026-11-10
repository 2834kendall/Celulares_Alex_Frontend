/**
 * Iniciales de una cuenta identificada por correo: las dos primeras letras,
 * que es lo único estable que tiene un correo (no hay apellido que separar).
 *
 * Vive fuera de `Avatar.tsx` a propósito: ese archivo es `'use client'`, y una
 * función exportada desde un módulo cliente no se puede LLAMAR desde un Server
 * Component (solo renderizar como componente). `ProfileInfo` es de servidor y
 * la llama, así que la función tiene que estar en un módulo sin directiva.
 */
export function initialsOfEmail(email: string): string {
  return email.slice(0, 2).toUpperCase() || '?'
}
