/**
 * Tokens de estilo compartidos entre modulos.
 *
 * Aca viven los patrones que se aplican sobre elementos nativos (`input`,
 * `select`, `table`, `td`...), donde envolver en un componente no aporta nada y
 * si estorba: los inputs se usan con `{...register()}` de React Hook Form y las
 * celdas de tabla necesitan seguir siendo `<td>` reales.
 *
 * Los patrones que ademas traen markup propio (boton, alerta, badge, estado
 * vacio, modal, tabs) NO estan aca: son componentes en esta misma carpeta.
 */

/* ---------------------------------------------------------------- formularios */

/**
 * Input y select de formulario.
 *
 * Las variantes `aria-[invalid=true]:*` son parte del contrato con React Hook
 * Form: los campos pasan `aria-invalid={!!errors.x}` y de ahi sale el borde
 * rojo. Si se quitan, el formulario deja de marcar el campo con error y solo
 * queda el texto de abajo.
 */
export const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

/** Input compacto de las barras de filtro que van sobre las tablas. */
export const INPUT_SM =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

/** Etiqueta de campo de formulario. */
export const LABEL = 'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

/** Etiqueta de dato de solo lectura (fichas de detalle, metricas). */
export const META_LABEL = 'text-[10px] font-semibold uppercase tracking-wide text-slate-500'

/** Mensaje de validacion debajo de un campo. */
export const FIELD_ERROR = 'mt-1.5 text-xs text-rose-600'

/* -------------------------------------------------------------- superficies */

/**
 * Tarjeta / panel blanco.
 *
 * La sombra es un valor arbitrario a proposito: `shadow-sm` de Tailwind pesa
 * bastante mas y cambiaria el aire de toda la app. No sustituir.
 */
export const CARD =
  'rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]'

/** Tarjeta que responde al hover (items de lista clicables). */
export const CARD_HOVER = `${CARD} transition hover:border-slate-300`

/* ------------------------------------------------------------------ tablas */

/**
 * Contenedor de tabla.
 *
 * `overflow-hidden` es lo que recorta la primera y ultima fila contra la
 * esquina redondeada; sin el, las filas se salen del borde.
 */
export const TABLE_WRAP =
  'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,.04)]'

/**
 * Scroller horizontal interno.
 *
 * Ninguna tabla del proyecto tiene version de tarjetas para movil: este scroll
 * es lo unico que impide que la tabla rompa el layout en pantallas chicas.
 */
export const TABLE_SCROLL = 'overflow-x-auto'

export const TABLE_HEAD = 'bg-slate-50/80 text-[10px] uppercase tracking-wide text-slate-500'
export const TABLE_TH = 'px-3 py-2 text-left font-semibold'
export const TABLE_TH_RIGHT = 'px-3 py-2 text-right font-semibold'
export const TABLE_TH_CENTER = 'px-3 py-2 text-center font-semibold'
export const TABLE_TD = 'px-3 py-2 text-slate-600'
export const TABLE_TD_STRONG = 'px-3 py-2 font-medium text-slate-800'
/** Celda numerica: `tabular-nums` alinea los digitos entre filas. */
export const TABLE_TD_NUM = 'px-3 py-2 tabular-nums text-slate-600'
export const TABLE_ROW = 'border-t border-slate-100 transition hover:bg-slate-50/70'
export const TABLE_ROW_CLICKABLE = `cursor-pointer ${TABLE_ROW}`

/* ------------------------------------------------------------------- varios */

/** Spinner en linea (se usa junto a `Loader2` de lucide). */
export const SPINNER = 'h-3.5 w-3.5 animate-spin'
