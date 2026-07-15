'use client'

import type { ReactNode } from 'react'
import { useController, useFormContext, type FieldErrors } from 'react-hook-form'
import type { CatalogoItem } from '@/modules/employees/types'
import { GENERO_LABELS, TIPO_CUENTA_LABELS } from '@/modules/employees/lib/format'
import { formatIbanGroups, IBAN_CR_LENGTH, normalizeIban } from '@/modules/employees/lib/iban'

export const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

export const LABEL_CLASSES =
  'mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500'

/**
 * Grupos de campos compartidos entre el wizard de alta (paths `empleado.*`)
 * y el formulario de edición (paths planos). `basePath` resuelve el prefijo;
 * el cast de tipos queda contenido en este archivo.
 */
interface FieldGroupProps {
  basePath?: string
}

/** Busca el mensaje de error siguiendo un path anidado ('empleado.emp_nombre'). */
export function getFieldError(errors: FieldErrors, path: string): string | undefined {
  let current: unknown = errors
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return (current as { message?: string } | undefined)?.message
}

interface LabeledProps {
  label: string
  error?: string
  children: ReactNode
}

export function Labeled({ label, error, children }: LabeledProps) {
  return (
    <div>
      {/* El error vive fuera del <label> para no contaminar el nombre accesible. */}
      <label className="block">
        <span className={LABEL_CLASSES}>{label}</span>
        {children}
      </label>
      {error && (
        <p role="alert" className="mt-1 text-[11px] font-medium text-rose-600">
          {error}
        </p>
      )}
    </div>
  )
}

// Formato de miles según la misma locale de formatCRC (es-CR), sin símbolo de
// moneda: el ₡ ya va en la etiqueta del campo.
const MILES_FORMAT = new Intl.NumberFormat('es-CR', { maximumFractionDigits: 0 })

interface MaskedInputProps {
  name: string
  invalid?: boolean
}

/**
 * Monto en colones: guarda un number en el form y muestra separadores de
 * miles mientras se digita ('500000' → '500 000'). El vacío emite NaN para
 * replicar valueAsNumber y disparar el mensaje de "obligatorio" del schema.
 */
export function CurrencyInput({ name, invalid }: MaskedInputProps) {
  const { control } = useFormContext()
  // Se desestructura de una vez: `field` contiene una propiedad `ref` y la
  // regla react-hooks/refs lo confunde con un ref de React (falso positivo).
  const {
    field: { value, onChange, onBlur, name: inputName, ref },
  } = useController({ name, control })

  const display =
    typeof value === 'number' && !Number.isNaN(value) ? MILES_FORMAT.format(value) : ''

  return (
    <input
      type="text"
      inputMode="numeric"
      value={display}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '')
        onChange(digits === '' ? NaN : Number(digits))
      }}
      onBlur={onBlur}
      name={inputName}
      ref={ref}
      placeholder="0"
      aria-invalid={invalid}
      className={INPUT_CLASSES}
    />
  )
}

interface IbanInputProps extends MaskedInputProps {
  disabled?: boolean
  /** 'iban' antepone CR automáticamente; 'sinpe' acepta solo el teléfono de 8 dígitos. */
  mode?: 'iban' | 'sinpe'
}

/**
 * Número de cuenta: en el form vive normalizado (mayúsculas, sin espacios,
 * máx. 22 caracteres) y en pantalla se muestra agrupado de 4 en 4 para poder
 * leerlo/llenarlo sin perderse. En modo IBAN el prefijo CR se antepone solo:
 * el usuario digita únicamente los dígitos (pegar un IBAN completo también
 * funciona). Queda deshabilitado hasta que se elija el banco.
 */
export function IbanInput({ name, invalid, disabled, mode = 'iban' }: IbanInputProps) {
  const { control } = useFormContext()
  const {
    field: { value, onChange, onBlur, name: inputName, ref },
  } = useController({ name, control })

  const raw = typeof value === 'string' ? value : ''

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const normalized = normalizeIban(event.target.value)

    if (mode === 'sinpe') {
      onChange(normalized.replace(/\D/g, '').slice(0, 8))
      return
    }

    // Digitar solo números antepone CR; borrar hasta dejar solo el prefijo
    // vacía el campo (para que el opcional vuelva a ser null).
    const withPrefix = normalized.startsWith('CR')
      ? normalized
      : `CR${normalized.replace(/\D/g, '')}`
    const capped = withPrefix.slice(0, IBAN_CR_LENGTH)
    onChange(capped === 'CR' ? '' : capped)
  }

  const placeholder = disabled
    ? 'Selecciona el banco primero'
    : mode === 'sinpe'
      ? '0000 0000'
      : 'CR00 0000 0000 0000 0000 00'

  return (
    <input
      type="text"
      inputMode={mode === 'sinpe' ? 'numeric' : 'text'}
      autoComplete="off"
      spellCheck={false}
      disabled={disabled}
      value={formatIbanGroups(raw)}
      onChange={handleChange}
      onBlur={onBlur}
      name={inputName}
      ref={ref}
      placeholder={placeholder}
      aria-invalid={invalid}
      className={INPUT_CLASSES}
    />
  )
}

interface PersonalDataFieldsProps extends FieldGroupProps {
  tiposIdentificacion: CatalogoItem[]
}

