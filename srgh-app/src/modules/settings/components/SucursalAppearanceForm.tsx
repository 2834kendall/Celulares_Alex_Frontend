'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { CARD, LABEL, SPINNER } from '@/components/ui/styles'
import { updateSucursalApariencia } from '@/modules/settings/actions/updateSucursalApariencia'
import { setSucursalPreview } from '@/modules/settings/actions/setSucursalPreview'
import { suggestAccent } from '@/lib/utils/color'
import { previewShellColors } from '@/modules/settings/lib/previewShell'

const HEX_RE = /^#[0-9a-f]{6}$/i

// Coinciden con los defaults declarados en globals.css — son el punto de
// partida del picker cuando la sucursal todavia no personalizo nada, y a
// donde vuelve "Restablecer".
const DEFAULT_ACCENT = '#0891b2'
const DEFAULT_SIDEBAR = '#eef1f4'

const ACCENT_PRESETS = ['#0891b2', '#1e40af', '#166534', '#9f1239', '#5b21b6', '#334155']
const SIDEBAR_PRESETS = ['#eef1f4', '#42454a', '#1b2a41', '#f1efe8', '#15181d', '#ececef']

interface SucursalAppearanceFormProps {
  sucursalNombre: string
  colorAcentoActual: string | null
  colorSidebarActual: string | null
  /**
   * Solo la pasan ADMIN/RRHH sin sucursal fija, que eligieron esta sucursal
   * en el selector de `SucursalAppearancePanel`. Un usuario con sucursal
   * fija no la necesita: el server action siempre usa la propia.
   */
  sucursalId?: number
  /**
   * Tema OFICIAL que el shell pinta fuera de esta pantalla — sucursal fija
   * propia, o la que este en preview desde el selector de la barra
   * superior. Se usa SOLO para restaurar el shell al salir de este
   * formulario (cambiar de tarjeta o de pagina): sin esto, el color de
   * PRUEBA de la ultima sucursal editada se quedaba pegado, ignorando lo
   * que decia el selector de arriba.
   */
  officialColorAcento: string | null
  officialColorSidebar: string | null
}

