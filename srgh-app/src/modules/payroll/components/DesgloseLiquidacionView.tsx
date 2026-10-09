import { formatCRC } from '@/modules/payroll/lib/format'
import type { DesgloseLiquidacion } from '@/modules/payroll/types'

function ResultadoLinea({ label, valor, dias }: { label: string; valor: number; dias?: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-slate-600">
        {label}
        {dias !== undefined && <span className="text-slate-400"> ({dias} días)</span>}
      </span>
      <span className="tabular-nums font-medium text-slate-800">{formatCRC(valor)}</span>
    </div>
  )
}

interface DesgloseLiquidacionViewProps {
  datos: DesgloseLiquidacion
  /** "Neto a entregar" o "Neto entregado". */
  etiquetaNeto?: string
}

/**
 * Rubros de una liquidación. Lo comparten la vista previa, el resultado al
 * guardar y el historial: así lo que se revisa antes de pagar es exactamente
 * lo mismo que se vio al calcular.
 */
export function DesgloseLiquidacionView({
  datos,
  etiquetaNeto = 'Neto a entregar',
}: DesgloseLiquidacionViewProps) {
  return (
    <div>
      {/*
        Lo que el cálculo no pudo resolver solo va PRIMERO: una quincena sin
        pagar o un salario supuesto cambian el monto, y quien lee el total
        tiene que saberlo antes de firmarlo.
      */}
      {datos.advertencias.length > 0 && (
        <ul className="mb-3 space-y-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          {datos.advertencias.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <p className="mb-1 text-[11px] text-slate-400">
        Salario diario {formatCRC(datos.salarioDiario)} · promedio de los últimos seis meses sin
        incapacidades ÷ 30.
        {datos.salarioDiarioVacaciones !== null && (
          <>
            {' '}
            Vacaciones a {formatCRC(datos.salarioDiarioVacaciones)} por día · promedio de las
            últimas 50 semanas ÷ 30.
          </>
        )}
      </p>
      <ResultadoLinea
        label="Salario pendiente"
        valor={datos.salarioProporcional}
        dias={datos.diasSalarioPendiente}
      />
      <ResultadoLinea label="Aguinaldo proporcional" valor={datos.aguinaldoProporcional} />
      <ResultadoLinea
        label="Vacaciones no disfrutadas"
        valor={datos.vacacionesPagadas}
        dias={datos.diasVacaciones}
      />
      {datos.horasExtraBanco > 0 && (
        <ResultadoLinea
          label="Horas extra pendientes (banco de horas)"
          valor={datos.horasExtraBanco}
        />
      )}
      <ResultadoLinea label="Preaviso" valor={datos.preaviso} dias={datos.diasPreaviso} />
      <ResultadoLinea label="Cesantía" valor={datos.cesantia} dias={datos.diasCesantia} />
      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-600">
        <span>Total bruto</span>
        <span className="tabular-nums font-medium">{formatCRC(datos.total)}</span>
      </div>
      {/*
        Solo cotiza lo que es salario: pendiente, vacaciones y horas extra del
        banco. Preaviso y cesantía son indemnizaciones; el aguinaldo está
        exento.
      */}
      <div className="flex items-center justify-between py-1 text-xs text-slate-600">
        <span>
          Cuota obrera CCSS{' '}
          <span className="text-slate-400">
            {datos.horasExtraBanco > 0
              ? '(sobre salario pendiente, vacaciones y horas extra)'
              : '(sobre salario pendiente y vacaciones)'}
          </span>
        </span>
        <span className="tabular-nums font-medium text-rose-700">
          − {formatCRC(datos.deduccionesObreras)}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
        <span>{etiquetaNeto}</span>
        <span className="tabular-nums">{formatCRC(datos.neto)}</span>
      </div>
    </div>
  )
}
