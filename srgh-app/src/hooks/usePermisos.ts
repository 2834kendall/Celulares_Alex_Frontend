'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Permiso } from '@/lib/permissions/catalog'

export function usePermisos() {
  const [permisos, setPermisos] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()

    async function fetchUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        setPermisos((user.app_metadata?.permisos as string[]) || [])
        setUserId(user.id)
      }
      setLoading(false)
    }

    fetchUser()

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setPermisos((session.user.app_metadata?.permisos as string[]) || [])
        setUserId(session.user.id)
      } else {
        setPermisos([])
        setUserId(null)
      }
      setLoading(false)
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
