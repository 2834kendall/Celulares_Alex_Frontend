'use client'

import Link from 'next/link'
import { Briefcase, MapPin, Star } from 'lucide-react'
import type { PostulacionBoardItem } from '@/modules/recruitment/actions/getPostulacionesBoard'
import { formatDate } from '@/modules/employees/lib/format'
import { readableTextOn } from '@/lib/utils/color'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { CARD_HOVER } from '@/components/ui/styles'

interface PostulacionCardProps {
  postulacion: PostulacionBoardItem
}

export function PostulacionCard({ postulacion }: PostulacionCardProps) {
  return (
    <Link
      href={`/recruitment/candidates/${postulacion.candidatoId}`}
      // Foco visible para teclado y un leve "hundido" al tocar: la tarjeta
      // entera es el enlace, así que tiene que sentirse como un botón.
      className={`block min-w-0 p-3 outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 active:scale-[0.99] motion-reduce:active:scale-100 ${CARD_HOVER}`}
    >
      <div className="flex items-start gap-2.5">
        <Avatar nombre={postulacion.candidatoNombre} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900">{postulacion.candidatoNombre}</p>
          <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-600">
            <Briefcase className="h-3 w-3 shrink-0" aria-hidden="true" /> {postulacion.puestoNombre}
          </p>
          {postulacion.sucursalNombre && (
            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-600">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />{' '}
              {postulacion.sucursalNombre}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5 border-t border-slate-100 pt-2">
        {postulacion.etapaNombre ? (
          // Con color propio se usa como fondo y el texto se elige por
          // contraste: el picker acepta colores libres, y con texto oscuro
          // fijo una etapa azul marino quedaba ilegible.
          postulacion.etapaColor ? (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ring-black/10"
              style={{
                backgroundColor: postulacion.etapaColor,
                color: readableTextOn(postulacion.etapaColor),
              }}
            >
              {postulacion.etapaNombre}
            </span>
          ) : (
            <Badge tone="slate" size="xs">
              {postulacion.etapaNombre}
            </Badge>
          )
        ) : (
          <span />
        )}
        {postulacion.puntajePromedio !== null && (
          <Badge tone="amber" size="xs">
            <Star className="h-2.5 w-2.5" aria-hidden="true" /> {postulacion.puntajePromedio}
            <span className="sr-only"> de 10</span>
          </Badge>
        )}
      </div>

      <p className="mt-1.5 text-[10px] text-slate-500">
        Postuló el {formatDate(postulacion.fechaPostula)}
      </p>
    </Link>
  )
}
