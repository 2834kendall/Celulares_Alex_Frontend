'use client'

import {
  useForm as useReactHookForm,
  useWatch,
  type FieldValues,
  type UseFormProps,
} from 'react-hook-form'
import { useUnsavedChanges } from './useUnsavedChanges'

/** Explicit opt-in adapter; searches and authentication keep ordinary useForm. */
export function useForm<
  T extends FieldValues = FieldValues,
  C = unknown,
  O extends FieldValues = T,
>(
  props: UseFormProps<T, C, O> & {
    unsavedLabel: string
    unsavedExtra?: unknown
    unsavedHasFiles?: boolean
    unsavedBusy?: boolean
    unsavedEnabled?: boolean
  }
) {
  const { unsavedLabel, unsavedExtra, unsavedHasFiles, unsavedBusy, unsavedEnabled, ...options } =
    props
  const methods = useReactHookForm<T, C, O>(options)
  const values = useWatch({ control: methods.control })
  const guard = useUnsavedChanges({
    label: unsavedLabel,
    value: { values, extra: unsavedExtra },
    hasFiles: unsavedHasFiles,
    dirty: unsavedHasFiles,
    busy: methods.formState.isSubmitting || unsavedBusy,
    enabled: unsavedEnabled,
  })
  const reset: typeof methods.reset = (...args) => {
    methods.reset(...args)
    guard.acceptChanges({ values: methods.getValues(), extra: unsavedExtra })
  }
  return { ...methods, reset, guard }
}
