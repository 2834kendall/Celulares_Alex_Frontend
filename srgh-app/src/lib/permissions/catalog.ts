// src/lib/permissions/catalog.ts

/**
 * Catálogo central de permisos del sistema SGRH.
 * Estos strings deben coincidir EXACTAMENTE con los valores almacenados
 * en la tabla de permisos de Supabase y propagados al JWT (claim `permisos`).
 *
 * Convención: <MODULO>_<ACCION>
 */
export const PERMISOS = {
  // Empleados
  EMPLEADOS_READ: 'EMPLEADOS_READ',
  EMPLEADOS_WRITE: 'EMPLEADOS_WRITE',

  // Storage (SGRH-60): lectura de fotos de empleado (URLs firmadas).
  // Permiso propio y NO derivado de EMPLEADOS_READ a propósito: un dispositivo
  // compartido y físicamente expuesto no debe poder firmar archivos. La
  // escritura de fotos usa EMPLEADOS_WRITE (KIOSCO no lo tiene).
  FOTOS_READ: 'FOTOS_READ',

  // Storage (SGRH-60): documentos del expediente (CCSS, contratos,
  // incapacidades). Más sensibles que la ficha del empleado: permisos propios,
  // sembrados solo a ADMIN/SUPERADMIN/RRHH — nunca a KIOSCO ni a los roles de
  // solo-lectura de empleados.
  DOCUMENTOS_READ: 'DOCUMENTOS_READ',
  DOCUMENTOS_WRITE: 'DOCUMENTOS_WRITE',

  // Historial Laboral
  HISTORIAL_READ: 'HISTORIAL_READ',
  HISTORIAL_WRITE: 'HISTORIAL_WRITE',

  // Nómina
  NOMINA_READ: 'NOMINA_READ',
  NOMINA_WRITE: 'NOMINA_WRITE',
  NOMINA_APPROVE: 'NOMINA_APPROVE',
  COMPROBANTES_READ: 'COMPROBANTES_READ',

  // Asistencia
  ASISTENCIA_READ: 'ASISTENCIA_READ',
  ASISTENCIA_WRITE: 'ASISTENCIA_WRITE',

  // Operar el kiosco: poblar el selector de empleados de la tablet.
  //
  // Existe para que KIOSCO NO necesite EMPLEADOS_READ. Con EMPLEADOS_READ la
  // RLS le dejaba leer el expediente completo (cédula, fecha de nacimiento,
  // teléfono, email, CCSS, contacto de emergencia) de TODA la empresa desde un
  // dispositivo compartido con sesión permanente. Con este permiso la policy
  // empleados_select solo le expone a los empleados con asignación ACTIVA en
  // su propia sucursal, que es la población que el kiosco realmente necesita.
  ASISTENCIA_KIOSCO: 'ASISTENCIA_KIOSCO',

  // Ausencias
  AUSENCIAS_READ: 'AUSENCIAS_READ',
  AUSENCIAS_WRITE: 'AUSENCIAS_WRITE',
  AUSENCIAS_APPROVE: 'AUSENCIAS_APPROVE',

  // Horarios
  HORARIOS_READ: 'HORARIOS_READ',
  HORARIOS_WRITE: 'HORARIOS_WRITE',

  // Reclutamiento
  RECLUTAMIENTO_READ: 'RECLUTAMIENTO_READ',
  RECLUTAMIENTO_WRITE: 'RECLUTAMIENTO_WRITE',

  // Evaluaciones
  EVALUACIONES_READ: 'EVALUACIONES_READ',
  EVALUACIONES_WRITE: 'EVALUACIONES_WRITE',

  // Catálogos
  CATALOGOS_WRITE: 'CATALOGOS_WRITE',

  // Empresas
  EMPRESAS_WRITE: 'EMPRESAS_WRITE',

  // Roles y Permisos
  ROLES_WRITE: 'ROLES_WRITE',

  // Usuarios
  USUARIOS_WRITE: 'USUARIOS_WRITE',

  // Reportes
  REPORTES_READ: 'REPORTES_READ',
} as const

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS]
