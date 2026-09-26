/**
 * De dónde salieron las horas de un empleado dentro de un periodo.
 *
 * La regla acordada con el negocio es que mandan las marcas de asistencia,
 * pero que el Excel puede corregirlas y eso tiene que quedar registrado. Para
 * sostener las dos cosas a la vez, cada fila de la planilla guarda una FOTO de
 * lo que dijo la asistencia cuando se armó (ndt_horas_asistencia y
 * ndt_horas_extra_asistencia), aparte de las horas que realmente se pagan.
 *
 * Con esa foto se responden las tres preguntas que antes no tenían respuesta:
 *
 *   ¿estas horas son las de las marcas, o alguien las cambió?
 *     → comparar las horas guardadas contra la foto (origenHoras)
 *
 *   ¿alguien corrigió una marca después de armada la planilla?
 *     → comparar la foto contra lo que dice la asistencia AHORA
 *       (marcasCambiaron)
 *
 *   ¿desde cuándo está desactualizada?
 *     → ndt_horas_leidas_en
 *
 * Funciones puras, sin I/O: quien llama trae los números.
 */

/**
 * Tolerancia al comparar horas. Las horas se guardan redondeadas a 2
 * decimales, así que media centésima de diferencia es ruido de coma flotante y
 * no una corrección de nadie.
 */
const TOLERANCIA_HORAS = 0.005

/** Dos cantidades de horas que, para efectos de planilla, son la misma. */
export function mismasHoras(a: number, b: number): boolean {
  return Math.abs(a - b) < TOLERANCIA_HORAS
}

/**
 * Foto de lo que dijo la asistencia cuando se armó la fila. Los null son el
 * caso real de un periodo sin fechas: no hay marcas que leer, y decirlo es más
 * honesto que guardar un 0 que se confunde con "no trabajó".
 */
export interface FotoAsistencia {
  horas: number | null
  horasExtra: number | null
}

/**
 * Si la foto tiene dos números utilizables.
 *
 * Pregunta por el tipo y no por `=== null` a propósito: una columna que la
 * consulta no trajo llega como `undefined`, y un numeric mal leído puede
 * llegar como NaN. Los tres casos son el mismo — no hay referencia — y
 * tratarlos distinto haría que una fila sin foto se reportara como "horas
 * corregidas a mano" por alguien que nunca las tocó.
 */
export function fotoUtilizable(
  foto: FotoAsistencia
): foto is { horas: number; horasExtra: number } {
  return Number.isFinite(foto.horas) && Number.isFinite(foto.horasExtra)
}

export type OrigenHoras =
  /** Las horas que se pagan son las que dijeron las marcas. */
  | 'asistencia'
  /** Alguien las dejó distintas: subió un Excel corregido o editó el detalle. */
  | 'ajustadas'
  /** No se guardó foto (periodo sin fechas, o fila anterior a esta función). */
  | 'sin_referencia'

export interface HorasGuardadas {
  horas: number
  horasExtra: number
}

/**
 * Si las horas que se pagan coinciden con la foto de la asistencia.
 *
 * Se decide comparando números y no leyendo una bandera guardada: una bandera
 * puede quedar desincronizada con los montos si algo falla a mitad de camino,
 * los números no.
 */
export function origenHoras(guardadas: HorasGuardadas, foto: FotoAsistencia): OrigenHoras {
  if (!fotoUtilizable(foto)) return 'sin_referencia'

  const iguales =
    mismasHoras(guardadas.horas, foto.horas) && mismasHoras(guardadas.horasExtra, foto.horasExtra)

  return iguales ? 'asistencia' : 'ajustadas'
}

/**
 * Si las marcas cambiaron desde que se armó la planilla.
 *
 * Sin foto no se puede afirmar nada: devuelve false en vez de inventar una
 * diferencia contra un cero.
 */
export function marcasCambiaron(foto: FotoAsistencia, ahora: HorasGuardadas): boolean {
  if (!fotoUtilizable(foto)) return false

  return !mismasHoras(foto.horas, ahora.horas) || !mismasHoras(foto.horasExtra, ahora.horasExtra)
}

export interface CamposFotoAsistencia {
  ndt_horas_asistencia: number | null
  ndt_horas_extra_asistencia: number | null
  ndt_horas_leidas_en: string | null
  ndt_horas_ajustadas_por_id: number | null
  ndt_horas_ajustadas_en: string | null
}

/**
 * En qué quedó el intento de leer la asistencia del periodo.
 *
 * No incluye "la consulta falló" a propósito: desde que las marcas son la
 * fuente de las horas, guardar una planilla sin poder leerlas es justamente la
 * operación que no se puede hacer de forma coherente. Quien llama corta antes
 * y devuelve el error, en vez de escribir la mitad del par (horas nuevas con
 * una foto vieja).
 */
