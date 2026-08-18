import { screen } from '@testing-library/react'
import type { UserEvent } from '@testing-library/user-event'

/**
 * Abre un SelectMenu (listbox propio, no `<select>` nativo — ver
 * components/ui/SelectMenu.tsx) por el nombre accesible de su trigger y
 * elige la opcion por su texto visible.
 *
 * No usar `getByRole('option', ...)` para la opcion: el elemento clicable es
 * un `<button>` DENTRO del `<li role="option">`, y en jsdom un click sobre el
 * `<li>` (ancestro) no dispara el `onClick` del boton — los eventos
 * burbujean desde el target real hacia arriba, nunca hacia abajo dentro de
 * un descendiente. Por eso se apunta directo al boton de la opcion.
 */
export async function chooseSelectMenuOption(
  user: UserEvent,
  triggerName: string | RegExp,
  optionName: string | RegExp
) {
  await user.click(screen.getByLabelText(triggerName))
  await user.click(screen.getByRole('button', { name: optionName }))
}
