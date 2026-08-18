'use client'

import { deriveFrameTokens, derivePageBackground, deriveSidebarTokens } from '@/lib/utils/color'
import { APP_SHELL_ROOT_ID } from '@/components/layout/AppShell'

/**
 * Aplica los tokens derivados directamente sobre el shell real (mismo nodo
 * que `AppShell` pinta con el tema oficial — ver APP_SHELL_ROOT_ID), para
 * previsualizar un color ANTES de guardarlo.
 *
 * Punto unico: lo llaman tanto `SucursalAppearanceForm` (mientras se
 * arrastra un color) como `SucursalAppearancePanel` (al cambiar de tarjeta
 * en la lista de sucursales). Antes cada componente tenia su propia copia
 * de esta funcion y el panel nunca la llamaba al cambiar de sucursal —
 * asi que si tocabas el color de la Sucursal A y despues hacias clic en la
 * Sucursal B SIN guardar, el shell se quedaba pintado con el color de
 * prueba de A: la tarjeta seleccionada cambiaba pero el marco no, y eso es
 * lo que se percibia como "el cambio de color no detecta bien la sucursal,
 * lo aplica a las dos".
 */
export function previewShellColors(colorAcento: string, colorSidebar: string) {
  const root = document.getElementById(APP_SHELL_ROOT_ID)
  if (!root) return
  const tokens = {
    ...deriveFrameTokens(colorAcento),
    ...deriveSidebarTokens(colorSidebar),
    '--page-bg': derivePageBackground(colorSidebar),
  }
  for (const [prop, value] of Object.entries(tokens)) {
    root.style.setProperty(prop, value)
  }
}
