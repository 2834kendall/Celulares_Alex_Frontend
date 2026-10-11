import { requireAnyPermission } from '@/lib/auth/require-permission'
import { PERMISOS } from '@/lib/permissions/catalog'

/**
 * Guarda de las acciones del kiosco (SGRH-88).
 *
 * La cuenta KIOSCO solo tiene ASISTENCIA_KIOSCO: ningun permiso que le abra
 * tablas. Todo lo que el kiosco lee o escribe (programacion, contratos,
 * rostros, marcas, ausencias) lo hace el SERVIDOR con el cliente admin,
 * despues de esta guarda y siempre acotado a la empresa del JWT y a la
 * sucursal asignada a la cuenta.
 *
 * Antes tenia ASISTENCIA_WRITE, y como las politicas de marcas y de
 * programacion solo piden ese permiso, la sesion de una tablet (expuesta en
 * la tienda, abierta siempre) podia insertar marcas sin Face ID o asignarse
 * turnos llamando a la API directamente. Y aun asi no podia LEER la
 * programacion ni los contratos (piden ASISTENCIA_READ / EMPLEADOS_READ), asi
 * que con una cuenta KIOSCO real el kiosco no encontraba a nadie.
 *
 * ASISTENCIA_WRITE se sigue aceptando para el encargado que abre la pantalla
 * del kiosco con su propia cuenta.
 */
export function requireKioskAccess() {
  return requireAnyPermission([PERMISOS.ASISTENCIA_KIOSCO, PERMISOS.ASISTENCIA_WRITE])
}