export function SucursalAppearanceForm({
  sucursalNombre,
  colorAcentoActual,
  colorSidebarActual,
  sucursalId,
  officialColorAcento,
  officialColorSidebar,
}: SucursalAppearanceFormProps) {
  const router = useRouter()
  const [colorAcento, setColorAcento] = useState(colorAcentoActual ?? DEFAULT_ACCENT)
  const [colorSidebar, setColorSidebar] = useState(colorSidebarActual ?? DEFAULT_SIDEBAR)
  const [saving, setSaving] = useState(false)

  const acentoValido = HEX_RE.test(colorAcento)
  const sidebarValido = HEX_RE.test(colorSidebar)

  // Se recalcula cada vez que cambia la barra: el acento sugerido siempre
  // contrasta contra el fondo ACTUAL, aunque el usuario todavia no haya
  // guardado nada.
  const sugerencia = useMemo(
    () => (sidebarValido ? suggestAccent(colorSidebar) : null),
    [colorSidebar, sidebarValido]
  )
  const sugerenciaAplicada =
    sugerencia !== null && sugerencia.toLowerCase() === colorAcento.toLowerCase()

  /*
   * Tema oficial VIGENTE, en una ref.
   *
   * La limpieza del efecto de abajo corre al desmontar, o sea despues de
   * haber guardado; si leyera `officialColor*` directo, leeria el valor
   * capturado en el PRIMER render (el efecto tiene deps vacias a proposito
   * para correr solo al montar/desmontar). Eso es lo que hacia que al
   * guardar y navegar a Inicio se repintara con los colores ANTERIORES:
   * en pantalla el guardado se veia bien, pero al salir la limpieza
   * clavaba encima la foto vieja. Volviendo a Configuracion el formulario
   * montaba de nuevo y capturaba los colores frescos, y recien ahi la
   * navegacion se comportaba — de ahi el sintoma de "la segunda vez si
   * funciona".
   *
   * La ref se actualiza en cada render, asi que la limpieza siempre lee lo
   * ultimo que llego por props.
   */
  const temaOficial = useRef({ acento: officialColorAcento, sidebar: officialColorSidebar })

  // La ref se escribe en la fase de COMMIT, no durante el render: escribirla
  // en el cuerpo del componente rompe con renderizado concurrente (React puede
  // renderizar sin llegar a montar). Sin arreglo de dependencias a proposito —
  // tiene que correr despues de CADA render para quedar siempre al dia.
  useEffect(() => {
    temaOficial.current = { acento: officialColorAcento, sidebar: officialColorSidebar }
  })

  // El panel remonta este formulario (key={sucursal.id}) cada vez que se
  // elige otra tarjeta — este efecto corre en CADA montaje, o sea en cada
  // cambio de sucursal, y repinta el shell real con los colores YA
  // GUARDADOS de la sucursal recien elegida. Sin esto, cambiar de tarjeta
  // sin haber guardado dejaba el shell pintado con el color de PRUEBA de la
  // sucursal anterior: la tarjeta activa cambiaba pero el marco no, y eso es
  // lo que se veia como "el cambio de color no distingue la sucursal".
  useEffect(() => {
    previewShellColors(colorAcentoActual ?? DEFAULT_ACCENT, colorSidebarActual ?? DEFAULT_SIDEBAR)

    // Limpieza: al desmontar (se elige otra tarjeta, o se sale de esta
    // pagina) se restaura el tema OFICIAL — la sucursal fija propia, o la
    // que este en preview desde el selector de arriba. Es lo que faltaba: el
    // color de prueba nunca se devolvia a lo que decia ese selector, se
    // quedaba pegado al de la ultima sucursal editada.
    return () => {
      // Desde la ref, NUNCA desde las props: ver el comentario de arriba.
      previewShellColors(
        temaOficial.current.acento ?? DEFAULT_ACCENT,
        temaOficial.current.sidebar ?? DEFAULT_SIDEBAR
      )
    }
    // Solo al montar/desmontar: colorAcentoActual/colorSidebarActual son la
    // foto fija de ESTA sucursal y officialColor* la del tema oficial de la
    // carga de pagina — una key nueva ya dispara un montaje nuevo por cuenta
    // propia si cualquiera cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // El guardado NO desmonta este formulario (misma sucursal seleccionada,
  // mismo key) — asi que la limpieza del efecto de arriba nunca corria al
  // guardar, y el color recien tecleado se quedaba pegado en el shell aunque
  // el selector de arriba estuviera viendo OTRA sucursal. Este efecto cierra
  // ese hueco: cuando `router.refresh()` (dentro de `guardar`) trae un tema
  // oficial actualizado por props, se repinta el shell con ese valor fresco.
  // Se salta la primera corrida (el montaje) para no pisar el efecto de
  // arriba, que ya pinta lo correcto en ese momento.
  const primerRender = useRef(true)
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false
      return
    }
    previewShellColors(
      officialColorAcento ?? DEFAULT_ACCENT,
      officialColorSidebar ?? DEFAULT_SIDEBAR
    )
  }, [officialColorAcento, officialColorSidebar])

  function cambiarAcento(valor: string) {
    setColorAcento(valor)
    if (HEX_RE.test(valor) && sidebarValido) previewShellColors(valor, colorSidebar)
  }

  function cambiarSidebar(valor: string) {
    setColorSidebar(valor)
    if (acentoValido && HEX_RE.test(valor)) previewShellColors(colorAcento, valor)
  }

  async function guardar(nuevoAcento: string | null, nuevoSidebar: string | null) {
    setSaving(true)
    const result = await updateSucursalApariencia({
      sucursalId,
      colorAcento: nuevoAcento,
      colorSidebar: nuevoSidebar,
    })
    setSaving(false)

    if (!result.ok) {
      toast.error(result.error)
      return
    }

    toast.success('Apariencia actualizada.')

    // Guardar deja la vista puesta en la sucursal recien editada, para que
    // los colores que se acaban de elegir sigan ahi al salir de
    // Configuracion. Antes se repintaba el shell con el tema OFICIAL apenas
    // terminaba el guardado, y como ese tema seguia siendo el de la sucursal
    // propia, el efecto visible era que los colores recien guardados
    // "desaparecian" al navegar a Inicio — el bug que se reportaba como que
    // no se guardaba (si se guardaba: se estaba viendo otra sucursal).
    //
    // Cubre el caso de editar la sucursal que ya venia preseleccionada, sin
    // haber hecho clic en ninguna tarjeta: ahi `elegirSucursal` del panel
    // nunca corrio y la cookie de preview seguiria apuntando a otra.
    // `sucursalId` solo llega desde ese panel (admins de empresa); un usuario
    // con sucursal fija no tiene selector ni preview que mover.
    if (sucursalId) {
      await setSucursalPreview(sucursalId)
    }

    router.refresh()
  }

  function restablecer() {
    setColorAcento(DEFAULT_ACCENT)
    setColorSidebar(DEFAULT_SIDEBAR)
    previewShellColors(DEFAULT_ACCENT, DEFAULT_SIDEBAR)
    void guardar(null, null)
  }

  return (
    <div className={`${CARD} max-w-md p-5`}>
      <h2 className="text-sm font-bold text-slate-900">Apariencia — {sucursalNombre}</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Estos colores solo se aplican cuando estás viendo esta sucursal — cada sucursal tiene los
        suyos. Solo tiñen el marco de la app (menú lateral, barra superior) y el fondo de las
        pantallas, no los botones ni enlaces dentro de cada una. Los vas a ver cambiar mientras los
        elegís, antes de guardar.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className={LABEL} htmlFor="color-acento">
            Color de acento
          </label>
          <p className="mb-2 text-[11px] text-slate-500">
            Botón principal, ítem activo del menú, insignia del logo y avatar del usuario.
          </p>
          <div className="flex items-center gap-2.5">
            <input
              type="color"
              aria-label="Elegir color de acento"
              value={acentoValido ? colorAcento : DEFAULT_ACCENT}
              onChange={(event) => cambiarAcento(event.target.value)}
              className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            />
            <input
              id="color-acento"
              type="text"
              value={colorAcento}
              onChange={(event) => cambiarAcento(event.target.value)}
              placeholder={DEFAULT_ACCENT}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {ACCENT_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Usar ${preset}`}
                onClick={() => cambiarAcento(preset)}
                style={{ backgroundColor: preset }}
                className="h-5 w-5 rounded-md border border-black/10"
              />
            ))}
          </div>

          {sugerencia && (
            <button
              type="button"
              onClick={() => cambiarAcento(sugerencia)}
              disabled={sugerenciaAplicada}
              className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-brand-400 hover:text-brand-700 disabled:cursor-default disabled:border-brand-300 disabled:text-brand-700"
            >
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span
                className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10"
                style={{ backgroundColor: sugerencia }}
                aria-hidden="true"
              />
              {sugerenciaAplicada
                ? 'Sugerido para contrastar con tu barra — aplicado'
                : 'Usar sugerido: contrasta con tu barra lateral'}
            </button>
          )}
        </div>

        <div>
          <label className={LABEL} htmlFor="color-sidebar">
            Color de la barra lateral
          </label>
          <p className="mb-2 text-[11px] text-slate-500">
            Fondo del menú de navegación y un tono muy suave para el fondo de las pantallas.
          </p>
          <div className="flex items-center gap-2.5">
            <input
              type="color"
              aria-label="Elegir color de la barra lateral"
              value={sidebarValido ? colorSidebar : DEFAULT_SIDEBAR}
              onChange={(event) => cambiarSidebar(event.target.value)}
              className="h-10 w-14 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
            />
            <input
              id="color-sidebar"
              type="text"
              value={colorSidebar}
              onChange={(event) => cambiarSidebar(event.target.value)}
              placeholder={DEFAULT_SIDEBAR}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-800 outline-none focus:border-brand-600 focus:ring-4 focus:ring-brand-600/10"
            />
          </div>
          <div className="mt-2 flex gap-1.5">
            {SIDEBAR_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Usar ${preset}`}
                onClick={() => cambiarSidebar(preset)}
                style={{ backgroundColor: preset }}
                className="h-5 w-5 rounded-md border border-black/10"
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={restablecer}
          disabled={saving || (colorAcentoActual === null && colorSidebarActual === null)}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-500 outline-none transition hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Restablecer
        </button>

        <Button
          onClick={() => guardar(colorAcento, colorSidebar)}
          disabled={saving || !acentoValido || !sidebarValido}
          size="md"
        >
          {saving && <Loader2 className={SPINNER} />}
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
