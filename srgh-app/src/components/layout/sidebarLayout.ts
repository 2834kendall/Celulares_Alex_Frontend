/**
 * Geometria compartida entre el sidebar y la columna de la empresa en la barra
 * superior. Los dos leen las mismas clases y re-renderizan con el mismo
 * `sidebarOpen`, asi que el ancho se anima sincronizado sin JS.
 *
 * Todo se alinea sobre x = 38px, el centro del riel de 76px: el logo
 * (`pl-[18px]` + 40px) y los iconos del menu (`px-[18px]` + `px-3` + 16px)
 * caen en ese eje en los dos estados, asi nada salta de lado al animar.
 */

/** `id` del `<aside>`: lo apunta el `aria-controls` del boton de colapsar. */
export const SIDEBAR_ID = 'app-sidebar'

export const SIDEBAR_WIDTH = { expanded: 'w-64', rail: 'w-[76px]' } as const

/** Con movimiento reducido el cambio de ancho es instantaneo. */
export const SIDEBAR_WIDTH_TRANSITION =
  'motion-safe:transition-[width] motion-safe:duration-300 motion-safe:ease-in-out'
