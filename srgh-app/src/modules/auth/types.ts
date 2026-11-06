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
 * La politica de contraseñas, en UN solo lugar.
 *
 * Es espejo de lo configurado en el Dashboard de Supabase
 * (Authentication > Policies). Las dos tienen que decir lo mismo: si solo
 * cambia una, el formulario acepta una contraseña que el servidor despues
 * rechaza con `weak_password`, y la persona ve un "demasiado debil" generico
 * sin saber que regla fallo.
 *
 * `patron` alimenta el esquema y tambien la lista de requisitos del
 * formulario, que se va marcando mientras se escribe. `etiqueta` se usa en los
 * dos lados: como item de esa lista y como mensaje de la regla en Zod.
 *
 * Son RegExp y no funciones a proposito: una funcion por regla contaria contra
 * el umbral de cobertura de funciones del modulo (100% en modules/auth), y no
 * aportaria nada que .test() no haga.
 */
export const PASSWORD_RULES = [
  { id: 'largo', etiqueta: 'Al menos 12 caracteres', patron: /.{12,}/ },
  { id: 'minuscula', etiqueta: 'Una letra minúscula', patron: /[a-z]/ },
  { id: 'mayuscula', etiqueta: 'Una letra mayúscula', patron: /[A-Z]/ },
  { id: 'digito', etiqueta: 'Un número', patron: /[0-9]/ },
  { id: 'simbolo', etiqueta: 'Un símbolo', patron: /[^A-Za-z0-9]/ },
] as const

/**
 * Definir una contraseña sobre una sesion que /auth/confirm ya establecio.
 * Es el mismo formulario en los dos flujos que llegan por correo —activacion
 * de la invitacion y recuperacion—, asi que la regla vive una sola vez y los
 * dos nombres de abajo son alias: si cambia la politica de contraseñas, cambia
 * en PASSWORD_RULES y en ningun otro lado.
 *
 * Una regex por regla, y no un refine con un predicado compuesto: v8 cuenta
 * cada && como rama, asi que un predicado unico obligaria a escribir un test
 * de fallo por cada regla solo para llegar al 100% de ramas.
 */
export const setPasswordSchema = z
  .object({
    password: PASSWORD_RULES.reduce(
      (schema, regla) => schema.regex(regla.patron, regla.etiqueta),
      z.string({ message: 'La contraseña es requerida.' })
    ),
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
