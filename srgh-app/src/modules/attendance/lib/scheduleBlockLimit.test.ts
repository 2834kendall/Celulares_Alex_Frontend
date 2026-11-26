import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const migrate = (file: string) => readFileSync(`supabase/migrations/${file}`, 'utf8')
const addSegment = (date: string, template: number | null, start = '20:00', end = '23:00') => `
  INSERT INTO sgrh_programacion_semanal
    (prg_historial_laboral_id, prg_fecha, prg_horario_id,
     prg_hora_entrada_custom, prg_hora_salida_custom)
  VALUES (1, '${date}', ${template ?? 'NULL'},
          ${template === null ? `'${start}', '${end}'` : 'NULL, NULL'})
`

describe('maximum scheduled attendance blocks per day', () => {
  let db: PGlite

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE SCHEMA sgrh_private;
      CREATE TABLE public.sgrh_cat_horarios (
        hor_id int PRIMARY KEY, hor_hora_entrada time NOT NULL, hor_hora_salida time NOT NULL
      );
      CREATE TABLE public.sgrh_programacion_semanal (
        prg_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        prg_historial_laboral_id int NOT NULL,
        prg_fecha date NOT NULL,
        prg_horario_id int REFERENCES public.sgrh_cat_horarios(hor_id),
        prg_es_dia_libre bool NOT NULL DEFAULT false,
        prg_hora_entrada_custom time,
        prg_hora_salida_custom time
      );
    `)
    await db.exec(migrate('20261116200000_schedule_second_block.sql'))
    await db.exec(`
      CREATE TRIGGER sgrh_prg_validar_tramos BEFORE INSERT OR UPDATE ON public.sgrh_programacion_semanal
      FOR EACH ROW EXECUTE FUNCTION sgrh_private.prg_validar_tramos();
      INSERT INTO sgrh_cat_horarios VALUES (1, '08:00', '12:00', '15:00', '18:00');
      ${addSegment('2026-11-01', 1)};
      ${addSegment('2026-11-01', null)};
    `)
    await db.exec(migrate('20261125120000_limit_daily_attendance_blocks.sql'))
  }, 30_000)

  afterAll(async () => {
    await db?.close()
  })

  it('leaves existing excess blocks in place', async () => {
    expect(
      (
        await db.query(
          "SELECT count(*) AS total FROM sgrh_programacion_semanal WHERE prg_fecha = '2026-11-01'"
        )
      ).rows
    ).toEqual([{ total: 2 }])
  })

  it('counts a split template as two blocks', async () => {
    await db.exec(addSegment('2026-11-02', 1))
    await expect(db.exec(addSegment('2026-11-02', null))).rejects.toMatchObject({
      code: '23514',
      message: 'Un día no puede tener más de 2 bloques.',
    })
  })

  it('counts a custom override of a split template as one block and excludes the row being edited', async () => {
    await db.exec(`
      ${addSegment('2026-11-03', null, '08:00', '12:00')};
      ${addSegment('2026-11-03', null, '15:00', '18:00')};
      UPDATE sgrh_programacion_semanal SET prg_horario_id = 1
      WHERE prg_fecha = '2026-11-03' AND prg_hora_entrada_custom = '08:00';
    `)
    await expect(db.exec(addSegment('2026-11-03', null))).rejects.toMatchObject({
      code: '23514',
      message: 'Un día no puede tener más de 2 bloques.',
    })
  })
})
