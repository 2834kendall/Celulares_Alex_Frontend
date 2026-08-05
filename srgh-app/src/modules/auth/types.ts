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
 * Esquema de activacion de cuenta (primer acceso tras la invitacion).
 * La sesion ya existe (la establecio /auth/confirm); aqui solo se define
 * la contraseña.
 */
export const activateAccountSchema = z
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

export type ActivateAccountInput = z.infer<typeof activateAccountSchema>
