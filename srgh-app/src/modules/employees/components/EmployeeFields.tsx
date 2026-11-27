'use client'

import { useState, type ReactNode } from 'react'
import { useController, useFormContext, type FieldErrors } from 'react-hook-form'
import type { CatalogoItem, TerritorioCatalogo } from '@/modules/employees/types'
import {
  formatCurrencyInput,
  GENERO_LABELS,
  parseCurrencyInput,
  TIPO_CUENTA_LABELS,
} from '@/modules/employees/lib/format'
import { formatIbanGroups, IBAN_CR_LENGTH, normalizeIban } from '@/modules/employees/lib/iban'
import { todayInCostaRica } from '@/modules/attendance/lib/time'
import { DateField } from '@/components/ui/DatePickerButton'
import { ControlledSelectMenu, parseNumber, SelectMenu } from '@/components/ui/SelectMenu'

export const INPUT_CLASSES =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition pointer-coarse:min-h-11 focus:border-brand-600 focus:outline-none focus:ring-4 focus:ring-brand-600/10 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 aria-[invalid=true]:border-rose-400 aria-[invalid=true]:focus:ring-rose-400/20'

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

interface CatalogSelectProps {
  name: string
  label: string
  options: CatalogoItem[]
  disabled?: boolean
  placeholder?: string
  /** Campo de búsqueda en la lista abierta, para catálogos largos. */
  searchable?: boolean
  /**
   * Se ejecuta después de propagar el cambio a react-hook-form. Lo usan las
   * cascadas para limpiar los campos que dependen de este (ver AddressFields).
   */
  onAfterChange?: (value: number | null) => void
}

/**
 * Select de catálogo con `valueAsNumber`: el vacío emite NaN, que el schema
 * rechaza con el mensaje de obligatorio. No usar `setValueAs` — react-hook-form
 * también lo aplica al defaultValue y `Number(null) === 0` rompería `.positive()`.
 */
export function CatalogSelect({
  name,
  label,
  options,
  disabled,
  placeholder = 'Seleccionar…',
  searchable,
  onAfterChange,
}: CatalogSelectProps) {
  const {
    control,
    formState: { errors },
  } = useFormContext()
  const error = getFieldError(errors, name)
  // useController (no register): el trigger de SelectMenu no es un <input>
  // nativo, asi que no hay evento `change` del DOM para que register escuche.
  const { field } = useController({ name, control })

  return (
    <Labeled label={label} error={error}>
      <SelectMenu
        searchable={searchable}
        value={
          field.value === null || field.value === undefined || Number.isNaN(field.value)
            ? ''
            : String(field.value)
        }
        onChange={(raw) => {
          field.onChange(raw === '' ? NaN : Number(raw))
          // El hijo se limpia en el onChange y NO en un efecto que observe el
          // valor: un efecto correría también al montar el formulario de
          // edición y borraría lo que el empleado ya tiene guardado.
          onAfterChange?.(raw === '' ? null : Number(raw))
        }}
        disabled={disabled}
        invalid={Boolean(error)}
        placeholder={placeholder}
        options={options.map((option) => ({ value: String(option.id), label: option.nombre }))}
      />
    </Labeled>
  )
}

interface MaskedInputProps {
  name: string
  invalid?: boolean
}

function sanitizeCurrencyDraft(raw: string): string {
  const trimmedStart = raw.replace(/^[\s\u00a0]+/, '')
  const hasLeadingMinus = trimmedStart.startsWith('-')
  const rest = hasLeadingMinus ? trimmedStart.slice(1) : raw
  const allowed = rest.replace(/[^0-9.,\s\u00a0]/g, '')
  return hasLeadingMinus ? `-${allowed}` : allowed
}

/**
 * Fecha del formulario, con el calendario del sistema.
 *
 * Puente entre React Hook Form y `DateField`, que es controlado: `register()`
 * no sirve porque el control no es un `<input>` nativo. El valor sigue siendo
 * "YYYY-MM-DD", igual que con `type="date"`, asi que los schemas de Zod y los
 * Server Actions no cambian.
 */
