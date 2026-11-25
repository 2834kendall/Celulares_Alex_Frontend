/**
 * Calentamiento de los modelos (SGRH-117). Crear un modelo no alcanza: la
 * PRIMERA vez que procesa una imagen, el navegador compila sus programas para
 * la GPU o el WASM, y eso bloquea la pagina segundos. Medido en el registro:
 * una sola tarea de ~3 s en el primer cuadro, con la camara ya abierta, que se
 * veia como el video "pegado".
 *
 * Por eso cada carga pasa una imagen vacia una vez, como parte de la misma
 * promesa: el costo se paga en la precarga (mientras se lee la guia o abre el
 * kiosco), no frente a la persona. Un fallo del calentamiento no importa: el
 * modelo igual sirve, solo que el primer cuadro real pagara la compilacion.
 */

/** Canvas chico en blanco: suficiente para que el motor compile todo. */
export function blankCanvas(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#808080'
    ctx.fillRect(0, 0, size, size)
  }
  return canvas
}

/** Corre `run` y traga cualquier error: calentar es una optimizacion. */
export async function warmUp(run: () => unknown): Promise<void> {
  try {
    await run()
  } catch {
    // Sin calentamiento el modelo sigue funcionando; el primer uso es lento.
  }
}
