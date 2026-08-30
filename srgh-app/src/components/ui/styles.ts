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
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition hover:border-slate-300 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 pointer-coarse:min-h-11 placeholder:text-slate-400 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

/**
 * Select nativo con flecha propia.
 *
 * `appearance-none` quita la flecha del sistema —que en Windows es un cuadro
 * gris pegado al borde, y es lo que hacia ver el campo "cuadrado"— y en su
 * lugar va un chevron SVG embebido como background. Se usa un data URI para
 * no depender de un archivo ni de un icono de React: el `<select>` no admite
 * hijos que no sean `<option>`.
 *
 * OJO: la LISTA desplegada la dibuja el sistema operativo y no se puede
 * estilizar por CSS, igual que pasaba con el calendario nativo. Esto mejora
 * el campo cerrado, que es el 95% del tiempo que se ve. Para controlar
 * tambien la lista hay que ir a un combobox propio (ver SearchSelect).
 */
/**
 * Solo la flecha, sin la forma de INPUT — para componer sobre un select con
 * fondo/color propio (ver TimeSelect: el selector de a.m./p.m. tiene su
 * propio celeste, y pegarle el token SELECT completo le habria impuesto el
 * fondo blanco generico encima).
 */
export const SELECT_ARROW = `appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9 bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="%2394a3b8"%3E%3Cpath stroke-linecap="round" stroke-linejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5"/%3E%3C/svg%3E')]`

export const SELECT = `${INPUT} ${SELECT_ARROW}`

/** Input compacto de las barras de filtro que van sobre las tablas. */
export const INPUT_SM =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 shadow-sm transition placeholder:text-slate-400 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400'

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

/**
 * Tarjeta que responde al hover (items de lista clicables).
 *
 * Al borde se le suma una sombra apenas mayor: el cambio de borde solo se
 * nota si el ojo ya esta puesto en la tarjeta, y la sombra es lo que la
 * despega del fondo cuando el cursor llega desde otro lado.
 */
export const CARD_HOVER = `${CARD} transition hover:border-slate-300 hover:shadow-[0_2px_8px_rgba(15,23,42,.06)]`

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
 * Scroller de la tabla: horizontal y vertical, con altura acotada.
 *
 * La altura es lo que hace que al scrollear sobre una tabla larga se mueva
 * LA TABLA y no la pagina entera, con el encabezado quedandose fijo arriba
 * (ver TABLE_TH). Sin el tope, la tabla crece indefinida, el scroll lo toma
 * el documento y los nombres de columna se van de pantalla — que es lo que
 * se sentia "raro de usar".
 *
 * OJO — no se puede tener scroll horizontal aca y ADEMAS un encabezado
 * pegado al viewport: en cuanto `overflow-x` deja de ser `visible`, el
 * navegador computa `overflow-y: auto` solo y este div pasa a ser el
 * contenedor de scroll de sus hijos sticky. Se probo `overflow-y: clip` y
 * `visible`: la spec los fuerza a `hidden`/`auto`. Por eso el encabezado se
 * ancla a ESTE contenedor (top-0) y no a la barra superior de la app.
 *
 * El tope descuenta la barra superior (4rem) mas el encabezado de pagina,
 * las pestañas y la barra de filtros que suele haber encima de una tabla.
 */
export const TABLE_SCROLL = 'max-h-[calc(100dvh-13rem)] overflow-auto'

/**
 * Envoltorio de la tabla de escritorio: oculta en pantallas angostas (ahi
 * cada lista muestra tarjetas en su lugar) y con el scroller aplicado.
 *
 * Existe porque esta misma cadena estaba escrita a mano en 11 componentes,
 * y las tablas que no la usaban se quedaban sin encabezado fijo sin que
 * nadie lo notara.
 */
export const TABLE_DESKTOP_WRAP = `hidden @3xl:block ${TABLE_SCROLL}`

/**
 * Encabezado de tabla. El fondo es OPACO a proposito: con el encabezado
 * pegado (ver TABLE_TH) un fondo translucido deja ver las filas pasando por
 * debajo.
 */
export const TABLE_HEAD = 'text-[10px] uppercase tracking-wide text-slate-500'
/*
 * El sticky va en cada `th` y no en el `thead`: Safari no posiciona
 * `thead`/`tr` sticky, solo las celdas. Por eso cada celda lleva ademas su
 * propio fondo, que en un `th` transparente dejaria ver las filas al pasar.
 */
export const TABLE_TH = 'sticky top-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold'
export const TABLE_TH_RIGHT = 'sticky top-0 z-10 bg-slate-50 px-3 py-2 text-right font-semibold'
export const TABLE_TH_CENTER = 'sticky top-0 z-10 bg-slate-50 px-3 py-2 text-center font-semibold'
export const TABLE_TD = 'px-3 py-2 text-slate-600'
export const TABLE_TD_STRONG = 'px-3 py-2 font-medium text-slate-800'
/** Celda numerica: `tabular-nums` alinea los digitos entre filas. */
export const TABLE_TD_NUM = 'px-3 py-2 tabular-nums text-slate-600'
export const TABLE_ROW = 'border-t border-slate-100 transition hover:bg-slate-50/70'
export const TABLE_ROW_CLICKABLE = `cursor-pointer ${TABLE_ROW}`

/* ------------------------------------------------------------------- varios */

/** Spinner en linea (se usa junto a `Loader2` de lucide). */
export const SPINNER = 'h-3.5 w-3.5 animate-spin'