export type LecturaAsistencia =
  /** Se leyó bien. `datos` puede venir null si el empleado no tenía nada. */
  | { estado: 'ok'; datos: HorasGuardadas | null }
  /** El periodo no tiene fechas: no hay marcas que leer, y eso es un hecho. */
  | { estado: 'sin_fechas' }

/** Qué hacer con las cinco columnas de la foto al guardar una fila. */
export type ResultadoFoto =
  | { escribir: true; campos: CamposFotoAsistencia }
  /**
   * Las horas que llegan son las MISMAS que ya estaban guardadas, venían de la
   * asistencia, y las marcas ya dicen otra cosa. O sea: nadie corrigió nada,
   * alguien volvió a guardar un dato viejo (re-subió el mismo Excel, o guardó
   * el detalle sin tocarlo).
   *
   * Tomarlo por una corrección sería doblemente falso: le atribuiría a esa
   * persona algo que no hizo, y apagaría el bloqueo de "las marcas cambiaron"
   * dejando que se pague el monto viejo. La fila se queda como estaba,
   * desactualizada y bloqueada.
   */
  | { escribir: false; motivo: 'horas_sin_cambiar' }

/**
 * Las cinco columnas de la foto, listas para guardar junto con la planilla.
 *
 * Se llama cada vez que se vuelven a escribir las horas de un empleado (subida
 * de Excel o edición manual del detalle), porque cada una de esas veces es una
 * nueva lectura de la asistencia y una nueva oportunidad de que alguien la
 * corrija.
 *
 * `usuarioId` puede venir en null: el JWT trae el usr_id, pero si faltara es
 * preferible registrar que hubo un ajuste sin saber de quién que perder el
 * dato de que lo hubo.
 */
export function camposFotoAsistencia(params: {
  lectura: LecturaAsistencia
  /** Las horas que se van a guardar y pagar. */
  guardadas: HorasGuardadas
  /** Las horas que la fila YA tenía. null para una fila nueva. */
  guardadasPrevias: HorasGuardadas | null
  /** La foto que ya tenía la fila. Para una fila nueva, las dos en null. */
  fotoPrevia: FotoAsistencia
  usuarioId: number | null
  /** 'YYYY-MM-DD HH:mm:ss' local (ver ahoraLocal en fechas.ts). */
  ahora: string
}): ResultadoFoto {
  const { lectura, guardadas, guardadasPrevias, fotoPrevia, usuarioId, ahora } = params

  const asistencia = lectura.estado === 'ok' ? lectura.datos : null

  if (!asistencia || !fotoUtilizable(asistencia)) {
    // Es un hecho que no hay asistencia (el periodo no tiene fechas, o el
    // empleado no aparece en la lectura). Se limpia: una foto vieja de otro
    // guardado diría algo que ya no es cierto.
    return {
      escribir: true,
      campos: {
        ndt_horas_asistencia: null,
        ndt_horas_extra_asistencia: null,
        ndt_horas_leidas_en: null,
        ndt_horas_ajustadas_por_id: null,
        ndt_horas_ajustadas_en: null,
      },
    }
  }

  // Las tres condiciones tienen que darse juntas. La primera es la que importa
  // y la que faltaba: si las horas CAMBIARON respecto a lo guardado, alguien
  // decidió algo —aunque el número nuevo coincida con la foto vieja— y esa
  // decisión tiene que quedar registrada.
  const sinCambioDeHoras =
    guardadasPrevias !== null &&
    mismasHoras(guardadas.horas, guardadasPrevias.horas) &&
    mismasHoras(guardadas.horasExtra, guardadasPrevias.horasExtra)

  if (
    sinCambioDeHoras &&
    fotoUtilizable(fotoPrevia) &&
    origenHoras(guardadasPrevias, fotoPrevia) === 'asistencia' &&
    marcasCambiaron(fotoPrevia, asistencia)
  ) {
    return { escribir: false, motivo: 'horas_sin_cambiar' }
  }

  const ajustadas = origenHoras(guardadas, asistencia) === 'ajustadas'

  return {
    escribir: true,
    campos: {
      ndt_horas_asistencia: asistencia.horas,
      ndt_horas_extra_asistencia: asistencia.horasExtra,
      ndt_horas_leidas_en: ahora,
      ndt_horas_ajustadas_por_id: ajustadas ? usuarioId : null,
      ndt_horas_ajustadas_en: ajustadas ? ahora : null,
    },
  }
}
