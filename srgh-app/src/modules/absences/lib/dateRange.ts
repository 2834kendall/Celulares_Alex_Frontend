/** Dias naturales (conteo inclusivo) y habiles (excluye domingos) de un rango fechaInicio..fechaFin. */
export function countDays(fechaInicio: string, fechaFin: string) {
  const start = new Date(`${fechaInicio}T00:00:00`)
  const end = new Date(`${fechaFin}T00:00:00`)
  const naturales = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1

  let habiles = 0
  for (let i = 0; i < naturales; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    if (d.getDay() !== 0) habiles++ // excluye domingos
  }

  return { naturales, habiles }
}
