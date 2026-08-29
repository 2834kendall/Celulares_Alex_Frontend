// src/modules/employees/types.ts
//
// Contrato de datos del módulo Employees.
// Reglas:
//  1. Los schemas Zod de Insert/Update se tipan contra database.types.ts para que
//     cualquier cambio de schema en Supabase lo detecte el compilador.
//  2. Los tipos de formulario se infieren desde Zod — no se declaran a mano.
//  3. El view model EmpleadoListItem es el DTO que usan los componentes de listado;
//     nunca expone columnas internas como rostro_hash o created_at.
//
// Nota: El proyecto usa Zod v4. En v4:
//   - `required_error` fue reemplazado por `error` en los params de tipo
//   - z.ZodSchema<T> → z.ZodType<T> para casteo explícito con tipos externos

import { z } from 'zod'
import type { Database } from '@/types/database.types'
import { IBAN_CR_REGEX, isValidIbanChecksum, normalizeIban } from '@/modules/employees/lib/iban'

// ─── Aliases de tipos Supabase ────────────────────────────────────────────────

type EmpleadoRow = Database['public']['Tables']['sgrh_empleados']['Row']
type EmpleadoInsert = Database['public']['Tables']['sgrh_empleados']['Insert']
type EmpleadoUpdate = Database['public']['Tables']['sgrh_empleados']['Update']

type HistorialLaboralRow = Database['public']['Tables']['sgrh_historial_laboral']['Row']
type HistorialLaboralInsert = Database['public']['Tables']['sgrh_historial_laboral']['Insert']

type DatosPagoRow = Database['public']['Tables']['sgrh_empleado_datos_pago']['Row']
type DatosPagoInsert = Database['public']['Tables']['sgrh_empleado_datos_pago']['Insert']

type DireccionRow = Database['public']['Tables']['sgrh_direcciones']['Row']
type DireccionInsert = Database['public']['Tables']['sgrh_direcciones']['Insert']

type DocumentoRow = Database['public']['Tables']['sgrh_documentos']['Row']
type DocumentoInsert = Database['public']['Tables']['sgrh_documentos']['Insert']

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Los inputs HTML emiten '' cuando están vacíos; los campos opcionales de la DB
// esperan null. Sin esto, los regex de teléfono/email rechazarían el string vacío.

const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? null : value), schema)

// ─── Schema de creación de empleado ──────────────────────────────────────────
// Sincronizado con EmpleadoInsert — si el tipo de la DB cambia, TS lo detecta.

export const crearEmpleadoSchema = z.object({
  emp_nombre: z
    .string({ error: 'El nombre es obligatorio' })
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(100, 'El nombre no puede superar 100 caracteres'),

  emp_apellido_1: z
    .string({ error: 'El primer apellido es obligatorio' })
    .min(2, 'El apellido debe tener al menos 2 caracteres')
    .max(100, 'El apellido no puede superar 100 caracteres'),

  emp_apellido_2: emptyToNull(
    z.string().max(100, 'El apellido no puede superar 100 caracteres').nullable().optional()
  ),

  emp_tipo_identificacion_id: z
    .number({ error: 'El tipo de identificación es obligatorio' })
    .int()
    .positive('Debe seleccionar un tipo de identificación válido'),

  emp_numero_identificacion: z
    .string({ error: 'El número de identificación es obligatorio' })
    .min(1, 'El número de identificación es obligatorio')
    .max(30, 'Máximo 30 caracteres'),

  emp_fecha_ingreso_original: z
    .string({ error: 'La fecha de ingreso es obligatoria' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),

  emp_fecha_nacimiento: emptyToNull(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
      .nullable()
      .optional()
  ),

  // Valores alineados al CHECK de la DB: emp_genero IN ('M','F','O').
  emp_genero: emptyToNull(z.enum(['M', 'F', 'O']).nullable().optional()),

  emp_nacionalidad: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().max(60, 'Máximo 60 caracteres').optional().default('Costarricense')
  ),

  emp_telefono: emptyToNull(
    z
      .string()
      .regex(/^\+?[\d\s\-()]{7,20}$/, 'Número de teléfono inválido')
      .nullable()
      .optional()
  ),

  emp_email_personal: emptyToNull(z.email('Correo electrónico inválido').nullable().optional()),

  emp_numero_asegurado_ccss: emptyToNull(
    z.string().max(20, 'Máximo 20 caracteres').nullable().optional()
  ),

  emp_nombre_contacto_emergencia: emptyToNull(
    z.string().max(150, 'Máximo 150 caracteres').nullable().optional()
  ),

  emp_telefono_emergencia: emptyToNull(
    z
      .string()
      .regex(/^\+?[\d\s\-()]{7,20}$/, 'Número de teléfono inválido')
      .nullable()
      .optional()
  ),
  // emp_direccion_id queda fuera: el cliente manda la dirección en su propio
  // bloque (direccionSchema) y es la RPC la que crea la fila y enlaza el id.
}) satisfies z.ZodType<
  Omit<EmpleadoInsert, 'emp_id' | 'emp_created_at' | 'emp_rostro_hash' | 'emp_direccion_id'>
