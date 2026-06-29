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
  EMPLEADOS_READ: "EMPLEADOS_READ",
  EMPLEADOS_WRITE: "EMPLEADOS_WRITE",

  // Historial Laboral
  HISTORIAL_READ: "HISTORIAL_READ",
  HISTORIAL_WRITE: "HISTORIAL_WRITE",

  // Nómina
  NOMINA_READ: "NOMINA_READ",
  NOMINA_WRITE: "NOMINA_WRITE",

  // Asistencia
  ASISTENCIA_READ: "ASISTENCIA_READ",
  ASISTENCIA_WRITE: "ASISTENCIA_WRITE",

  // Ausencias
  AUSENCIAS_READ: "AUSENCIAS_READ",
  AUSENCIAS_APPROVE: "AUSENCIAS_APPROVE",

  // Reclutamiento
  RECLUTAMIENTO_READ: "RECLUTAMIENTO_READ",
  RECLUTAMIENTO_WRITE: "RECLUTAMIENTO_WRITE",

  // Evaluaciones
  EVALUACIONES_READ: "EVALUACIONES_READ",
  EVALUACIONES_WRITE: "EVALUACIONES_WRITE",

  // Catálogos
  CATALOGOS_WRITE: "CATALOGOS_WRITE",

  // Empresas
  EMPRESAS_WRITE: "EMPRESAS_WRITE",

  // Roles y Permisos
  ROLES_WRITE: "ROLES_WRITE",

  // Usuarios
  USUARIOS_WRITE: "USUARIOS_WRITE",
} as const;

export type Permiso = (typeof PERMISOS)[keyof typeof PERMISOS];

