import { readFileSync } from 'node:fs'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPolicyDatabase, queryAsUser } from '@/test/databasePolicies'

// La RPC del alta corre con SECURITY DEFINER: la RLS no la cubre y la
// sucursal la tiene que validar ella misma (SGRH-122).

const PERMISOS = ['EMPLEADOS_WRITE', 'HISTORIAL_WRITE']
const deSucursal = { empresa_id: 1, sucursal_ids: [10], permisos: PERMISOS }
const deEmpresa = { empresa_id: 1, permisos: PERMISOS }

const alta = (sucursal: number) => `
  SELECT public.crear_empleado_completo(
    '{"emp_nombre":"Ana","emp_apellido_1":"Mora","emp_tipo_identificacion_id":1,
      "emp_numero_identificacion":"1-1111-1111","emp_fecha_ingreso_original":"2026-11-01",
      "emp_fecha_nacimiento":"1990-01-01","emp_genero":"F"}'::jsonb,
    '{"lab_puesto_id":1,"lab_sucursal_id":${sucursal},"lab_tipo_contrato_id":1,
      "lab_tipo_jornada_id":1,"lab_fecha_inicio":"2026-11-01",
      "lab_salario_base":400000,"lab_salario_real":400000}'::jsonb,
    NULL,
    '{"dir_distrito_id":1,"dir_senas_exactas":"Centro"}'::jsonb
  ) AS emp_id
`

describe('crear_empleado_completo: sucursal de la cuenta', () => {
  let db: PGlite

  beforeAll(async () => {
    db = await createPolicyDatabase()
    await db.exec(`
      CREATE ROLE anon;
      CREATE TABLE sgrh_cat_puestos (pue_id int PRIMARY KEY, pue_empresa_id int);
      CREATE TABLE sgrh_cat_bancos (ban_id int PRIMARY KEY, ban_activo boolean);
      CREATE TABLE sgrh_cat_distritos (dis_id int PRIMARY KEY);
      CREATE TABLE sgrh_direcciones (
        dir_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        dir_distrito_id int, dir_senas_exactas text
      );
      CREATE TABLE sgrh_empleados (
        emp_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        emp_nombre text, emp_apellido_1 text, emp_apellido_2 text,
        emp_tipo_identificacion_id int, emp_numero_identificacion text,
        emp_fecha_ingreso_original date, emp_fecha_nacimiento date, emp_genero text,
        emp_nacionalidad text, emp_telefono text, emp_email_personal text,
        emp_numero_asegurado_ccss text, emp_nombre_contacto_emergencia text,
        emp_telefono_emergencia text, emp_direccion_id int
      );
      CREATE TABLE sgrh_historial_laboral (
        lab_id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        lab_empleado_id int, lab_empresa_id int, lab_puesto_id int, lab_sucursal_id int,
        lab_tipo_contrato_id int, lab_tipo_jornada_id int, lab_fecha_inicio date,
        lab_salario_base numeric, lab_salario_real numeric
      );
      CREATE TABLE sgrh_empleado_datos_pago (
        edp_empleado_id int, edp_banco_id int, edp_tipo_cuenta text,
        edp_numero_cuenta text, edp_cuenta_hmac text
      );
      INSERT INTO sgrh_cat_puestos VALUES (1, 1);
      INSERT INTO sgrh_cat_distritos VALUES (1);
    `)
    await db.exec(
      readFileSync('supabase/migrations/20261126120000_crear_empleado_sucursal_visible.sql', 'utf8')
    )
  }, 30_000)

  afterAll(async () => {
    await db?.close()
  })

  it('una cuenta de sucursal da de alta en su propia sucursal', async () => {
    const { rows } = await queryAsUser(db, deSucursal, alta(10))
    expect(rows).toHaveLength(1)
  })

  it('una cuenta de sucursal NO puede dar de alta en otra sucursal de la empresa', async () => {
    await expect(queryAsUser(db, deSucursal, alta(11))).rejects.toThrow(
      'No tenés acceso a esa sucursal'
    )
  })

  it('una cuenta de empresa da de alta en cualquier sucursal de la empresa', async () => {
    const { rows } = await queryAsUser(db, deEmpresa, alta(11))
    expect(rows).toHaveLength(1)
  })

  it('la sucursal de otra empresa sigue rechazada como antes', async () => {
    await expect(queryAsUser(db, deEmpresa, alta(20))).rejects.toThrow(
      'Sucursal inexistente o de otra empresa'
    )
  })
})