>

export type CrearEmpleadoInput = z.infer<typeof crearEmpleadoSchema>

// ─── Schema de edición de empleado ───────────────────────────────────────────
// Todos los campos son opcionales porque la edición puede ser parcial.

export const editarEmpleadoSchema = crearEmpleadoSchema.partial() satisfies z.ZodType<
  Omit<EmpleadoUpdate, 'emp_id' | 'emp_created_at' | 'emp_rostro_hash'>
>

export type EditarEmpleadoInput = z.infer<typeof editarEmpleadoSchema>

// ─── Schema de datos de pago ─────────────────────────────────────────────────
// Viven en sgrh_empleado_datos_pago (tabla propia con RLS más estricta que la
// ficha: NOMINA_READ / EMPLEADOS_WRITE / el propio empleado). Todos opcionales.

export const datosPagoSchema = z
  .object({
    // El select emite NaN (valueAsNumber) cuando está en "Sin especificar".
    edp_banco_id: z.preprocess(
      (value) =>
        value === '' || (typeof value === 'number' && Number.isNaN(value)) ? null : value,
      z.number().int().positive('Seleccione un banco válido').nullable().optional()
    ),

    edp_tipo_cuenta: emptyToNull(z.enum(['CORRIENTE', 'AHORRO', 'SINPE']).nullable().optional()),

    // Se normaliza ANTES de validar (mayúsculas, sin espacios/guiones); la
    // coherencia según el tipo de cuenta se valida en el superRefine.
    edp_numero_cuenta: z.preprocess((value) => {
      if (typeof value !== 'string') return value
      const normalized = normalizeIban(value)
      return normalized === '' ? null : normalized
    }, z.string().max(30, 'Máximo 30 caracteres').nullable().optional()),
  })
  .superRefine((data, ctx) => {
    if (!data.edp_numero_cuenta) return

    // Una cuenta sin banco no es interpretable: el banco define la entidad
    // del IBAN. La UI deshabilita el campo hasta elegir banco; esto cubre
    // cualquier otro camino de entrada.
    if (data.edp_banco_id === null || data.edp_banco_id === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['edp_banco_id'],
        message: 'Selecciona el banco de la cuenta',
      })
    }

    // SINPE Móvil usa el teléfono como número de destino, no un IBAN.
    if (data.edp_tipo_cuenta === 'SINPE') {
      if (!/^\d{8}$/.test(data.edp_numero_cuenta)) {
        ctx.addIssue({
          code: 'custom',
          path: ['edp_numero_cuenta'],
          message: 'Para SINPE Móvil ingresa el teléfono de 8 dígitos',
        })
      }
      return
    }

    if (!IBAN_CR_REGEX.test(data.edp_numero_cuenta)) {
      ctx.addIssue({
        code: 'custom',
        path: ['edp_numero_cuenta'],
        message: 'El IBAN debe iniciar con CR y tener 22 caracteres (CR + 20 dígitos)',
      })
      return
    }

    if (!isValidIbanChecksum(data.edp_numero_cuenta)) {
      ctx.addIssue({
        code: 'custom',
        path: ['edp_numero_cuenta'],
        message: 'El IBAN no es válido (dígitos verificadores incorrectos)',
      })
    }
    // Que el IBAN pertenezca al banco elegido se verifica en el servidor
    // (validateDatosPago), que es quien conoce sgrh_cat_bancos.ban_codigo.
    //
    // edp_cuenta_hmac queda fuera del schema a propósito: lo calcula el servidor
    // a partir del número ya normalizado. Si viniera del formulario, el cliente
    // podría desalinearlo del ciphertext y envenenar la detección de duplicados.
  }) satisfies z.ZodType<
  Omit<DatosPagoInsert, 'edp_id' | 'edp_empleado_id' | 'edp_created_at' | 'edp_cuenta_hmac'>