export function PersonalDataFields({
  basePath = '',
  tiposIdentificacion,
}: PersonalDataFieldsProps) {
  const {
    register,
    formState: { errors },
  } = useFormContext()

  const err = (name: string) => getFieldError(errors, basePath + name)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Labeled label="Nombre *" error={err('emp_nombre')}>
        <input
          type="text"
          {...register(`${basePath}emp_nombre`)}
          aria-invalid={Boolean(err('emp_nombre'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Primer apellido *" error={err('emp_apellido_1')}>
        <input
          type="text"
          {...register(`${basePath}emp_apellido_1`)}
          aria-invalid={Boolean(err('emp_apellido_1'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Segundo apellido" error={err('emp_apellido_2')}>
        <input
          type="text"
          {...register(`${basePath}emp_apellido_2`)}
          aria-invalid={Boolean(err('emp_apellido_2'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Tipo de identificación *" error={err('emp_tipo_identificacion_id')}>
        <select
          {...register(`${basePath}emp_tipo_identificacion_id`, { valueAsNumber: true })}
          aria-invalid={Boolean(err('emp_tipo_identificacion_id'))}
          className={INPUT_CLASSES}
        >
          <option value="">Seleccionar…</option>
          {tiposIdentificacion.map((tipo) => (
            <option key={tipo.id} value={tipo.id}>
              {tipo.nombre}
            </option>
          ))}
        </select>
      </Labeled>

      <Labeled label="Número de identificación *" error={err('emp_numero_identificacion')}>
        <input
          type="text"
          {...register(`${basePath}emp_numero_identificacion`)}
          aria-invalid={Boolean(err('emp_numero_identificacion'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Fecha de ingreso *" error={err('emp_fecha_ingreso_original')}>
        <input
          type="date"
          {...register(`${basePath}emp_fecha_ingreso_original`)}
          aria-invalid={Boolean(err('emp_fecha_ingreso_original'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Fecha de nacimiento" error={err('emp_fecha_nacimiento')}>
        <input
          type="date"
          {...register(`${basePath}emp_fecha_nacimiento`)}
          aria-invalid={Boolean(err('emp_fecha_nacimiento'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Género" error={err('emp_genero')}>
        <select
          {...register(`${basePath}emp_genero`)}
          aria-invalid={Boolean(err('emp_genero'))}
          className={INPUT_CLASSES}
        >
          <option value="">Sin especificar</option>
          {Object.entries(GENERO_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>

      <Labeled label="Nacionalidad" error={err('emp_nacionalidad')}>
        <input
          type="text"
          {...register(`${basePath}emp_nacionalidad`)}
          aria-invalid={Boolean(err('emp_nacionalidad'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Teléfono" error={err('emp_telefono')}>
        <input
          type="tel"
          {...register(`${basePath}emp_telefono`)}
          aria-invalid={Boolean(err('emp_telefono'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Email personal" error={err('emp_email_personal')}>
        <input
          type="email"
          {...register(`${basePath}emp_email_personal`)}
          aria-invalid={Boolean(err('emp_email_personal'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Nº asegurado CCSS" error={err('emp_numero_asegurado_ccss')}>
        <input
          type="text"
          {...register(`${basePath}emp_numero_asegurado_ccss`)}
          aria-invalid={Boolean(err('emp_numero_asegurado_ccss'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Contacto de emergencia" error={err('emp_nombre_contacto_emergencia')}>
        <input
          type="text"
          {...register(`${basePath}emp_nombre_contacto_emergencia`)}
          aria-invalid={Boolean(err('emp_nombre_contacto_emergencia'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Teléfono de emergencia" error={err('emp_telefono_emergencia')}>
        <input
          type="tel"
          {...register(`${basePath}emp_telefono_emergencia`)}
          aria-invalid={Boolean(err('emp_telefono_emergencia'))}
          className={INPUT_CLASSES}
        />
      </Labeled>
    </div>
  )
}

interface BankingFieldsProps extends FieldGroupProps {
  bancos: CatalogoItem[]
}

/**
 * Datos de pago (tabla sgrh_empleado_datos_pago). El basePath típico es
 * 'datos_pago.'; el nº de asegurado CCSS NO va aquí — es un identificador de
 * la persona y vive en la ficha (PersonalDataFields).
 */
export function BankingFields({ basePath = '', bancos }: BankingFieldsProps) {
  const {
    register,
    watch,
    formState: { errors },
  } = useFormContext()

  const err = (name: string) => getFieldError(errors, basePath + name)

  // El número de cuenta depende del banco (define la entidad del IBAN) y del
  // tipo (SINPE usa teléfono): sin banco elegido el campo queda deshabilitado.
  const bancoId = watch(`${basePath}edp_banco_id`) as number | null | undefined
  const tipoCuenta = watch(`${basePath}edp_tipo_cuenta`) as string | null | undefined
  const hasBanco = typeof bancoId === 'number' && !Number.isNaN(bancoId)

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Labeled label="Banco" error={err('edp_banco_id')}>
        <select
          {...register(`${basePath}edp_banco_id`, { valueAsNumber: true })}
          aria-invalid={Boolean(err('edp_banco_id'))}
          className={INPUT_CLASSES}
        >
          <option value="">Sin especificar</option>
          {bancos.map((banco) => (
            <option key={banco.id} value={banco.id}>
              {banco.nombre}
            </option>
          ))}
        </select>
      </Labeled>

      <Labeled label="Tipo de cuenta" error={err('edp_tipo_cuenta')}>
        <select
          {...register(`${basePath}edp_tipo_cuenta`)}
          aria-invalid={Boolean(err('edp_tipo_cuenta'))}
          className={INPUT_CLASSES}
        >
          <option value="">Sin especificar</option>
          {Object.entries(TIPO_CUENTA_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Labeled>

      <Labeled label="Número de cuenta (IBAN / SINPE)" error={err('edp_numero_cuenta')}>
        <IbanInput
          name={`${basePath}edp_numero_cuenta`}
          invalid={Boolean(err('edp_numero_cuenta'))}
          disabled={!hasBanco}
          mode={tipoCuenta === 'SINPE' ? 'sinpe' : 'iban'}
        />
      </Labeled>
    </div>
  )
}
