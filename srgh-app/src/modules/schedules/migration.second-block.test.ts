import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

/**
 * SGRH-110 · las reglas de los tramos de un día, contra un Postgres real
 * (PGlite): viven en un índice y en un trigger, y los tests de las acciones
 * mockean la base, así que ahí no se prueban.
 *
 * El esquema es el mínimo que la migración necesita: la tabla de programación
 * y la de plantillas de horario, con los nombres de columna reales.
 */

const MIGRACION_TRAMOS = '20261116190000_schedule_segments_per_branch.sql'
const MIGRACION_BLOQUE2 = '20261116200000_schedule_second_block.sql'
const MIGRACION_SUCURSALES = '20261116210000_schedule_branch_per_block.sql'

const ESQUEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA sgrh_private;
  CREATE TABLE sgrh_sucursales(suc_id int PRIMARY KEY);
  INSERT INTO sgrh_sucursales VALUES (10), (20);
  CREATE TABLE sgrh_cat_horarios(
    hor_id int PRIMARY KEY, hor_hora_entrada time NOT NULL, hor_hora_salida time NOT NULL);
  CREATE TABLE sgrh_programacion_semanal(
    prg_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    prg_historial_laboral_id int NOT NULL,
    prg_sucursal_id int NOT NULL,
    prg_horario_id int REFERENCES sgrh_cat_horarios,
    prg_fecha date NOT NULL,
    prg_es_dia_libre boolean NOT NULL DEFAULT false,
    prg_hora_entrada_custom time,
    prg_hora_salida_custom time);
`

// Plantillas, ya con las columnas del segundo bloque (las agrega la migración).
const PLANTILLAS = `
  INSERT INTO sgrh_cat_horarios(hor_id, hor_hora_entrada, hor_hora_salida) VALUES
    (1, '08:00', '17:00'),   -- jornada completa
    (2, '08:00', '12:00'),   -- mañana
    (3, '13:00', '17:00'),   -- tarde
    (4, '22:00', '06:00');   -- cruza la medianoche
  INSERT INTO sgrh_cat_horarios(
    hor_id, hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2) VALUES
    (5, '07:00', '11:00', '16:00', '20:00'),   -- partida con hueco largo
    (6, '08:00', '12:00', '14:00', '18:00');   -- partida con hueco de almuerzo
