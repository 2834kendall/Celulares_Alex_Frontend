'use client'

import { useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { FilePlus2, FileX2, Pencil, Undo2 } from 'lucide-react'
import type {
  ContratoDetalle,
  CrearHistorialLaboralInput,
  EditarContratoInput,
  MotivoSalidaItem,
  TerminarContratoInput,
} from '@/modules/employees/types'
import { createContract } from '@/modules/employees/actions/createContract'
import { updateContract } from '@/modules/employees/actions/updateContract'
import { terminateContract } from '@/modules/employees/actions/terminateContract'
import { revertContractTermination } from '@/modules/employees/actions/revertContractTermination'
import { summarizeContracts } from '@/modules/employees/lib/contracts'
import { formatDate } from '@/modules/employees/lib/format'
import { Button, BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Modal } from '@/components/ui/Modal'
import { cn } from '@/lib/utils/cn'
import { ContractForm } from './ContractForm'
import type { ContractCatalogs } from './ContractFields'
import { TerminateContractForm } from './TerminateContractForm'

interface EmployeeContractActionsProps {
  empId: number
  /** Todos los contratos del empleado, del más reciente al más antiguo. */
  contratos: ContratoDetalle[]
  /** NOMINA_WRITE: puede liquidar un contrato terminado. */
  canLiquidar: boolean
  /** HISTORIAL_WRITE: crear, editar, terminar y revertir. */
  canEditContrato: boolean
  /** Solo llegan con canEditContrato (la página no los pide si no). */
  catalogos?: ContractCatalogs
  motivos?: MotivoSalidaItem[]
}

type Dialogo = 'crear' | 'editar' | 'terminar' | null

/** Enlace a la pantalla de liquidación con el tab y el contrato ya elegidos. */
export function liquidacionHref(labId: number) {
  return `/payroll/aguinaldo-liquidacion?tab=liquidacion&empleado=${labId}`
}

/** Envuelve un botón deshabilitado para que el tooltip se vea igual. */
function ConMotivo({ motivo, children }: { motivo: string; children: React.ReactNode }) {
  return (
    <span title={motivo} className="inline-flex">
      {children}
    </span>
  )
}

/**
 * Botones del tab Contrato (SGRH-90), en la tarjeta del contrato vigente
 * (EmployeeContractSection los recibe por `acciones`). Terminar un contrato tiene dos
 * pasos con dueños distintos: RRHH lo termina acá (HISTORIAL_WRITE) y
 * contabilidad lo liquida en Planilla (NOMINA_WRITE). Entre uno y otro se
 * puede revertir. Las reglas las verifican las RPC; esto solo esconde los
 * botones que no aplican.
 */
export function EmployeeContractActions({
  empId,
  contratos,
  canLiquidar,
  canEditContrato,
  catalogos,
  motivos = [],
}: EmployeeContractActionsProps) {
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [dialogoError, setDialogoError] = useState<string | null>(null)
  const [revertirPendiente, setRevertirPendiente] = useState(false)
  const [revirtiendo, setRevirtiendo] = useState(false)

  const { vigente, ultimo, programada, pendienteDeLiquidar, revertible } =
    summarizeContracts(contratos)

  function abrir(d: Exclude<Dialogo, null>) {
    setDialogoError(null)
    setDialogo(d)
  }

  function cerrarDialogo() {
    setDialogo(null)
    setDialogoError(null)
  }

  async function onCrear(values: CrearHistorialLaboralInput) {
    const result = await createContract(empId, values)
    if (!result.ok) return setDialogoError(result.error)
    toast.success('Contrato registrado.')
    cerrarDialogo()
  }

  async function onEditar(values: EditarContratoInput) {
    if (!vigente) return
    const result = await updateContract(vigente.lab_id, values)
    if (!result.ok) return setDialogoError(result.error)
    toast.success('Contrato actualizado.')
    cerrarDialogo()
  }

  async function onTerminar(values: TerminarContratoInput) {
    if (!vigente) return
    const result = await terminateContract(vigente.lab_id, values)
    if (!result.ok) return setDialogoError(result.error)
    toast.success(
      result.programada
        ? `Terminación registrada: el contrato se cierra después del ${formatDate(values.lab_fecha_fin)}.`
        : 'Contrato terminado. Queda pendiente de liquidar.'
    )
    cerrarDialogo()
  }

  async function onRevertir() {
    if (!revertible || revirtiendo) return
    setRevirtiendo(true)
    const result = await revertContractTermination(revertible.lab_id)
    setRevirtiendo(false)
    setRevertirPendiente(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('Terminación revertida: el contrato vuelve a estar vigente.')
  }

  const botonRevertir = canEditContrato && revertible && (
    <Button variant="secondary" onClick={() => setRevertirPendiente(true)}>
      <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />
      Revertir terminación
    </Button>
  )

  let botones: React.ReactNode = null
  if (vigente && canEditContrato) {
    botones = programada ? (
      botonRevertir
    ) : (
      <>
        {/* Rojo: saca a la persona del kiosco y de la planilla. */}
        <Button variant="danger" onClick={() => abrir('terminar')}>
          <FileX2 className="h-3.5 w-3.5" aria-hidden="true" />
          Terminar
        </Button>
        {/*
          Editar ya no se bloquea por haber pasado por planilla: los períodos
          ya calculados conservan sus montos (foto del contrato en
          sgrh_nomina_detalle) y lo nuevo entra en el siguiente. El aviso del
          diálogo lo explica.
        */}
        <Button onClick={() => abrir('editar')}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          Editar
        </Button>
      </>
    )
  } else if (!vigente) {
    botones = (
      <>
        {pendienteDeLiquidar && botonRevertir}
        {pendienteDeLiquidar && canLiquidar && ultimo && (
          <Link
            href={liquidacionHref(ultimo.lab_id)}
            className={cn(BUTTON_BASE, BUTTON_VARIANTS.primary, BUTTON_SIZES.sm)}
          >
            <FileX2 className="h-3.5 w-3.5" aria-hidden="true" />
            Liquidar
          </Link>
        )}
        {canEditContrato &&
          (pendienteDeLiquidar ? (
            <ConMotivo motivo="El contrato anterior está pendiente de liquidar">
              <Button disabled>
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                Nuevo contrato
              </Button>
            </ConMotivo>
          ) : (
            <Button onClick={() => abrir('crear')}>
              <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
              Nuevo contrato
            </Button>
          ))}
      </>
    )
  }

  return (
    <>
      {botones && <div className="flex shrink-0 flex-wrap justify-end gap-2">{botones}</div>}

      {dialogo === 'crear' && catalogos && (
        <Modal title="Nuevo contrato" onClose={cerrarDialogo}>
          <ContractForm
            modo="crear"
            catalogos={catalogos}
            serverError={dialogoError}
            submitLabel="Registrar contrato"
            onCancel={cerrarDialogo}
            onSubmit={onCrear}
          />
        </Modal>
      )}

      {dialogo === 'editar' && vigente && catalogos && (
        <Modal title="Editar contrato" subtitle={vigente.puesto_nombre} onClose={cerrarDialogo}>
          {vigente.en_planilla && (
            <Alert tone="info" size="md">
              Este contrato ya pasó por planilla. Los cambios aplican desde el próximo período; los
              que ya están calculados conservan sus montos. Si querés que apliquen al período
              abierto, recalculalo desde Planilla.
            </Alert>
          )}
          <ContractForm
            modo="editar"
            catalogos={catalogos}
            sucursalNombre={vigente.sucursal_nombre}
            fechaInicio={vigente.lab_fecha_inicio}
            sucursalBloqueada={
              vigente.quincena_sin_pagar
                ? 'No se puede cambiar con una quincena sin pagar: terminá de pagarla en Planilla.'
                : null
            }
            defaultValues={{
              lab_puesto_id: vigente.lab_puesto_id,
              // Desde que la sucursal se edita, tiene que venir precargada con
              // la actual: un select vacío obliga a elegirla de nuevo en cada
              // corrección de salario, y basta un descuido para mover la base
              // sin querer. Además, bloqueada el campo no se renderiza y este
              // valor es el que viaja, así que la RPC no detecta un cambio.
              lab_sucursal_id: vigente.lab_sucursal_id,
              lab_tipo_contrato_id: vigente.lab_tipo_contrato_id,
              lab_tipo_jornada_id: vigente.lab_tipo_jornada_id,
              lab_salario_base: vigente.lab_salario_base,
              lab_salario_real: vigente.lab_salario_real,
            }}
            serverError={dialogoError}
            submitLabel="Guardar cambios"
            onCancel={cerrarDialogo}
            onSubmit={onEditar}
          />
        </Modal>
      )}

      {dialogo === 'terminar' && vigente && (
        <Modal title="Terminar contrato" subtitle={vigente.puesto_nombre} onClose={cerrarDialogo}>
          <TerminateContractForm
            motivos={motivos}
            serverError={dialogoError}
            onCancel={cerrarDialogo}
            onSubmit={onTerminar}
          />
        </Modal>
      )}

      {revertirPendiente && revertible && (
        <ConfirmDialog
          title="Revertir terminación"
          message={
            programada
              ? 'Se cancela la terminación programada: el contrato sigue vigente sin fecha de fin.'
              : 'El contrato vuelve a estar vigente y deja de estar pendiente de liquidar. Sus turnos futuros siguen asignados.'
          }
          confirmLabel="Revertir"
          onCancel={() => setRevertirPendiente(false)}
          onConfirm={() => void onRevertir()}
        />
      )}
    </>
  )
}
