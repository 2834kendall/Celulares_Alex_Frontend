'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Briefcase, Pencil } from 'lucide-react'
import type { CatalogoItem, EmpleadoDetalle, TerritorioCatalogo } from '@/modules/employees/types'
import {
  formatCRC,
  formatDate,
  fullName,
  GENERO_LABELS,
  TIPO_CUENTA_LABELS,
} from '@/modules/employees/lib/format'
import { formatIbanGroups } from '@/modules/employees/lib/iban'
import { EmployeeForm } from './EmployeeForm'

interface EmployeeDetailProps {
  empleado: EmpleadoDetalle
  tiposIdentificacion: CatalogoItem[]
  bancos: CatalogoItem[]
  territorio: TerritorioCatalogo
  canWrite: boolean
}

function InfoItem({
  label,
  value,
  wrap = false,
}: {
  label: string
  value: string
  /** Para textos largos (señas exactas): envuelve en vez de recortar. */
  wrap?: boolean
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd
        className={`text-sm text-slate-800 ${wrap ? 'whitespace-pre-line break-words' : 'truncate'}`}
      >
        {value}
      </dd>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <h2 className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-600">{title}</h2>
      {children}
    </section>
  )
}

export function EmployeeDetail({
  empleado,
  tiposIdentificacion,
  bancos,
  territorio,
  canWrite,
}: EmployeeDetailProps) {
  const [editing, setEditing] = useState(false)

  const historial = empleado.historial_activo
  const direccion = empleado.direccion

  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/employees"
            aria-label="Volver al listado"
            className="rounded-full p-1.5 text-slate-500 outline-none transition hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold text-slate-900">{fullName(empleado)}</h1>
            <p className="text-xs text-slate-500">
              {empleado.tipo_identificacion_nombre} · {empleado.emp_numero_identificacion}
            </p>
          </div>
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              historial ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {historial ? 'Activo' : 'Sin contrato vigente'}
          </span>
        </div>
        {canWrite && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm outline-none transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Pencil className="h-3.5 w-3.5" /> Editar
          </button>
        )}
      </div>

      {editing ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <EmployeeForm
            empleado={empleado}
            tiposIdentificacion={tiposIdentificacion}
            bancos={bancos}
            territorio={territorio}
            onSuccess={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <>
          <SectionCard title="Datos personales">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label="Nombre completo" value={fullName(empleado)} />
              <InfoItem
                label="Identificación"
                value={`${empleado.tipo_identificacion_nombre} · ${empleado.emp_numero_identificacion}`}
              />
              <InfoItem
                label="Fecha de nacimiento"
                value={formatDate(empleado.emp_fecha_nacimiento)}
              />
              <InfoItem
                label="Género"
                value={empleado.emp_genero ? (GENERO_LABELS[empleado.emp_genero] ?? '—') : '—'}
              />
              <InfoItem label="Nacionalidad" value={empleado.emp_nacionalidad} />
              <InfoItem
                label="Fecha de ingreso"
                value={formatDate(empleado.emp_fecha_ingreso_original)}
              />
              <InfoItem
                label="Nº asegurado CCSS"
                value={empleado.emp_numero_asegurado_ccss ?? '—'}
              />
            </dl>
          </SectionCard>

          <SectionCard title="Contacto y emergencia">
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Teléfono" value={empleado.emp_telefono ?? '—'} />
              <InfoItem label="Email personal" value={empleado.emp_email_personal ?? '—'} />
              <InfoItem
                label="Contacto de emergencia"
                value={empleado.emp_nombre_contacto_emergencia ?? '—'}
              />
              <InfoItem
                label="Teléfono de emergencia"
                value={empleado.emp_telefono_emergencia ?? '—'}
              />
            </dl>
          </SectionCard>

          <SectionCard title="Dirección">
            {/* direccion llega null solo para empleados creados antes de que el
                formulario capturara dirección. */}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InfoItem label="Provincia" value={direccion?.provincia_nombre ?? '—'} />
              <InfoItem label="Cantón" value={direccion?.canton_nombre ?? '—'} />
              <InfoItem label="Distrito" value={direccion?.distrito_nombre ?? '—'} />
              <InfoItem label="Código postal" value={direccion?.dir_codigo_postal ?? '—'} />
              <div className="sm:col-span-2 lg:col-span-4">
                <InfoItem label="Señas exactas" value={direccion?.dir_senas_exactas ?? '—'} wrap />
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Datos de pago">
            {/* datos_pago llega null si no hay registro o si la RLS lo oculta
                para el rol actual (requiere NOMINA_READ o EMPLEADOS_WRITE). */}
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <InfoItem label="Banco" value={empleado.datos_pago?.banco_nombre ?? '—'} />
              <InfoItem
                label="Tipo de cuenta"
                value={
                  empleado.datos_pago?.edp_tipo_cuenta
                    ? (TIPO_CUENTA_LABELS[empleado.datos_pago.edp_tipo_cuenta] ??
                      empleado.datos_pago.edp_tipo_cuenta)
                    : '—'
                }
              />
              <InfoItem
                label="Número de cuenta"
                value={
                  empleado.datos_pago?.edp_numero_cuenta
                    ? formatIbanGroups(empleado.datos_pago.edp_numero_cuenta)
                    : '—'
                }
              />
            </dl>
          </SectionCard>

          <SectionCard title="Contrato vigente">
            {historial ? (
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <InfoItem label="Puesto" value={historial.puesto_nombre} />
                <InfoItem label="Sucursal" value={historial.sucursal_nombre} />
                <InfoItem label="Tipo de contrato" value={historial.tipo_contrato_nombre} />
                <InfoItem label="Jornada" value={historial.tipo_jornada_nombre} />
                <InfoItem label="Fecha de inicio" value={formatDate(historial.lab_fecha_inicio)} />
                <InfoItem label="Salario base" value={formatCRC(historial.lab_salario_base)} />
                <InfoItem label="Salario real" value={formatCRC(historial.lab_salario_real)} />
              </dl>
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <p>
                  Este empleado no tiene un contrato vigente en la empresa. El historial de
                  contratos se gestionará desde la futura sección de contratación.
                </p>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  )
}
