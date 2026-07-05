'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Permiso } from '@/lib/permissions/catalog'
import type { SgrhJwtClaims } from '@/types/auth'

/**
 * Lee los permisos del JWT en el cliente. Solo para UX (ocultar/mostrar UI) —
 * la seguridad real es requirePermission() en servidor + RLS en la base.
 * Usa getClaims() porque el hook de Supabase inyecta los permisos en el token,
 * NO en el registro del usuario (getUser() no los trae).
 */
export function usePermisos() {
  const [permisos, setPermisos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function loadClaims() {
      const { data } = await supabase.auth.getClaims()
      const claims = data?.claims
      const meta = (claims?.app_metadata ?? {}) as Partial<SgrhJwtClaims>

      setPermisos(Array.isArray(meta.permisos) ? meta.permisos : [])
      setUserId(typeof claims?.sub === 'string' ? claims.sub : null)
      setLoading(false)
    }

    loadClaims()

    // Ante cualquier cambio de sesion, releer los claims del token vigente.
    // setTimeout evita llamadas a supabase dentro del callback (recomendacion oficial).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      setTimeout(() => {
        loadClaims()
      }, 0)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const tiene = (permiso: Permiso) => {
    return permisos.includes(permiso)
  }

  const tieneCualquiera = (requiredPermisos: Permiso[]) => {
    return requiredPermisos.some((permiso) => permisos.includes(permiso))
  }

  return {
    permisos,
    loading,
    userId,
    tiene,
    tieneCualquiera,
  }
}
