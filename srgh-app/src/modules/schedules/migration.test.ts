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

const MIGRACION = '20261116190000_schedule_segments_per_branch.sql'

const ESQUEMA = `
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE SCHEMA sgrh_private;
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
  INSERT INTO sgrh_cat_horarios VALUES
    (1, '08:00', '17:00'),   -- jornada completa
    (2, '08:00', '12:00'),   -- mañana
    (3, '13:00', '17:00'),   -- tarde
    (4, '22:00', '06:00');   -- cruza la medianoche
`

const INFINITY = 10
const ALEX = 20
const DIA = '2026-11-16'

let db: PGlite

const sql = () => readFileSync(resolve('supabase/migrations', MIGRACION), 'utf8')

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

describe('SGRH-110 · tramos por sucursal (migración real)', () => {
  beforeAll(async () => {
    db = new PGlite()
    await db.exec(ESQUEMA)
    await db.exec(sql())
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

  describe('varios tramos en un día', () => {
    it('acepta uno por sucursal, con horas propias: 8 a 12 en Infinity y 13 a 17 en Alex', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await tramo({ sucursal: ALEX, desde: '13:00', hasta: '17:00' })
      expect(await cuantos()).toBe(2)
    })

    it('acepta tramos que vienen de la plantilla', async () => {
      await tramo({ sucursal: INFINITY, horario: 2 })
      await tramo({ sucursal: ALEX, horario: 3 })
      expect(await cuantos()).toBe(2)
    })

    it('acepta mezclar plantilla y horas propias', async () => {
      await tramo({ sucursal: INFINITY, horario: 2 })
      await tramo({ sucursal: ALEX, desde: '13:00', hasta: '17:00' })
      expect(await cuantos()).toBe(2)
    })

    it('un tramo que termina a la hora en que empieza el otro no es un traslape', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await tramo({ sucursal: ALEX, desde: '12:00', hasta: '16:00' })
      expect(await cuantos()).toBe(2)
    })

    it('no mezcla contratos ni días: las mismas horas en otro contrato u otro día no chocan', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await tramo({ contrato: 2, sucursal: ALEX, desde: '08:00', hasta: '12:00' })
      await tramo({ fecha: '2026-11-17', sucursal: ALEX, desde: '08:00', hasta: '12:00' })
      expect(await cuantos(1)).toBe(1)
      expect(await cuantos(2)).toBe(1)
      expect(await cuantos(1, '2026-11-17')).toBe(1)
    })
  })

  describe('traslapes', () => {
    it('rechaza un tramo que se mete en el de otra sucursal', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '11:00', hasta: '15:00' }),
        /no pueden traslaparse \(11:00 a 15:00 contra 08:00 a 12:00\)/,
        '23P01'
      )
    })

    it('rechaza el que contiene a otro, y el que queda dentro de otro', async () => {
      await tramo({ sucursal: INFINITY, desde: '09:00', hasta: '11:00' })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '08:00', hasta: '17:00' }),
        /traslaparse/,
        '23P01'
      )

      await db.exec('DELETE FROM sgrh_programacion_semanal')
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '17:00' })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '10:00', hasta: '11:00' }),
        /traslaparse/,
        '23P01'
      )
    })

    it('compara con las horas de la plantilla cuando el otro tramo no es personalizado', async () => {
      await tramo({ sucursal: INFINITY, horario: 1 }) // 8 a 17
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '13:00', hasta: '17:00' }),
        /traslaparse/,
        '23P01'
      )
      await rejects(() => tramo({ sucursal: ALEX, horario: 3 }), /traslaparse/, '23P01')
    })

    it('un tramo con solo entrada o solo salida propia cuenta con las horas de su plantilla', async () => {
      await tramo({ sucursal: INFINITY, horario: 2 }) // 8 a 12
      // Sin pareja, la entrada propia se ignora y vale la plantilla (13 a 17): no choca.
      await tramo({ sucursal: ALEX, horario: 3, desde: '09:00', hasta: null })
      expect(await cuantos()).toBe(2)
    })

    it('rechaza al editar un tramo hasta meterlo en otro, y deja el original intacto', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      const alex = await tramo({ sucursal: ALEX, desde: '13:00', hasta: '17:00' })

      await rejects(
        () =>
          db.query(
            `UPDATE sgrh_programacion_semanal SET prg_hora_entrada_custom='11:00' WHERE prg_id=$1`,
            [alex]
          ),
        /traslaparse/,
        '23P01'
      )
      const { rows } = await db.query<{ e: string }>(
        `SELECT prg_hora_entrada_custom::text e FROM sgrh_programacion_semanal WHERE prg_id=$1`,
        [alex]
      )
      expect(rows[0].e).toBe('13:00:00')
    })

    it('editar un tramo sin tocar sus horas no choca consigo mismo', async () => {
      const id = await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await db.query(
        `UPDATE sgrh_programacion_semanal SET prg_hora_entrada_custom='08:30' WHERE prg_id=$1`,
        [id]
      )
      expect(await cuantos()).toBe(1)
    })

    it('rechaza trasladar un tramo a otra sucursal donde el contrato ya tiene uno ese día', async () => {
      // Como la matriz mueve a alguien de tienda: UPDATE de la sucursal, mismas horas.
      // Los dos tramos ya conviven sin traslaparse, así que lo único que lo detiene es
      // el índice único: un tramo por contrato, día y sucursal.
      const infinity = await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await tramo({ sucursal: ALEX, desde: '13:00', hasta: '17:00' })
      await rejects(
        () =>
          db.query(`UPDATE sgrh_programacion_semanal SET prg_sucursal_id=$2 WHERE prg_id=$1`, [
            infinity,
            ALEX,
          ]),
        /duplicate key/,
        '23505'
      )
    })

    it('trasladar un tramo a una sucursal donde no hay otro sí se permite', async () => {
      const id = await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await db.query(`UPDATE sgrh_programacion_semanal SET prg_sucursal_id=$2 WHERE prg_id=$1`, [
        id,
        ALEX,
      ])
      expect(await cuantos()).toBe(1)
    })

    it('no valida los tramos que cruzan la medianoche, porque no se comparan con una resta de horas', async () => {
      await tramo({ sucursal: INFINITY, horario: 4 }) // 22:00 a 06:00
      await tramo({ sucursal: ALEX, desde: '08:00', hasta: '12:00' })
      expect(await cuantos()).toBe(2)
    })
  })

  describe('un tramo por sucursal', () => {
    it('rechaza dos tramos del mismo contrato, día y sucursal', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await rejects(
        () => tramo({ sucursal: INFINITY, desde: '13:00', hasta: '17:00' }),
        /duplicate key/,
        '23505'
      )
    })
  })

  describe('día libre', () => {
    it('rechaza un tramo en un día ya marcado como libre', async () => {
      await tramo({ sucursal: INFINITY, libre: true })
      await rejects(
        () => tramo({ sucursal: ALEX, desde: '08:00', hasta: '12:00' }),
        /día libre no puede tener otros tramos/,
        '23514'
      )
    })

    it('rechaza marcar como libre un día que ya tiene otro tramo', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      await rejects(
        () => tramo({ sucursal: ALEX, libre: true }),
        /día libre no puede tener otros tramos/,
        '23514'
      )
    })

    it('rechaza convertir en libre un tramo cuando el día tiene otro', async () => {
      await tramo({ sucursal: INFINITY, desde: '08:00', hasta: '12:00' })
      const alex = await tramo({ sucursal: ALEX, desde: '13:00', hasta: '17:00' })
      await rejects(
        () =>
          db.query(`UPDATE sgrh_programacion_semanal SET prg_es_dia_libre=true WHERE prg_id=$1`, [
            alex,
          ]),
        /día libre/,
        '23514'
      )
    })

    it('un día libre solo, y un día libre en otra fecha, siguen siendo válidos', async () => {
      await tramo({ sucursal: INFINITY, libre: true })
      await tramo({ fecha: '2026-11-17', sucursal: ALEX, desde: '08:00', hasta: '12:00' })
      expect(await cuantos()).toBe(1)
    })
  })

  describe('con la RLS de la aplicación', () => {
    beforeAll(async () => {
      // Un gerente de Infinity: ve y escribe solo la sucursal 10, como sucursal_visible().
      await db.exec(`
        ALTER TABLE sgrh_programacion_semanal ENABLE ROW LEVEL SECURITY;
        CREATE POLICY gerente_infinity ON sgrh_programacion_semanal FOR ALL TO authenticated
          USING (prg_sucursal_id = ${INFINITY}) WITH CHECK (prg_sucursal_id = ${INFINITY});
        GRANT SELECT, INSERT, UPDATE ON sgrh_programacion_semanal TO authenticated;
      `)
    })

    it('el gerente no ve el tramo de la otra tienda, pero igual no puede traslaparlo', async () => {
      await tramo({ sucursal: ALEX, desde: '08:00', hasta: '12:00' })

      await db.exec('SET LOCAL ROLE authenticated')
      try {
        const visibles = await db.query('SELECT 1 FROM sgrh_programacion_semanal')
        expect(visibles.rows).toHaveLength(0)

        await rejects(
          () => tramo({ sucursal: INFINITY, desde: '10:00', hasta: '14:00' }),
          /traslaparse/,
          '23P01'
        )
        await tramo({ sucursal: INFINITY, desde: '13:00', hasta: '17:00' })
      } finally {
        await db.exec('RESET ROLE')
      }
      expect(await cuantos()).toBe(2)
    })
  })

  describe('al aplicar la migración sobre datos existentes', () => {
    it('se detiene, sin borrar nada, si ya hay dos filas del mismo contrato, día y sucursal', async () => {
      const previa = new PGlite()
      try {
        await previa.exec(ESQUEMA)
        await previa.exec(`
          INSERT INTO sgrh_programacion_semanal(
            prg_historial_laboral_id, prg_sucursal_id, prg_fecha, prg_hora_entrada_custom, prg_hora_salida_custom)
          VALUES (1, ${INFINITY}, '${DIA}', '08:00', '12:00'),
                 (1, ${INFINITY}, '${DIA}', '13:00', '17:00'),
                 (2, ${ALEX}, '${DIA}', '08:00', '12:00');
        `)

        await expect(previa.exec(sql())).rejects.toThrow(/hay 1 combinaciones/)
        // La migración abre su propia transacción y el error la deja abortada:
        // `supabase db push` hace este rollback solo.
        await previa.exec('ROLLBACK')

        const { rows } = await previa.query<{ n: number }>(
          'SELECT count(*)::int n FROM sgrh_programacion_semanal'
        )
        expect(rows[0].n).toBe(3)
      } finally {
        await previa.close()
      }
    })

    it('respeta los días que ya tienen filas en sucursales distintas', async () => {
      const previa = new PGlite()
      try {
        await previa.exec(ESQUEMA)
        await previa.exec(`
          INSERT INTO sgrh_programacion_semanal(
            prg_historial_laboral_id, prg_sucursal_id, prg_fecha, prg_hora_entrada_custom, prg_hora_salida_custom)
          VALUES (1, ${INFINITY}, '${DIA}', '08:00', '12:00'),
                 (1, ${ALEX}, '${DIA}', '13:00', '17:00');
        `)
        await previa.exec(sql())

        const { rows } = await previa.query<{ n: number }>(
          'SELECT count(*)::int n FROM sgrh_programacion_semanal'
        )
        expect(rows[0].n).toBe(2)
      } finally {
        await previa.close()
      }
    })

    it('se puede aplicar dos veces', async () => {
      await db.exec(sql())
    })
  })
})
