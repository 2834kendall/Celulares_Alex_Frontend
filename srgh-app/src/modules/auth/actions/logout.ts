'use server'

import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { MARCA_CONTEXTO_COOKIE } from '@/lib/empresa/marca-contexto-cookie'
import { DASHBOARD_PREFS_COOKIE } from '@/modules/dashboard/lib/prefsCookie'

export type LogoutResult = { ok: true } | { ok: false; error: string }

/**
 * Logout como Server Action: cierra la sesion en Supabase y borra lo que
 * quedaria del usuario anterior en este navegador. La navegacion a /login la
 * hace quien llama (LogoutButton), no esta accion.
 *
 * Cuatro cosas que no son obvias:
 *
 * 1. NO llama a redirect(). En Next 16, cuando una Server Action redirige, la
 *    promesa que espera el cliente se RECHAZA a proposito con un error de
 *    redirect (server-action-reducer.js: "the action promise will be rejected
 *    with a redirect"). En el catch del boton ese rechazo es indistinguible de
 *    una caida de red, y el boton terminaba avisando "no se pudo cerrar la
 *    sesion" mientras navegaba al login. Devolviendo { ok } el catch del
 *    cliente queda solo para fallos de red reales.
 *
 * 2. El error de signOut() SE MIRA. Antes se descartaba y la navegacion
 *    ocurria igual: ante un fallo, la persona aterrizaba en /login creyendo
 *    que habia salido mientras las cookies seguian vivas.
 *
 * 3. revalidatePath('/', 'layout'). Sin eso, el Router Cache de Next puede
 *    servir payloads RSC del dashboard ya prefetcheados DESPUES del logout: el
 *    boton Atras muestra datos de empleados que ya no deberian verse. Una
 *    revalidacion hecha en una Server Action purga ese cache del cliente al
 *    volver la respuesta, antes de que el boton navegue.
 *
 * 4. Se borran las cookies del dashboard y de la marca elegida. Guardan el id del
 *    usuario ({ u: usrId, ... }), y sobrevivian al logout en una maquina
 *    compartida. Cada una se ignora si la lee otra cuenta: eso es lo que cubre una
 *    sesion que vence sin pasar por aca.
 */
export async function logout(): Promise<LogoutResult> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signOut()

  if (error) {
    return {
      ok: false,
      error: 'El servidor no pudo cerrar la sesión. Intente de nuevo en unos segundos.',
    }
  }

  const store = await cookies()
  store.delete(DASHBOARD_PREFS_COOKIE)
  store.delete(MARCA_CONTEXTO_COOKIE)

  revalidatePath('/', 'layout')
  return { ok: true }
}
