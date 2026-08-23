import { z } from 'zod'

/**
 * Esquema de validacion del formulario de login.
 * Unica fuente de verdad: el tipo del formulario se infiere de aqui.
 */
export const loginSchema = z.object({
  email: z
    .string({ message: 'El correo electrónico es requerido.' })
    .trim()
    .toLowerCase()
    .min(1, 'El correo electrónico es requerido.')
    .email('Ingrese un correo electrónico válido.'),
  password: z.string({ message: 'La contraseña es requerida.' }).min(1, 'Ingrese su contraseña.'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * Definir una contraseña sobre una sesion que /auth/confirm ya establecio.
 * Es el mismo formulario en los dos flujos que llegan por correo —activacion
 * de la invitacion y recuperacion—, asi que la regla vive una sola vez y los
 * dos nombres de abajo son alias: si cambia la politica de contraseñas, cambia
 * aqui y en ningun otro lado.
 */
export const setPasswordSchema = z
  .object({
    password: z
      .string({ message: 'La contraseña es requerida.' })
      .min(8, 'La contraseña debe tener al menos 8 caracteres.'),
    confirmPassword: z
      .string({ message: 'Confirme su contraseña.' })
      .min(1, 'Confirme su contraseña.'),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Las contraseñas no coinciden.',
  })

export type SetPasswordInput = z.infer<typeof setPasswordSchema>

/** Activacion de cuenta: primer acceso tras la invitacion. */
export const activateAccountSchema = setPasswordSchema

export type ActivateAccountInput = SetPasswordInput

/**
 * Esquema del formulario "olvide mi contraseña": solo el correo al que se
 * envia el enlace de recuperacion. Misma normalizacion que el login (trim +
 * minusculas) para que el mismo usuario escrito de dos formas sea uno solo.
 */
export const forgotPasswordSchema = z.object({
  email: z
    .string({ message: 'El correo electrónico es requerido.' })
    .trim()
    .toLowerCase()
    .min(1, 'El correo electrónico es requerido.')
    .email('Ingrese un correo electrónico válido.'),
})

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

/** Restablecer la contraseña tras el enlace de recuperacion. */
export const resetPasswordSchema = setPasswordSchema

export type ResetPasswordInput = SetPasswordInput
