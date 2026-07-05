import { z } from 'zod'

/**
 * Esquema de validacion del formulario de login.
 * Unica fuente de verdad: el tipo del formulario se infiere de aqui.
 */
export const loginSchema = z.object({
  email: z
    .string('El correo electronico es requerido.')
    .trim()
    .toLowerCase()
    .pipe(z.email('Ingrese un correo electronico valido.')),
  password: z.string('La contrasena es requerida.').min(1, 'Ingrese su contrasena.'),
})

export type LoginInput = z.infer<typeof loginSchema>