`

const INFINITY = 10
const ALEX = 20
const DIA = '2026-11-16'

let db: PGlite

const sql = (archivo: string) => readFileSync(resolve('supabase/migrations', archivo), 'utf8')

interface Tramo {
  contrato?: number
  fecha?: string
  sucursal: number
  horario?: number | null
  desde?: string | null
  hasta?: string | null
  libre?: boolean
}

/** Inserta un tramo y devuelve su id. */
async function tramo(t: Tramo): Promise<number> {
  const { rows } = await db.query<{ prg_id: number }>(
    `INSERT INTO sgrh_programacion_semanal(
       prg_historial_laboral_id, prg_sucursal_id, prg_horario_id, prg_fecha,
       prg_es_dia_libre, prg_hora_entrada_custom, prg_hora_salida_custom)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING prg_id`,
    [
      t.contrato ?? 1,
      t.sucursal,
      t.horario ?? null,
      t.fecha ?? DIA,
      t.libre ?? false,
      t.desde ?? null,
      t.hasta ?? null,
    ]
  )
  return rows[0].prg_id
}

/** El rechazo deja la transacción del test usable (savepoint) y compara mensaje y código. */
async function rejects(p: () => Promise<unknown>, mensaje: RegExp, code: string) {
  await db.exec('SAVEPOINT intento')
  try {
    await p()
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT intento')
    const err = e as { message: string; code?: string }
    expect(err.message).toMatch(mensaje)
    expect(err.code).toBe(code)
    return
  }
  await db.exec('RELEASE SAVEPOINT intento')
  throw new Error(`Se esperaba un rechazo: ${mensaje}`)
}

const cuantos = async (contrato = 1, fecha = DIA) =>
  (
    await db.query<{ n: number }>(
      `SELECT count(*)::int n FROM sgrh_programacion_semanal
       WHERE prg_historial_laboral_id=$1 AND prg_fecha=$2`,
      [contrato, fecha]
    )
  ).rows[0].n

describe('SGRH-110 · plantilla con segundo bloque (migración real)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(ESQUEMA)
    await db.exec(sql(MIGRACION_TRAMOS))
    await db.exec(sql(MIGRACION_BLOQUE2))
    await db.exec(sql(MIGRACION_SUCURSALES))
    await db.exec(PLANTILLAS)
  }, 30000)

  beforeEach(async () => {
    await db.exec('BEGIN')
  })
  afterEach(async () => {
    await db.exec('ROLLBACK')
  })
  afterAll(async () => {
    await db?.close()
  })

  describe('la plantilla', () => {
    const insertar = (e2: string | null, s2: string | null) =>
      db.query(
        `INSERT INTO sgrh_cat_horarios(
           hor_id, hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2)
         VALUES (100, '08:00', '12:00', $1, $2)`,
        [e2, s2]
      )

    it('acepta un solo bloque, como siempre', async () => {
      await insertar(null, null)
    })

    it('acepta un segundo bloque que empieza justo cuando termina el primero', async () => {
      await insertar('12:00', '16:00')
    })

    it('acepta un segundo bloque con hueco', async () => {
      await insertar('14:00', '18:00')
    })

    it('rechaza el segundo bloque a medias (solo entrada)', async () => {
      await rejects(() => insertar('14:00', null), /sgrh_cat_hor_bloque2_completo/, '23514')
    })

    it('rechaza el segundo bloque a medias (solo salida)', async () => {
      await rejects(() => insertar(null, '18:00'), /sgrh_cat_hor_bloque2_completo/, '23514')
    })

    it('rechaza un segundo bloque que termina antes de empezar', async () => {
      await rejects(() => insertar('18:00', '14:00'), /sgrh_cat_hor_bloque2_orden/, '23514')
    })

    it('rechaza un segundo bloque vacio (entrada igual a salida)', async () => {
      await rejects(() => insertar('14:00', '14:00'), /sgrh_cat_hor_bloque2_orden/, '23514')
    })

    it('rechaza un segundo bloque que empieza antes de que termine el primero', async () => {
      await rejects(() => insertar('11:00', '15:00'), /sgrh_cat_hor_bloque2_orden/, '23514')
    })

    it('rechaza un segundo bloque si el primero cruza la medianoche', async () => {
      await rejects(
        () =>
          db.query(
            `INSERT INTO sgrh_cat_horarios(
               hor_id, hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2)
             VALUES (101, '22:00', '06:00', '07:00', '09:00')`
          ),
        /sgrh_cat_hor_bloque2_orden/,
        '23514'
      )
    })

    it('se puede quitar el segundo bloque (las dos columnas a NULL)', async () => {
      await db.exec(
        `UPDATE sgrh_cat_horarios SET hor_hora_entrada_2 = NULL, hor_hora_salida_2 = NULL WHERE hor_id = 5`
      )
      const { rows } = await db.query<{ n: number }>(
        `SELECT count(*)::int n FROM sgrh_cat_horarios WHERE hor_id = 5 AND hor_hora_entrada_2 IS NULL`
      )
      expect(rows[0].n).toBe(1)
    })
  })

  describe('sucursal de cada bloque', () => {
    const insertar = (s1: number | null, s2: number | null, e2: string | null = '14:00') =>
      db.query(
        `INSERT INTO sgrh_cat_horarios(
           hor_id, hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2,
           hor_sucursal_id, hor_sucursal_id_2)
         VALUES (200, '08:00', '12:00', $1, $2, $3, $4)`,
        [e2, e2 ? '18:00' : null, s1, s2]
      )

    it('acepta dos sucursales distintas', async () => {
      await insertar(10, 20)
    })

    it('acepta la misma sucursal en los dos bloques', async () => {
      await insertar(10, 10)
    })

    it('acepta no definir sucursales (la de la asignacion)', async () => {
      await insertar(null, null)
    })

    it('rechaza una sola sucursal', async () => {
      await rejects(() => insertar(10, null), /sgrh_cat_hor_sucursales_bloques/, '23514')
      await rejects(() => insertar(null, 20), /sgrh_cat_hor_sucursales_bloques/, '23514')
    })

    it('rechaza sucursales sin segundo bloque', async () => {
      await rejects(() => insertar(10, 20, null), /sgrh_cat_hor_sucursales_bloques/, '23514')
    })

    it('rechaza una sucursal que no existe', async () => {
      await rejects(() => insertar(10, 99), /foreign key|violates/i, '23503')
    })

    it('una sucursal usada por una plantilla no se puede borrar', async () => {
      await insertar(10, 20)
      await rejects(
        () => db.exec('DELETE FROM sgrh_sucursales WHERE suc_id = 20'),
        /foreign key|violates/i,
        '23503'
      )
    })

    it('quitar el segundo bloque exige quitar tambien las sucursales', async () => {
      await insertar(10, 20)
      await rejects(
        () =>
          db.exec(
            `UPDATE sgrh_cat_horarios SET hor_hora_entrada_2 = NULL, hor_hora_salida_2 = NULL WHERE hor_id = 200`
          ),
        /sgrh_cat_hor_sucursales_bloques/,
        '23514'
      )
    })
  })

  describe('traslape entre tramos con jornada partida', () => {
    it('un tramo partido y otro que cabe en el hueco conviven', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 }) // 7-11 y 16-20
      await tramo({ sucursal: ALEX, desde: '12:00', hasta: '15:00' })
      expect(await cuantos()).toBe(2)
    })

    it('el otro tramo puede tocar los bordes de los dos bloques', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 })
      await tramo({ sucursal: ALEX, desde: '11:00', hasta: '16:00' })
      expect(await cuantos()).toBe(2)
    })

    it('rechaza un tramo que pisa el primer bloque', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '09:00', hasta: '13:00' }),
        /no pueden traslaparse \(09:00 a 13:00 contra 07:00 a 11:00\)/,
        '23P01'
      )
    })

    it('rechaza un tramo que pisa el segundo bloque (el que antes no se miraba)', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '18:00', hasta: '22:00' }),
        /no pueden traslaparse \(18:00 a 22:00 contra 16:00 a 20:00\)/,
        '23P01'
      )
    })

    it('rechaza lo mismo en el orden inverso: el tramo partido llega despues', async () => {
      await tramo({ sucursal: ALEX, desde: '18:00', hasta: '22:00' })
      await rejects(
        () => tramo({ sucursal: INFINITY, horario: 5 }),
        /no pueden traslaparse \(16:00 a 20:00 contra 18:00 a 22:00\)/,
        '23P01'
      )
    })

    it('rechaza dos tramos partidos cuyos bloques se pisan', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 }) // 7-11 y 16-20
      await rejects(() => tramo({ sucursal: ALEX, horario: 6 }), /no pueden traslaparse/, '23P01') // 8-12 y 14-18
    })

    it('acepta dos tramos partidos que se intercalan sin pisarse', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 }) // 7-11 y 16-20
      await db.exec(`
        INSERT INTO sgrh_cat_horarios(
          hor_id, hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2)
        VALUES (8, '11:00', '13:00', '14:00', '16:00')`)
      await tramo({ sucursal: ALEX, horario: 8 }) // 11-13 y 14-16
      expect(await cuantos()).toBe(2)
    })

    it('mover un tramo a una plantilla partida que pisa a otro se rechaza al actualizar', async () => {
      await tramo({ sucursal: INFINITY, horario: 2 }) // 8-12
      const id = await tramo({ sucursal: ALEX, horario: 3 }) // 13-17
      await rejects(
        () =>
          db.query(`UPDATE sgrh_programacion_semanal SET prg_horario_id = 6 WHERE prg_id = $1`, [
            id,
          ]),
        /no pueden traslaparse/,
        '23P01'
      )
    })

    it('un tramo partido ocupa el dia: un tramo normal que lo pisa se rechaza', async () => {
      await tramo({ sucursal: INFINITY, horario: 6 }) // 8-12 y 14-18
      await rejects(() => tramo({ sucursal: ALEX, horario: 1 }), /no pueden traslaparse/, '23P01')
    })

    it('sigue sin dejar un dia libre junto a un tramo partido', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 })
      await rejects(() => tramo({ sucursal: ALEX, libre: true }), /día libre/, '23514')
    })

    it('un tramo partido en otro dia o de otro contrato no estorba', async () => {
      await tramo({ sucursal: INFINITY, horario: 5 })
      await tramo({ sucursal: ALEX, horario: 6, fecha: '2026-11-17' })
      await tramo({ sucursal: ALEX, horario: 6, contrato: 2 })
      expect(await cuantos()).toBe(1)
    })

    it('una plantilla de un solo bloque que cruza la medianoche sigue sin compararse', async () => {
      await tramo({ sucursal: INFINITY, horario: 4 })
      await tramo({ sucursal: ALEX, desde: '08:00', hasta: '12:00' })
      expect(await cuantos()).toBe(2)
    })
  })

  describe('sin segundo bloque todo sigue igual', () => {
    it('8-12 y 13-17 conviven', async () => {
      await tramo({ sucursal: INFINITY, horario: 2 })
      await tramo({ sucursal: ALEX, horario: 3 })
      expect(await cuantos()).toBe(2)
    })

    it('jornada completa y manana se pisan', async () => {
      await tramo({ sucursal: INFINITY, horario: 1 })
      await rejects(
        () => tramo({ sucursal: ALEX, horario: 2 }),
        /no pueden traslaparse \(08:00 a 12:00 contra 08:00 a 17:00\)/,
        '23P01'
      )
    })
  })

  describe('aplicar la migracion de sucursales sobre una base con el estado anterior', () => {
    it('se puede aplicar dos veces y las reglas siguen vigentes', async () => {
      await db.exec(sql(MIGRACION_SUCURSALES))
      await db.exec('BEGIN')
      await rejects(
        () =>
          db.query(
            `INSERT INTO sgrh_cat_horarios(
               hor_id, hor_hora_entrada, hor_hora_salida, hor_hora_entrada_2, hor_hora_salida_2,
               hor_sucursal_id, hor_sucursal_id_2)
             VALUES (300, '08:00', '12:00', '14:00', '18:00', 10, NULL)`
          ),
        /sgrh_cat_hor_sucursales_bloques/,
        '23514'
      )
    })
  })

  describe('aplicar la migracion dos veces', () => {
    it('es idempotente', async () => {
      // La migración trae su propio BEGIN/COMMIT: cierra la transacción del test.
      await db.exec(sql(MIGRACION_BLOQUE2))
      await db.exec('BEGIN')
      await tramo({ sucursal: INFINITY, horario: 5 })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '09:00', hasta: '13:00' }),
        /no pueden traslaparse/,
        '23P01'
      )
    })
  })
})
