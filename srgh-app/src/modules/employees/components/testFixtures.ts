import type { CatalogoItem, EmpleadoDetalle, TerritorioCatalogo } from '@/modules/employees/types'

/** Fixtures compartidos por los tests de componentes del módulo. */

export const TIPOS_IDENTIFICACION: CatalogoItem[] = [
  { id: 1, nombre: 'Cédula nacional' },
  { id: 2, nombre: 'DIMEX' },
]

export const BANCOS: CatalogoItem[] = [
  { id: 3, nombre: 'BAC Credomatic' },
  { id: 5, nombre: 'Banco Nacional' },
]

/**
 * Recorte del catálogo del IGN con dos provincias y dos cantones cada una, lo
 * mínimo para ejercitar la cascada: filtrar hijos y comprobar que cambiar de
 * padre limpia la selección.
 */
export const TERRITORIO: TerritorioCatalogo = {
  provincias: [
    { id: 1, nombre: 'San José' },
    { id: 2, nombre: 'Alajuela' },
  ],
  cantones: [
    { id: 11, nombre: 'San José', provinciaId: 1 },
    { id: 12, nombre: 'Escazú', provinciaId: 1 },
    { id: 21, nombre: 'Alajuela', provinciaId: 2 },
  ],
  distritos: [
    { id: 101, nombre: 'Carmen', cantonId: 11, codigoPostal: '10101' },
    { id: 102, nombre: 'Merced', cantonId: 11, codigoPostal: '10102' },
    { id: 121, nombre: 'Escazú', cantonId: 12, codigoPostal: '10201' },
    { id: 201, nombre: 'Alajuela', cantonId: 21, codigoPostal: '20101' },
  ],
}

export const HISTORIAL_ACTIVO: NonNullable<EmpleadoDetalle['historial_activo']> = {
  lab_id: 5,
  lab_empleado_id: 10,
  lab_empresa_id: 1,
  lab_puesto_id: 3,
  lab_sucursal_id: 2,
  lab_tipo_contrato_id: 1,
  lab_tipo_jornada_id: 1,
  lab_fecha_inicio: '2024-02-01',
  lab_fecha_fin: null,
  lab_salario_base: 500000,
  lab_salario_real: 550000,
  lab_motivo_salida_id: null,
  lab_observaciones_salida: null,
  lab_recontratable: true,
  lab_created_at: '2024-02-01T00:00:00Z',
  puesto_nombre: 'Cajera',
  sucursal_nombre: 'Central',
  tipo_contrato_nombre: 'Indefinido',
  tipo_jornada_nombre: 'Diurna',
}

export const EMPLEADO_DETALLE: EmpleadoDetalle = {
  emp_id: 10,
  emp_nombre: 'Ana',
  emp_apellido_1: 'Mora',
  emp_apellido_2: null,
  emp_tipo_identificacion_id: 1,
  emp_numero_identificacion: '1-1111-1111',
  emp_fecha_ingreso_original: '2024-01-01',
  emp_fecha_nacimiento: '1990-05-10',
  emp_genero: 'F',
  emp_nacionalidad: 'Costarricense',
  emp_telefono: '8888-8888',
  emp_email_personal: 'ana@mail.com',
  emp_numero_asegurado_ccss: null,
  emp_nombre_contacto_emergencia: null,
  emp_telefono_emergencia: null,
  emp_rostro_hash: null,
  emp_created_at: '2024-01-01T00:00:00Z',
  emp_direccion_id: 7,
  tipo_identificacion_nombre: 'Cédula nacional',
  historial_activo: HISTORIAL_ACTIVO,
  datos_pago: {
    edp_banco_id: 3,
    banco_nombre: 'BAC Credomatic',
    edp_tipo_cuenta: 'AHORRO',
    edp_numero_cuenta: null,
  },
  direccion: {
    dir_distrito_id: 121,
    dir_codigo_postal: '10201',
    dir_senas_exactas: '200 m norte de la iglesia',
    distrito_nombre: 'Escazú',
    canton_nombre: 'Escazú',
    provincia_nombre: 'San José',
  },
}
