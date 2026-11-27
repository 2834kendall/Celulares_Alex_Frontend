import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// SGRH-123: los tipos de tardía por defecto pasan a llevar tilde.
const MIGRACION = readFileSync(
  'supabase/migrations/20261127120000_tipos_tardia_con_tilde.sql',
  'utf8'
)

describe('tipos de tardía con tilde (migración)', () => {
  let db: PGlite

  const nombres = async (empresa: number) =>
    (
      await db.query<{ tta_nombre: string }>(
        `SELECT tta_nombre FROM public.sgrh_cat_tipos_tardia
         WHERE tta_empresa_id = $1 ORDER BY tta_desde_minutos`,
        [empresa]
      )
    ).rows.map((r) => r.tta_nombre)

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE TABLE public.sgrh_empresas (org_id int PRIMARY KEY);
      CREATE TABLE public.sgrh_cat_tipos_tardia (
        tta_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tta_empresa_id int NOT NULL,
        tta_nombre varchar NOT NULL,
        tta_desde_minutos int NOT NULL,
        tta_cuenta_advertencia boolean NOT NULL,
        tta_color varchar,
        UNIQUE (tta_empresa_id, tta_desde_minutos)
      );
      INSERT INTO public.sgrh_empresas VALUES (1), (2);
      INSERT INTO public.sgrh_cat_tipos_tardia
        (tta_empresa_id, tta_nombre, tta_desde_minutos, tta_cuenta_advertencia, tta_color)
      VALUES
        (1, 'Tardia leve', 1, true, '#F59E0B'),
        (1, 'Tardia', 6, true, '#EA580C'),
        (1, 'Tardia grave', 11, true, '#E11D48'),
        (2, 'Llegada tarde', 1, true, '#F59E0B'),
        (2, 'Tardia', 10, true, '#EA580C');
    `)
    await db.exec(MIGRACION)
    await db.exec(`
      CREATE TRIGGER sgrh_empresas_tipos_tardia_por_defecto
        AFTER INSERT ON public.sgrh_empresas
        FOR EACH ROW EXECUTE FUNCTION public.sgrh_crear_tipos_tardia_por_defecto();
    `)
  }, 30_000)

  afterAll(async () => {
    await db?.close()
  })

  it('les pone tilde a los tipos que siguen con el nombre de fábrica', async () => {
    expect(await nombres(1)).toEqual(['Tardía leve', 'Tardía', 'Tardía grave'])
  })

  it('respeta los nombres que la empresa ya cambió', async () => {
    expect(await nombres(2)).toEqual(['Llegada tarde', 'Tardía'])
  })

  it('una empresa nueva nace con los tipos con tilde', async () => {
    await db.exec('INSERT INTO public.sgrh_empresas VALUES (3)')
    expect(await nombres(3)).toEqual(['Tardía leve', 'Tardía', 'Tardía grave'])
  })

  it('correrla de nuevo no cambia nada', async () => {
    await db.exec(MIGRACION)
    expect(await nombres(1)).toEqual(['Tardía leve', 'Tardía', 'Tardía grave'])
    expect(await nombres(2)).toEqual(['Llegada tarde', 'Tardía'])
  })
})
