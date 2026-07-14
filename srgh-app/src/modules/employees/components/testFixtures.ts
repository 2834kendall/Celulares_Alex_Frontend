import type { CatalogoItem, EmpleadoDetalle } from '@/modules/employees/types'

/** Fixtures compartidos por los tests de componentes del módulo. */

export const TIPOS_IDENTIFICACION: CatalogoItem[] = [
  { id: 1, nombre: 'Cédula nacional' },
  { id: 2, nombre: 'DIMEX' },
]

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
  tipo_identificacion_nombre: 'Cédula nacional',
  historial_activo: HISTORIAL_ACTIVO,
  datos_pago: {
    edp_banco: 'BAC',
    edp_tipo_cuenta: 'AHORRO',
    edp_numero_cuenta: null,
  },
}
