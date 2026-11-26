# Estados del día (contrato de vista)

SGRH-120. Cómo se ve y qué se puede hacer con cada persona en el **Diario**. La regla que decide el estado es `attendanceStatusOf` (`lib/dayStatus.ts`); la usan el Diario y la tarjeta «Asistencia de hoy» del dashboard. Ninguna pantalla calcula el estado por su cuenta: `getDailyAttendance` ya lo entrega en `row.status` (`kind`, `tardiness`, `needsAttention`).

## Cuándo se mira el día

| Día que se mira | `DayClock`                   | Efecto                                                |
| --------------- | ---------------------------- | ----------------------------------------------------- |
| Hoy             | `{ when: 'today', nowTime }` | Quien no marcó está «Por llegar» hasta su tolerancia  |
| Un día pasado   | `{ when: 'past' }`           | Quien no marcó faltó; quien no marcó salida la olvidó |
| Un día futuro   | `{ when: 'future' }`         | Nadie falta todavía                                   |

`nowTime` es la hora de Costa Rica en `"HH:mm"` (`timeOfDay(nowInCostaRica())`).

## Estados

El texto y el ícono van **siempre** junto al color: el estado no puede depender solo del color, porque el rojo también es el de la marca y el de los botones principales.

| `kind`             | Etiqueta        | Ícono (lucide)  | Tono del `Badge` | ¿Requiere atención?            | Acción principal      |
| ------------------ | --------------- | --------------- | ---------------- | ------------------------------ | --------------------- |
| `sin_marcar`       | Sin marcar      | `CircleX`       | `rose`           | Sí                             | Agregar entrada       |
| `sin_salida`       | Sin salida      | `LogOut`        | `orange`         | Sí                             | Agregar salida        |
| `en_jornada`       | En jornada      | `LogIn`         | `emerald`        | Solo con tardía sin justificar | Agregar salida        |
| `ya_salio`         | Ya salió        | `CircleCheck`   | `slate`          | Solo con tardía sin justificar | — (corregir al abrir) |
| `por_llegar`       | Por llegar      | `Hourglass`     | `slate`          | No                             | Agregar entrada       |
| `justificada`      | Justificada     | `FileCheck`     | `blue`           | No                             | —                     |
| `libre`            | Libre / Feriado | `CalendarOff`   | `slate`          | No                             | —                     |
| `sin_programacion` | Sin horario     | `CalendarMinus` | `slate`          | No                             | —                     |

**Tardía.** Si `tardiness` viene con datos, al lado del estado va una segunda pastilla con el tipo del catálogo y los minutos («Tardía leve · +12 min»), con el color del tipo, como ya la pinta `tardinessChipStyle`. Una tardía justificada se ve atenuada y no cuenta como «requiere atención».

## Orden de la lista

1. Requieren atención (`needsAttention`): `sin_marcar`, `sin_salida`, y quienes tienen una tardía sin justificar.
2. En jornada y Por llegar.
3. Ya salió, Justificada.
4. Libre y Sin horario, al final.

Dentro de cada grupo, por hora esperada y después por nombre.

## Celular (menos de `md`)

- Cada persona es **una fila compacta**: `Avatar`, nombre, puesto en gris, el `Badge` de estado y la última marca («Entró 8:02 a. m.»).
- A la derecha, **un botón de 44 px** con la acción principal del estado (tabla de arriba). Abre el `ManualMarkModal` que ya existe, con el tipo y la hora sugerida.
- **Tocar la fila** abre el detalle: las 6 horas y el 2.º bloque, con los mismos botones de corregir y agregar que hoy. La fila lleva `aria-expanded` y el foco se ve.
- Una persona sin novedades ocupa una línea. Con 9 personas, la primera pantalla de un teléfono de 375 px muestra a casi todas.

## Escritorio (`md` en adelante)

- La tabla de 6 columnas se queda: corregir una marca sigue siendo **un toque** en la celda.
- Se agrega la columna **Estado** con el mismo `Badge`, que reemplaza la columna «Estado» actual.
- La subfila del 2.º bloque no cambia.

## Palabras

Las mismas que el dashboard. «Jornada partida» y «tramo» no se muestran al usuario; el segundo bloque se llama «2.º bloque» y el texto de ayuda dice el horario («6:00 p. m. – 11:00 p. m.»).