>

export type DatosPagoInput = z.infer<typeof datosPagoSchema>

// El número de cuenta se guarda cifrado, así que la base no puede tener un
// UNIQUE sobre él; la detección de cuentas repetidas se hace comparando el
// índice ciego (HMAC) en validateDatosPago. Como una cuenta compartida es
// legítima (cónyuges, por ejemplo) la detección no bloquea: devuelve
// requiereConfirmacion, la UI pregunta, y el reenvío llega con este flag en
// true. Vive fuera de datosPagoSchema porque no es una columna de la tabla.
const confirmarCuentaDuplicada = z.boolean().optional()

// ─── Schema de dirección ─────────────────────────────────────────────────────
// Vive en sgrh_direcciones, tabla genérica compartida con empresas y sucursales.
//
// Solo se captura el distrito: provincia y cantón se derivan por la cadena de
// FKs y existen únicamente como estado de la cascada en la UI. Guardarlos
// permitiría estados incoherentes (un distrito que no pertenece al cantón).
//
// dir_codigo_postal no entra al schema a propósito: lo calcula un trigger desde
// el distrito, así que lo que mande el cliente se ignora.

export const direccionSchema = z.object({
  // El select emite NaN (valueAsNumber) cuando está sin elegir; z.number() lo
  // rechaza y muestra el mensaje de obligatorio.
  dir_distrito_id: z
    .number({ error: 'El distrito es obligatorio' })
    .int()
    .positive('Seleccione un distrito válido'),

  // En Costa Rica las señas SON la dirección: sin ellas provincia/cantón/distrito
  // no alcanzan para ubicar a nadie. La columna es nullable en la DB, así que la
  // obligatoriedad vive solo aquí y se puede relajar sin tocar el esquema.
  dir_senas_exactas: z
    .string({ error: 'Las señas exactas son obligatorias' })
    .trim()
    .min(10, 'Describe la ubicación con más detalle')
    .max(300, 'Máximo 300 caracteres'),
}) satisfies z.ZodType<Omit<DireccionInsert, 'dir_id' | 'dir_codigo_postal' | 'dir_created_at'>>

export type DireccionInput = z.infer<typeof direccionSchema>

// ─── Schema de edición de ficha completa ─────────────────────────────────────
// La pantalla de edición guarda la ficha personal + dirección + datos de pago.

export const editarFichaEmpleadoSchema = z.object({
  empleado: editarEmpleadoSchema,
  // Obligatoria: si se abre el formulario, se guarda una dirección válida.
  direccion: direccionSchema,
  datos_pago: datosPagoSchema.optional(),
  confirmar_cuenta_duplicada: confirmarCuentaDuplicada,
})

export type EditarFichaEmpleadoInput = z.infer<typeof editarFichaEmpleadoSchema>

// ─── Schema de creación de historial laboral (contratación) ──────────────────
// Se crea en paralelo al empleado en el flujo de onboarding.

export const crearHistorialLaboralSchema = z.object({
  lab_puesto_id: z
    .number({ error: 'El puesto es obligatorio' })
    .int()
    .positive('Seleccione un puesto válido'),

  lab_sucursal_id: z
    .number({ error: 'La sucursal es obligatoria' })
    .int()
    .positive('Seleccione una sucursal válida'),

  lab_tipo_contrato_id: z
    .number({ error: 'El tipo de contrato es obligatorio' })
    .int()
    .positive('Seleccione un tipo de contrato válido'),

  lab_tipo_jornada_id: z
    .number({ error: 'El tipo de jornada es obligatorio' })
    .int()
    .positive('Seleccione un tipo de jornada válido'),

  lab_fecha_inicio: z
    .string({ error: 'La fecha de inicio es obligatoria' })
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)'),

  lab_salario_base: z
    .number({ error: 'El salario base es obligatorio' })
    .positive('El salario base debe ser mayor a 0'),

  lab_salario_real: z
    .number({ error: 'El salario real es obligatorio' })
    .positive('El salario real debe ser mayor a 0'),
}) satisfies z.ZodType<
  Omit<
    HistorialLaboralInsert,
    | 'lab_id'
    | 'lab_created_at'
    | 'lab_empleado_id'
    | 'lab_empresa_id'
    | 'lab_fecha_fin'
    | 'lab_motivo_salida_id'
    | 'lab_observaciones_salida'
    | 'lab_recontratable'
  >
