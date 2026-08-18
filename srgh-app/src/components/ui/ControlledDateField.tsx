'use client'

import { useController, type Control, type FieldValues, type Path } from 'react-hook-form'
import { DateField } from '@/components/ui/DatePickerButton'

interface ControlledDateFieldProps<T extends FieldValues> {
  control: Control<T>
  name: Path<T>
  /** Nombre accesible; tambien el placeholder cuando no hay fecha. */
  label: string
  id?: string
  invalid?: boolean
  disabled?: boolean
  todayISO?: string
  minISO?: string
  maxISO?: string
}

/**
 * Puente entre React Hook Form y `DateField`.
 *
 * `register()` no sirve con el calendario propio porque el control no es un
 * `<input>` nativo: no hay evento `change` del DOM que RHF pueda escuchar. Este
 * componente lo cablea por `useController`.
 *
 * El valor sigue siendo la cadena "YYYY-MM-DD", exactamente igual que con
 * `type="date"` — los schemas de Zod, los Server Actions y lo que se guarda en
 * la base no cambian en nada.
 *
 * Toma el `control` por prop en vez de `useFormContext()`: la mayoria de los
 * formularios del proyecto llaman a `useForm` local y no montan `FormProvider`.
 * (En employees existe `DateInput`, que si depende del contexto — ver
 * EmployeeFields.tsx.)
 */
export function ControlledDateField<T extends FieldValues>({
  control,
  name,
  label,
  id,
  invalid,
  disabled,
  todayISO,
  minISO,
  maxISO,
}: ControlledDateFieldProps<T>) {
  const {
    field: { value, onChange },
  } = useController({ name, control })

  return (
    <DateField
      value={typeof value === 'string' ? value : ''}
      onChange={onChange}
      label={label}
      id={id}
      invalid={invalid}
      disabled={disabled}
      todayISO={todayISO}
      minISO={minISO}
      maxISO={maxISO}
    />
  )
}