export function DateInput({
  name,
  label,
  invalid,
  minISO,
  maxISO,
}: {
  name: string
  label: string
  invalid?: boolean
  minISO?: string
  maxISO?: string
}) {
  const { control } = useFormContext()
  const {
    field: { value, onChange },
  } = useController({ name, control })

  return (
    <DateField
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      label={label}
      invalid={invalid}
      minISO={minISO}
      maxISO={maxISO}
    />
  )
}

/**
 * Monto en colones: guarda un `number` en el form (con soporte de decimales y
 * preservando el signo `-` para que el schema lo rechace explícitamente) y
 * formatea miles/decimales al perder el foco. Mientras tiene foco mantiene un
 * borrador de texto para no borrar `.`, `,`, `0` o `-` a mitad de escritura.
 */
export function CurrencyInput({ name, invalid }: MaskedInputProps) {
  const { control } = useFormContext()
  const [isFocused, setIsFocused] = useState(false)
  const [draft, setDraft] = useState('')
  // Se desestructura de una vez: `field` contiene una propiedad `ref` y la
  // regla react-hooks/refs lo confunde con un ref de React (falso positivo).
  const {
    field: { value, onChange, onBlur, name: inputName, ref },
  } = useController({ name, control })

  const hasValidNumber = typeof value === 'number' && !Number.isNaN(value)
  const formatted = hasValidNumber ? formatCurrencyInput(value) : ''
  // Si la persona escribió algo malformado ('12.34.56' o '-') y salió del
  // campo, value es NaN (typeof === 'number'): se conserva el texto visible
  // para que pueda corregirlo en vez de vaciarle el input en silencio.
  const keepInvalidDraft = !hasValidNumber && typeof value === 'number' && draft.trim() !== ''
  const display = isFocused || keepInvalidDraft ? draft : formatted

  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      value={display}
      onFocus={() => {
        setIsFocused(true)
        if (hasValidNumber) {
          setDraft(formatted)
        } else if (typeof value !== 'number') {
          setDraft('')
        }
      }}
      onChange={(event) => {
        const sanitized = sanitizeCurrencyDraft(event.target.value)
        setDraft(sanitized)
        onChange(parseCurrencyInput(sanitized))
      }}
      onBlur={() => {
        setIsFocused(false)
        if (draft.trim() === '') setDraft('')
        onBlur()
      }}
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
    ? 'Seleccioná el banco primero'
    : mode === 'sinpe'
      ? '0000 0000'
      : 'CR00 0000 0000 0000 0000 00'

  return (
    <input
      type="text"
      inputMode={mode === 'sinpe' ? 'numeric' : 'text'}
      // Chromium ignora autoComplete="off" cuando su heurística de pagos ve
      // "numero" + "cuenta"/"cc"; un token explícito distinto de tarjeta evita
      // el globo de "formas de pago" en HTTP y el llenado de tarjetas en HTTPS.
      autoComplete="one-time-code"
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
  /**
   * true en el alta (wizard): fecha de nacimiento y género son obligatorios.
   * En la edición siguen siendo opcionales, porque hay fichas anteriores sin
   * esos datos y exigirlos bloquearía cualquier otro cambio sobre ellas.
   * Tiene que coincidir con el schema: crearEmpleadoSchema los exige y
   * editarEmpleadoSchema no.
   */
  alta?: boolean
}

export function PersonalDataFields({
  basePath = '',
  tiposIdentificacion,
  alta = false,
}: PersonalDataFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext()

  const err = (name: string) => getFieldError(errors, basePath + name)

  return (
    <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-3">
      <Labeled label="Nombre *" error={err('emp_nombre')}>
        <input
          type="text"
          autoComplete="off"
          {...register(`${basePath}emp_nombre`)}
          aria-invalid={Boolean(err('emp_nombre'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Primer apellido *" error={err('emp_apellido_1')}>
        <input
          type="text"
          autoComplete="off"
          {...register(`${basePath}emp_apellido_1`)}
          aria-invalid={Boolean(err('emp_apellido_1'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Segundo apellido" error={err('emp_apellido_2')}>
        <input
          type="text"
          autoComplete="off"
          {...register(`${basePath}emp_apellido_2`)}
          aria-invalid={Boolean(err('emp_apellido_2'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Tipo de identificación *" error={err('emp_tipo_identificacion_id')}>
        <ControlledSelectMenu
          control={control}
          name={`${basePath}emp_tipo_identificacion_id`}
          parse={parseNumber}
          invalid={Boolean(err('emp_tipo_identificacion_id'))}
          options={tiposIdentificacion.map((tipo) => ({
            value: String(tipo.id),
            label: tipo.nombre,
          }))}
        />
      </Labeled>

      <Labeled label="Número de identificación *" error={err('emp_numero_identificacion')}>
        <input
          type="text"
          // Chromium ignora autoComplete="off" si su heurística clasifica
          // "numero" + "ccss" + nombres como tarjeta de crédito.
          autoComplete="one-time-code"
          spellCheck={false}
          {...register(`${basePath}emp_numero_identificacion`)}
          aria-invalid={Boolean(err('emp_numero_identificacion'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      {/* No es la misma fecha que el inicio del contrato, y confundirlas ya
          pasó: esta es la antigüedad de la PERSONA en la empresa y sobrevive
          a los traslados y recontrataciones; la otra arranca UN contrato. */}
      <Labeled label="Ingreso a la empresa *" error={err('emp_fecha_ingreso_original')}>
        <DateInput
          name={`${basePath}emp_fecha_ingreso_original`}
          label="Ingreso a la empresa"
          invalid={Boolean(err('emp_fecha_ingreso_original'))}
        />
      </Labeled>

      <Labeled
        label={alta ? 'Fecha de nacimiento *' : 'Fecha de nacimiento'}
        error={err('emp_fecha_nacimiento')}
      >
        <DateInput
          name={`${basePath}emp_fecha_nacimiento`}
          label="Fecha de nacimiento"
          invalid={Boolean(err('emp_fecha_nacimiento'))}
          maxISO={todayInCostaRica()}
        />
      </Labeled>

      <Labeled label={alta ? 'Género *' : 'Género'} error={err('emp_genero')}>
        <ControlledSelectMenu
          control={control}
          name={`${basePath}emp_genero`}
          invalid={Boolean(err('emp_genero'))}
          placeholder={alta ? 'Seleccionar…' : 'Sin especificar'}
          options={[
            // En el alta no hay "sin especificar": es obligatorio.
            ...(alta ? [] : [{ value: '', label: 'Sin especificar' }]),
            ...Object.entries(GENERO_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
      </Labeled>

      <Labeled label="Nacionalidad" error={err('emp_nacionalidad')}>
        <input
          type="text"
          autoComplete="off"
          {...register(`${basePath}emp_nacionalidad`)}
          aria-invalid={Boolean(err('emp_nacionalidad'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Teléfono" error={err('emp_telefono')}>
        <input
          type="tel"
          autoComplete="off"
          {...register(`${basePath}emp_telefono`)}
          aria-invalid={Boolean(err('emp_telefono'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Email personal" error={err('emp_email_personal')}>
        <input
          type="email"
          autoComplete="off"
          {...register(`${basePath}emp_email_personal`)}
          aria-invalid={Boolean(err('emp_email_personal'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Nº asegurado CCSS" error={err('emp_numero_asegurado_ccss')}>
        <input
          type="text"
          autoComplete="one-time-code"
          spellCheck={false}
          {...register(`${basePath}emp_numero_asegurado_ccss`)}
          aria-invalid={Boolean(err('emp_numero_asegurado_ccss'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Contacto de emergencia" error={err('emp_nombre_contacto_emergencia')}>
        <input
          type="text"
          autoComplete="off"
          {...register(`${basePath}emp_nombre_contacto_emergencia`)}
          aria-invalid={Boolean(err('emp_nombre_contacto_emergencia'))}
          className={INPUT_CLASSES}
        />
      </Labeled>

      <Labeled label="Teléfono de emergencia" error={err('emp_telefono_emergencia')}>
        <input
          type="tel"
          autoComplete="off"
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
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext()

  const err = (name: string) => getFieldError(errors, basePath + name)

  // El número de cuenta depende del banco (define la entidad del IBAN) y del
  // tipo (SINPE usa teléfono): sin banco elegido el campo queda deshabilitado.
  const bancoId = watch(`${basePath}edp_banco_id`) as number | null | undefined
  const tipoCuenta = watch(`${basePath}edp_tipo_cuenta`) as string | null | undefined
  const hasBanco = typeof bancoId === 'number' && !Number.isNaN(bancoId)

  // Un IBAN pertenece a una entidad concreta, y SINPE usa un formato distinto
  // (teléfono de 8 dígitos vs CR + 20). Al cambiar cualquiera de los dos, el
  // número anterior deja de ser válido: se limpia en vez de dejar que el
  // servidor lo rechace después.
  const limpiarCuenta = () => {
    setValue(`${basePath}edp_numero_cuenta`, '', { shouldValidate: false, shouldDirty: true })
  }

  return (
    <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-3">
      {/* Con buscador: el catálogo de bancos de CR es largo y se llega a él
          sabiendo el nombre, no recorriéndolo. */}
      <CatalogSelect
        name={`${basePath}edp_banco_id`}
        label="Banco"
        options={bancos}
        searchable
        placeholder="Sin especificar"
        onAfterChange={limpiarCuenta}
      />

      <Labeled label="Tipo de cuenta" error={err('edp_tipo_cuenta')}>
        <ControlledSelectMenu
          control={control}
          name={`${basePath}edp_tipo_cuenta`}
          invalid={Boolean(err('edp_tipo_cuenta'))}
          placeholder="Sin especificar"
          onValueChange={limpiarCuenta}
          options={[
            { value: '', label: 'Sin especificar' },
            ...Object.entries(TIPO_CUENTA_LABELS).map(([value, label]) => ({ value, label })),
          ]}
        />
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

interface AddressFieldsProps extends FieldGroupProps {
  territorio: TerritorioCatalogo
}

interface LocalSelectProps {
  label: string
  options: CatalogoItem[]
  value: number | null
  onChange: (value: number | null) => void
  disabled?: boolean
  placeholder?: string
  /** Campo de búsqueda en la lista abierta, para catálogos largos. */
  searchable?: boolean
}

/**
 * Select controlado por estado de React, no por react-hook-form. Para valores
 * que la UI necesita pero el formulario no persiste — hoy, provincia y cantón
 * de la cascada de dirección.
 */
function LocalSelect({
  label,
  options,
  value,
  onChange,
  disabled,
  placeholder = 'Seleccionar…',
  searchable,
}: LocalSelectProps) {
  return (
    <Labeled label={label}>
      <SelectMenu
        searchable={searchable}
        value={value === null ? '' : String(value)}
        disabled={disabled}
        onChange={(v) => onChange(v === '' ? null : Number(v))}
        placeholder={placeholder}
        options={options.map((option) => ({ value: String(option.id), label: option.nombre }))}
      />
    </Labeled>
  )
}

/**
 * Remonta la cadena distrito → cantón → provincia. Se usa una sola vez, al
 * montar, para posicionar la cascada en la dirección ya guardada (el formulario
 * solo persiste el distrito).
 */
function ubicacionDelDistrito(territorio: TerritorioCatalogo, distritoId: unknown) {
  if (typeof distritoId !== 'number' || Number.isNaN(distritoId)) {
    return { provinciaId: null, cantonId: null }
  }
  const distrito = territorio.distritos.find((d) => d.id === distritoId)
  const canton = distrito ? territorio.cantones.find((c) => c.id === distrito.cantonId) : undefined
  return { provinciaId: canton?.provinciaId ?? null, cantonId: canton?.id ?? null }
}

/**
 * Dirección (tabla sgrh_direcciones). El basePath típico es 'direccion.'.
 *
 * Solo el distrito se guarda: provincia y cantón viven en estado local porque
 * se derivan por la cadena de FKs. Persistirlos permitiría estados incoherentes
 * (un distrito que no pertenece al cantón elegido).
 */
export function AddressFields({ basePath = '', territorio }: AddressFieldsProps) {
  const {
    register,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext()

  const err = (name: string) => getFieldError(errors, basePath + name)
  const distritoField = `${basePath}dir_distrito_id`

  // Inicialización perezosa: en edición arranca posicionada en la dirección
  // guardada; en el alta, en null.
  const [ubicacion, setUbicacion] = useState(() =>
    ubicacionDelDistrito(territorio, getValues(distritoField))
  )

  const cantonesVisibles = territorio.cantones.filter(
    (c) => c.provinciaId === ubicacion.provinciaId
  )
  const distritosVisibles = territorio.distritos.filter((d) => d.cantonId === ubicacion.cantonId)

  // El código postal no se captura: es el código del distrito y lo recalcula un
  // trigger al guardar. Se muestra para que se vea de dónde sale.
  const distritoId = watch(distritoField) as number | null | undefined
  const codigoPostal = territorio.distritos.find((d) => d.id === distritoId)?.codigoPostal

  // Limpiar el hijo va en el onChange, nunca en un efecto sobre el valor: un
  // efecto correría también al montar la edición y borraría el distrito guardado.
  const limpiarDistrito = () => {
    setValue(distritoField, '' as unknown as number, {
      shouldValidate: false,
      shouldDirty: true,
    })
  }

  return (
    <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2 @2xl:grid-cols-3">
      {/* Provincia y cantón NO se registran en react-hook-form: no se persisten
          y su valor sale del estado local, que ya viene posicionado en edición. */}
      <LocalSelect
        label="Provincia *"
        options={territorio.provincias}
        value={ubicacion.provinciaId}
        onChange={(provinciaId) => {
          setUbicacion({ provinciaId, cantonId: null })
          limpiarDistrito()
        }}
      />

      {/* Cantón (84) y distrito (492) llevan buscador; provincia son 7 y no
          lo necesita. El catálogo ya viaja entero al cliente, así que filtrar
          es en memoria y no agrega ningún round-trip. */}
      <LocalSelect
        label="Cantón *"
        options={cantonesVisibles}
        value={ubicacion.cantonId}
        searchable
        disabled={ubicacion.provinciaId === null}
        placeholder={ubicacion.provinciaId === null ? 'Elegí la provincia primero' : 'Seleccionar…'}
        onChange={(cantonId) => {
          setUbicacion((actual) => ({ ...actual, cantonId }))
          limpiarDistrito()
        }}
      />

      <CatalogSelect
        name={distritoField}
        label="Distrito *"
        options={distritosVisibles}
        searchable
        disabled={ubicacion.cantonId === null}
        placeholder={ubicacion.cantonId === null ? 'Elegí el cantón primero' : 'Seleccionar…'}
      />

      <Labeled label="Código postal">
        <input
          type="text"
          autoComplete="off"
          readOnly
          value={codigoPostal ?? ''}
          placeholder="Se calcula con el distrito"
          className={`${INPUT_CLASSES} bg-slate-50 text-slate-500`}
        />
      </Labeled>

      <div className="sm:col-span-2 lg:col-span-3">
        <Labeled label="Señas exactas *" error={err('dir_senas_exactas')}>
          <textarea
            rows={2}
            autoComplete="off"
            {...register(`${basePath}dir_senas_exactas`)}
            placeholder="Ej. 200 m norte de la iglesia, casa portón verde"
            aria-invalid={Boolean(err('dir_senas_exactas'))}
            className={INPUT_CLASSES}
          />
        </Labeled>
      </div>
    </div>
  )
}