>

export type CrearHistorialLaboralInput = z.infer<typeof crearHistorialLaboralSchema>

// ─── Schema de creación de usuario del sistema (paso 3 del onboarding) ───────
// El alta real la hace supabase.auth.admin.inviteUserByEmail; aquí solo se
// validan los datos que el administrador captura en el wizard.

export const crearUsuarioEmpleadoSchema = z.object({
  // Supabase Auth almacena los emails en minúsculas; sin normalizar aquí, el
  // vínculo posterior por usr_email no matchearía con mayúsculas en el input.
  // El trim va ANTES de validar (un espacio accidental no debe invalidar).
  email: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.email('Correo electrónico inválido').transform((value) => value.toLowerCase())
  ),

  rol_id: z.number({ error: 'El rol es obligatorio' }).int().positive('Seleccione un rol válido'),

  sucursal_id: z.number().int().positive('Seleccione una sucursal válida').nullable().optional(),
})

export type CrearUsuarioEmpleadoInput = z.infer<typeof crearUsuarioEmpleadoSchema>

// ─── Schema de onboarding completo ───────────────────────────────────────────
// Combina empleado + contratación (+ usuario opcional) en un único formulario
// de alta. El paso de usuario solo aplica si el administrador lo activa.

export const onboardingEmpleadoSchema = z.object({
  empleado: crearEmpleadoSchema,
  direccion: direccionSchema,
  contratacion: crearHistorialLaboralSchema,
  datos_pago: datosPagoSchema.optional(),
  usuario: crearUsuarioEmpleadoSchema.optional(),
  confirmar_cuenta_duplicada: confirmarCuentaDuplicada,
})

export type OnboardingEmpleadoInput = z.infer<typeof onboardingEmpleadoSchema>

// ─── View Model — Ítem de catálogo ───────────────────────────────────────────
// DTO uniforme para poblar selects (puestos, sucursales, tipos, roles).

export interface CatalogoItem {
  id: number
  nombre: string
}

// ─── View Model — Catálogo territorial ───────────────────────────────────────
// Las tres tablas del IGN completas (7 / 84 / 492). Se carga de una sola vez en
// el Server Component y la cascada filtra en memoria: son ~5 KB comprimidos, y
// pedir cada nivel por separado costaría un round-trip por select mientras el
// usuario llena el formulario. Los hijos llevan el id del padre para filtrar.

export interface TerritorioCatalogo {
  provincias: CatalogoItem[]
  cantones: (CatalogoItem & { provinciaId: number })[]
  // codigoPostal es dis_codigo: en Costa Rica el código de distrito de 5 dígitos
  // ES el código postal. Viaja en el catálogo para poder mostrarlo en el
  // formulario sin esperar a que el trigger lo calcule al guardar.
  distritos: (CatalogoItem & { cantonId: number; codigoPostal: string })[]
}

// ─── View Model — Listado de empleados ───────────────────────────────────────
// DTO devuelto al componente de listado.
// Solo expone campos seguros para la UI; nunca rostro_hash, número de cuenta
// ni datos financieros.

export type EmpleadoListItem = Pick<
  EmpleadoRow,
  | 'emp_id'
  | 'emp_nombre'
  | 'emp_apellido_1'
  | 'emp_apellido_2'
  | 'emp_numero_identificacion'
  | 'emp_telefono'
  | 'emp_email_personal'
  | 'emp_fecha_ingreso_original'
  | 'emp_genero'
  | 'emp_nacionalidad'
> & {
  // Campos JOIN desde el historial_laboral activo (null si el empleado está inactivo)
  puesto_nombre: string | null
  sucursal_nombre: string | null
  tipo_contrato_nombre: string | null
  salario_base: number | null
  fecha_inicio_contrato: string | null
  activo: boolean
  // URL firmada (SGRH-67), null sin foto o si el firmado en lote falló —
  // Avatar cae a iniciales en ambos casos. NUNCA se persiste, se firma en
  // cada carga de la lista.
  foto_url: string | null
}

