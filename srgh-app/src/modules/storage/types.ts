// ─── Módulo de storage (SGRH-60) ─────────────────────────────────────────────
// Fase 1: laboratorio temporal para probar el core (subida validada, URLs
// firmadas, RLS multi-tenant) SIN tocar empleados ni usuarios. Todo lo *Lab*
// se borra cuando la fase 2 integre la foto real del empleado.

// ─── View Model — Archivo del laboratorio ────────────────────────────────────
// La URL viene YA FIRMADA desde el servidor (TTL_LAB): el cliente la trata
// como string opaco y nunca sabe qué proveedor hay detrás.

export interface ArchivoLabItem {
  path: string
  url: string
  sizeBytes: number | null
  contentType: string | null
  createdAt: string | null
}

// ─── View Model — Documento del laboratorio ──────────────────────────────────
// SIN url a propósito: los documentos nunca se renderizan inline. La única
// salida es el botón Descargar, que firma al momento del clic (TTL_DESCARGA)
// con Content-Disposition: attachment.

export interface DocumentoLabItem {
  path: string
  sizeBytes: number | null
  contentType: string | null
  createdAt: string | null
}
