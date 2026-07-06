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
