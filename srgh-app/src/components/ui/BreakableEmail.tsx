/**
 * Email que envuelve en sus puntos naturales, no a mitad de palabra.
 *
 * Un correo no tiene espacios, asi que `break-words` (o `break-all`) lo
 * corta donde le alcanza el ancho — el ojo lee "jordyestrada282@gmail.co"
 * en una linea y "m" solo en la siguiente. Insertar `<wbr>` despues del
 * `@` y de cada `.` le da al navegador puntos de quiebre preferidos, y
 * el correo sigue siendo texto seleccionable y copiable, no una imagen
 * ni un string con saltos de linea forzados.
 */
export function BreakableEmail({ email, className }: { email: string; className?: string }) {
  const partes = email.split(/([@.])/)

  return (
    <span className={className}>
      {partes.map((parte, i) => (
        <span key={i}>
          {parte}
          {(parte === '@' || parte === '.') && <wbr />}
        </span>
      ))}
    </span>
  )
}