// ─── View Model — Detalle de empleado ────────────────────────────────────────
// DTO para la página de perfil /employees/[id].

export type EmpleadoDetalle = EmpleadoRow & {
  tipo_identificacion_nombre: string
  // URL firmada (SGRH-67) de emp_foto_path, null sin foto. Avatar cae a
  // iniciales si es null o si el firmado falló.
  foto_url: string | null
  historial_activo:
    | (HistorialLaboralRow & {
        puesto_nombre: string
        sucursal_nombre: string
        tipo_contrato_nombre: string
        tipo_jornada_nombre: string
      })
    | null
  // null cuando el empleado no tiene datos de pago registrados O cuando el rol
  // del usuario no alcanza para verlos (la RLS de la tabla oculta las filas).
  //
  // edp_numero_cuenta llega DESCIFRADO. Ojo con cuenta_ilegible: distingue "no
  // hay cuenta registrada" de "hay una cuenta cifrada que no se pudo descifrar".
  // Son estados distintos y colapsarlos pierde datos — un formulario en blanco
  // que se guarda escribe null encima del ciphertext, irreversible.
  datos_pago:
    | (Pick<DatosPagoRow, 'edp_banco_id' | 'edp_tipo_cuenta' | 'edp_numero_cuenta'> & {
        banco_nombre: string | null
        cuenta_ilegible: boolean
      })
    | null
  // null solo para empleados creados antes de que el formulario capturara
  // dirección; una vez que emp_direccion_id sea NOT NULL, siempre viene.
  // Provincia y cantón llegan resueltos por el join, no se guardan en la fila.
  direccion:
    | (Pick<DireccionRow, 'dir_distrito_id' | 'dir_codigo_postal' | 'dir_senas_exactas'> & {
        distrito_nombre: string
        canton_nombre: string
        provincia_nombre: string
      })
    | null
}

// ─── Schema de metadata de documento (SGRH-67, fase 2B) ──────────────────────
// Solo la metadata que captura el usuario: doc_path/doc_mime/doc_creado_por
// los completa el servidor (provienen del archivo subido y del JWT, nunca
// del cliente).

export const documentoMetadataSchema = z.object({
  doc_nombre: z
    .string({ error: 'El nombre del documento es obligatorio' })
    .trim()
    .min(2, 'El nombre debe tener al menos 2 caracteres')
    .max(150, 'Máximo 150 caracteres'),

  doc_tipo_id: z
    .number({ error: 'El tipo de documento es obligatorio' })
    .int()
    .positive('Seleccione un tipo de documento válido'),

  doc_descripcion: emptyToNull(z.string().max(300, 'Máximo 300 caracteres').nullable().optional()),

  doc_fecha_vencimiento: emptyToNull(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
      .nullable()
      .optional()
  ),
}) satisfies z.ZodType<
  Omit<
    DocumentoInsert,
    | 'doc_id'
    | 'doc_empresa_id'
    | 'doc_empleado_id'
    | 'doc_path'
    | 'doc_mime'
    | 'doc_creado_por'
    | 'doc_created_at'
  >
>

export type DocumentoMetadataInput = z.infer<typeof documentoMetadataSchema>

// ─── View Model — Documento de empleado ──────────────────────────────────────
// DTO de la lista de documentos del expediente. Nunca expone doc_path: la
// descarga se pide por doc_id y el servidor firma la URL al vuelo.

export type DocumentoEmpleado = Pick<
  DocumentoRow,
  | 'doc_id'
  | 'doc_empleado_id'
  | 'doc_tipo_id'
  | 'doc_nombre'
  | 'doc_descripcion'
  | 'doc_fecha_vencimiento'
  | 'doc_mime'
  | 'doc_created_at'
> & {
  tipo_nombre: string
}

// ─── Documento pendiente del wizard (solo cliente) ───────────────────────────
// Antes de crear el empleado no hay doc_empleado_id: el archivo y su metadata
// viven en memoria (fuera de react-hook-form, igual que la foto) y se suben
// recién en el onSubmit, con el empId que devuelve createEmployee.

export interface DocumentoPendiente {
  key: string
  file: File
  metadata: DocumentoMetadataInput
}
