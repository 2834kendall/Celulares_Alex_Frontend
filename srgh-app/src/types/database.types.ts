export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      sgrh_ausencias: {
        Row: {
          aus_aprobado_por_id: number | null
          aus_created_at: string
          aus_dias_habiles: number | null
          aus_dias_naturales: number | null
          aus_dias_paga_ccss: number
          aus_dias_paga_empleador: number
          aus_dias_sin_goce: number
          aus_documento_url: string | null
          aus_estado: string
          aus_fecha_aprobacion: string | null
          aus_fecha_fin: string
          aus_fecha_inicio: string
          aus_historial_laboral_id: number
          aus_id: number
          aus_motivo_rechazo: string | null
          aus_numero_boleta_ccss: string | null
          aus_observaciones: string | null
          aus_tipo_ausencia_id: number
        }
        Insert: {
          aus_aprobado_por_id?: number | null
          aus_created_at?: string
          aus_dias_habiles?: number | null
          aus_dias_naturales?: number | null
          aus_dias_paga_ccss?: number
          aus_dias_paga_empleador?: number
          aus_dias_sin_goce?: number
          aus_documento_url?: string | null
          aus_estado?: string
          aus_fecha_aprobacion?: string | null
          aus_fecha_fin: string
          aus_fecha_inicio: string
          aus_historial_laboral_id: number
          aus_id?: never
          aus_motivo_rechazo?: string | null
          aus_numero_boleta_ccss?: string | null
          aus_observaciones?: string | null
          aus_tipo_ausencia_id: number
        }
        Update: {
          aus_aprobado_por_id?: number | null
          aus_created_at?: string
          aus_dias_habiles?: number | null
          aus_dias_naturales?: number | null
          aus_dias_paga_ccss?: number
          aus_dias_paga_empleador?: number
          aus_dias_sin_goce?: number
          aus_documento_url?: string | null
          aus_estado?: string
          aus_fecha_aprobacion?: string | null
          aus_fecha_fin?: string
          aus_fecha_inicio?: string
          aus_historial_laboral_id?: number
          aus_id?: never
          aus_motivo_rechazo?: string | null
          aus_numero_boleta_ccss?: string | null
          aus_observaciones?: string | null
          aus_tipo_ausencia_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_asi_aus_aprobado_por_id_fkey"
            columns: ["aus_aprobado_por_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
          {
            foreignKeyName: "sgrh_asi_aus_historial_laboral_id_fkey"
            columns: ["aus_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_asi_aus_tipo_ausencia_id_fkey"
            columns: ["aus_tipo_ausencia_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_tipos_ausencia"
            referencedColumns: ["tau_id"]
          },
        ]
      }
      sgrh_banco_horas_movimientos: {
        Row: {
          bhm_created_at: string
          bhm_estado: string
          bhm_fecha_resolucion: string | null
          bhm_historial_laboral_id: number
          bhm_horas: number
          bhm_id: number
          bhm_monto_pagado: number | null
          bhm_nomina_detalle_id: number
          bhm_nomina_detalle_pago_id: number | null
          bhm_resuelto_por_id: number | null
          bhm_salario_por_hora: number
        }
        Insert: {
          bhm_created_at?: string
          bhm_estado?: string
          bhm_fecha_resolucion?: string | null
          bhm_historial_laboral_id: number
          bhm_horas: number
          bhm_id?: never
          bhm_monto_pagado?: number | null
          bhm_nomina_detalle_id: number
          bhm_nomina_detalle_pago_id?: number | null
          bhm_resuelto_por_id?: number | null
          bhm_salario_por_hora?: number
        }
        Update: {
          bhm_created_at?: string
          bhm_estado?: string
          bhm_fecha_resolucion?: string | null
          bhm_historial_laboral_id?: number
          bhm_horas?: number
          bhm_id?: never
          bhm_monto_pagado?: number | null
          bhm_nomina_detalle_id?: number
          bhm_nomina_detalle_pago_id?: number | null
          bhm_resuelto_por_id?: number | null
          bhm_salario_por_hora?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_banco_horas_movimientos_bhm_historial_laboral_id_fkey"
            columns: ["bhm_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_banco_horas_movimientos_bhm_nomina_detalle_id_fkey"
            columns: ["bhm_nomina_detalle_id"]
            isOneToOne: true
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
          {
            foreignKeyName: "sgrh_banco_horas_movimientos_bhm_nomina_detalle_pago_id_fkey"
            columns: ["bhm_nomina_detalle_pago_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
          {
            foreignKeyName: "sgrh_banco_horas_movimientos_bhm_resuelto_por_id_fkey"
            columns: ["bhm_resuelto_por_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
        ]
      }
      sgrh_beneficios_empleado: {
        Row: {
          ben_activo: boolean
          ben_created_at: string
          ben_cuota_mensual: number | null
          ben_cuotas_pactadas: number | null
          ben_descripcion: string
          ben_fecha_fin_estimada: string | null
          ben_fecha_inicio: string
          ben_historial_laboral_id: number
          ben_id: number
          ben_monto_deducido: number
          ben_monto_total: number
          ben_observaciones: string | null
        }
        Insert: {
          ben_activo?: boolean
          ben_created_at?: string
          ben_cuota_mensual?: number | null
          ben_cuotas_pactadas?: number | null
          ben_descripcion: string
          ben_fecha_fin_estimada?: string | null
          ben_fecha_inicio: string
          ben_historial_laboral_id: number
          ben_id?: never
          ben_monto_deducido?: number
          ben_monto_total: number
          ben_observaciones?: string | null
        }
        Update: {
          ben_activo?: boolean
          ben_created_at?: string
          ben_cuota_mensual?: number | null
          ben_cuotas_pactadas?: number | null
          ben_descripcion?: string
          ben_fecha_fin_estimada?: string | null
          ben_fecha_inicio?: string
          ben_historial_laboral_id?: number
          ben_id?: never
          ben_monto_deducido?: number
          ben_monto_total?: number
          ben_observaciones?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_his_ben_historial_laboral_id_fkey"
            columns: ["ben_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
        ]
      }
      sgrh_candidatos: {
        Row: {
          cdt_apellido_1: string
          cdt_apellido_2: string | null
          cdt_created_at: string
          cdt_cv_url: string | null
          cdt_email: string
          cdt_fuente_reclutamiento: string | null
          cdt_id: number
          cdt_nombre: string
          cdt_numero_identificacion: string | null
          cdt_telefono: string | null
          cdt_tipo_identificacion_id: number | null
        }
        Insert: {
          cdt_apellido_1: string
          cdt_apellido_2?: string | null
          cdt_created_at?: string
          cdt_cv_url?: string | null
          cdt_email: string
          cdt_fuente_reclutamiento?: string | null
          cdt_id?: never
          cdt_nombre: string
          cdt_numero_identificacion?: string | null
          cdt_telefono?: string | null
          cdt_tipo_identificacion_id?: number | null
        }
        Update: {
          cdt_apellido_1?: string
          cdt_apellido_2?: string | null
          cdt_created_at?: string
          cdt_cv_url?: string | null
          cdt_email?: string
          cdt_fuente_reclutamiento?: string | null
          cdt_id?: never
          cdt_nombre?: string
          cdt_numero_identificacion?: string | null
          cdt_telefono?: string | null
          cdt_tipo_identificacion_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_rec_cdt_tipo_identificacion_id_fkey"
            columns: ["cdt_tipo_identificacion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_tipos_identificacion"
            referencedColumns: ["tid_id"]
          },
        ]
      }
      sgrh_biometria_auditoria: {
        Row: {
          bia_created_at: string
          bia_dispositivo_id: string | null
          bia_empresa_id: number
          bia_id: number
          bia_mejor_distancia: number | null
          bia_mejor_empleado_id: number | null
          bia_resultado: string
          bia_sucursal_id: number | null
        }
        Insert: {
          bia_created_at?: string
          bia_dispositivo_id?: string | null
          bia_empresa_id: number
          bia_id?: never
          bia_mejor_distancia?: number | null
          bia_mejor_empleado_id?: number | null
          bia_resultado: string
          bia_sucursal_id?: number | null
        }
        Update: {
          bia_created_at?: string
          bia_dispositivo_id?: string | null
          bia_empresa_id?: number
          bia_id?: never
          bia_mejor_distancia?: number | null
          bia_mejor_empleado_id?: number | null
          bia_resultado?: string
          bia_sucursal_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_biometria_auditoria_bia_empresa_id_fkey"
            columns: ["bia_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_biometria_auditoria_bia_mejor_empleado_id_fkey"
            columns: ["bia_mejor_empleado_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
          {
            foreignKeyName: "sgrh_biometria_auditoria_bia_sucursal_id_fkey"
            columns: ["bia_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
        ]
      }
      sgrh_biometria_empleado: {
        Row: {
          bio_created_at: string
          bio_creado_por: number | null
          bio_empleado_id: number
          bio_empresa_id: number
          bio_id: number
          bio_modelo: string
          bio_updated_at: string
          bio_vector: Json
        }
        Insert: {
          bio_created_at?: string
          bio_creado_por?: number | null
          bio_empleado_id: number
          bio_empresa_id: number
          bio_id?: never
          bio_modelo?: string
          bio_updated_at?: string
          bio_vector: Json
        }
        Update: {
          bio_created_at?: string
          bio_creado_por?: number | null
          bio_empleado_id?: number
          bio_empresa_id?: number
          bio_id?: never
          bio_modelo?: string
          bio_updated_at?: string
          bio_vector?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_biometria_empleado_bio_creado_por_fkey"
            columns: ["bio_creado_por"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
          {
            foreignKeyName: "sgrh_biometria_empleado_bio_empleado_id_fkey"
            columns: ["bio_empleado_id"]
            isOneToOne: true
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
          {
            foreignKeyName: "sgrh_biometria_empleado_bio_empresa_id_fkey"
            columns: ["bio_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
        ]
      }
      sgrh_cat_areas_evaluacion: {
        Row: {
          are_activo: boolean
          are_id: number
          are_nombre: string
          are_tipo_aplicacion: string
        }
        Insert: {
          are_activo?: boolean
          are_id?: never
          are_nombre: string
          are_tipo_aplicacion?: string
        }
        Update: {
          are_activo?: boolean
          are_id?: never
          are_nombre?: string
          are_tipo_aplicacion?: string
        }
        Relationships: []
      }
      sgrh_cat_bancos: {
        Row: {
          ban_activo: boolean
          ban_codigo: string | null
          ban_id: number
          ban_nombre: string
        }
        Insert: {
          ban_activo?: boolean
          ban_codigo?: string | null
          ban_id?: number
          ban_nombre: string
        }
        Update: {
          ban_activo?: boolean
          ban_codigo?: string | null
          ban_id?: number
          ban_nombre?: string
        }
        Relationships: []
      }
      sgrh_cat_cantones: {
        Row: {
          can_codigo: string
          can_id: number
          can_nombre: string
          can_provincia_id: number
        }
        Insert: {
          can_codigo: string
          can_id?: never
          can_nombre: string
          can_provincia_id: number
        }
        Update: {
          can_codigo?: string
          can_id?: never
          can_nombre?: string
          can_provincia_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_can_provincia_id_fkey"
            columns: ["can_provincia_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_provincias"
            referencedColumns: ["prv_id"]
          },
        ]
      }
      sgrh_cat_conceptos_nomina: {
        Row: {
          con_activo: boolean
          con_afecta_base_ccss: boolean
          con_afecta_salario_bruto: boolean
          con_codigo: string
          con_formula_base: string | null
          con_id: number
          con_nombre: string
          con_porcentaje: number | null
          con_tipo: string
          con_tipo_calculo: string
        }
        Insert: {
          con_activo?: boolean
          con_afecta_base_ccss?: boolean
          con_afecta_salario_bruto?: boolean
          con_codigo: string
          con_formula_base?: string | null
          con_id?: never
          con_nombre: string
          con_porcentaje?: number | null
          con_tipo: string
          con_tipo_calculo?: string
        }
        Update: {
          con_activo?: boolean
          con_afecta_base_ccss?: boolean
          con_afecta_salario_bruto?: boolean
          con_codigo?: string
          con_formula_base?: string | null
          con_id?: never
          con_nombre?: string
          con_porcentaje?: number | null
          con_tipo?: string
          con_tipo_calculo?: string
        }
        Relationships: []
      }
      sgrh_cat_criterios_evaluacion: {
        Row: {
          cri_activo: boolean
          cri_area_id: number
          cri_descripcion: string
          cri_id: number
        }
        Insert: {
          cri_activo?: boolean
          cri_area_id: number
          cri_descripcion: string
          cri_id?: never
        }
        Update: {
          cri_activo?: boolean
          cri_area_id?: number
          cri_descripcion?: string
          cri_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_cri_area_id_fkey"
            columns: ["cri_area_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_areas_evaluacion"
            referencedColumns: ["are_id"]
          },
        ]
      }
      sgrh_cat_distritos: {
        Row: {
          dis_canton_id: number
          dis_codigo: string
          dis_id: number
          dis_nombre: string
        }
        Insert: {
          dis_canton_id: number
          dis_codigo: string
          dis_id?: never
          dis_nombre: string
        }
        Update: {
          dis_canton_id?: number
          dis_codigo?: string
          dis_id?: never
          dis_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_dis_canton_id_fkey"
            columns: ["dis_canton_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_cantones"
            referencedColumns: ["can_id"]
          },
        ]
      }
      sgrh_cat_etapas_seleccion: {
        Row: {
          eta_activo: boolean
          eta_id: number
          eta_nombre: string
          eta_orden: number
        }
        Insert: {
          eta_activo?: boolean
          eta_id?: never
          eta_nombre: string
          eta_orden: number
        }
        Update: {
          eta_activo?: boolean
          eta_id?: never
          eta_nombre?: string
          eta_orden?: number
        }
        Relationships: []
      }
      sgrh_cat_feriados: {
        Row: {
          fer_activo: boolean
          fer_empresa_id: number | null
          fer_es_pago_obligatorio: boolean
          fer_fecha: string
          fer_id: number
          fer_nombre: string
        }
        Insert: {
          fer_activo?: boolean
          fer_empresa_id?: number | null
          fer_es_pago_obligatorio?: boolean
          fer_fecha: string
          fer_id?: never
          fer_nombre: string
        }
        Update: {
          fer_activo?: boolean
          fer_empresa_id?: number | null
          fer_es_pago_obligatorio?: boolean
          fer_fecha?: string
          fer_id?: never
          fer_nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_fer_empresa_id_fkey"
            columns: ["fer_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
        ]
      }
      sgrh_cat_horarios: {
        Row: {
          hor_activo: boolean
          hor_duracion_almuerzo_min: number
          hor_duracion_break_min: number
          hor_empresa_id: number
          hor_hora_entrada: string
          hor_hora_fin_almuerzo: string
          hor_hora_fin_break: string | null
          hor_hora_inicio_almuerzo: string
          hor_hora_inicio_break: string | null
          hor_hora_salida: string
          hor_id: number
          hor_nombre: string
          hor_tipo_jornada_id: number
        }
        Insert: {
          hor_activo?: boolean
          hor_duracion_almuerzo_min?: number
          hor_duracion_break_min?: number
          hor_empresa_id: number
          hor_hora_entrada: string
          hor_hora_fin_almuerzo: string
          hor_hora_fin_break?: string | null
          hor_hora_inicio_almuerzo: string
          hor_hora_inicio_break?: string | null
          hor_hora_salida: string
          hor_id?: never
          hor_nombre: string
          hor_tipo_jornada_id: number
        }
        Update: {
          hor_activo?: boolean
          hor_duracion_almuerzo_min?: number
          hor_duracion_break_min?: number
          hor_empresa_id?: number
          hor_hora_entrada?: string
          hor_hora_fin_almuerzo?: string
          hor_hora_fin_break?: string | null
          hor_hora_inicio_almuerzo?: string
          hor_hora_inicio_break?: string | null
          hor_hora_salida?: string
          hor_id?: never
          hor_nombre?: string
          hor_tipo_jornada_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_hor_empresa_id_fkey"
            columns: ["hor_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_cat_hor_tipo_jornada_id_fkey"
            columns: ["hor_tipo_jornada_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_tipos_jornada"
            referencedColumns: ["tjo_id"]
          },
        ]
      }
      sgrh_cat_motivos_salida: {
        Row: {
          mot_codigo: string
          mot_genera_cesantia: boolean
          mot_genera_preaviso: boolean
          mot_id: number
          mot_nombre: string
          mot_nota_legal: string | null
        }
        Insert: {
          mot_codigo: string
          mot_genera_cesantia?: boolean
          mot_genera_preaviso?: boolean
          mot_id?: never
          mot_nombre: string
          mot_nota_legal?: string | null
        }
        Update: {
          mot_codigo?: string
          mot_genera_cesantia?: boolean
          mot_genera_preaviso?: boolean
          mot_id?: never
          mot_nombre?: string
          mot_nota_legal?: string | null
        }
        Relationships: []
      }
      sgrh_cat_niveles_comision: {
        Row: {
          nvc_activo: boolean
          nvc_empresa_id: number
          nvc_id: number
          nvc_meta_maxima: number | null
          nvc_meta_minima: number
          nvc_nombre_nivel: string
          nvc_porcentaje: number
        }
        Insert: {
          nvc_activo?: boolean
          nvc_empresa_id: number
          nvc_id?: never
          nvc_meta_maxima?: number | null
          nvc_meta_minima: number
          nvc_nombre_nivel: string
          nvc_porcentaje: number
        }
        Update: {
          nvc_activo?: boolean
          nvc_empresa_id?: number
          nvc_id?: never
          nvc_meta_maxima?: number | null
          nvc_meta_minima?: number
          nvc_nombre_nivel?: string
          nvc_porcentaje?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_nvc_empresa_id_fkey"
            columns: ["nvc_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
        ]
      }
      sgrh_cat_permisos: {
        Row: {
          per_codigo: string
          per_descripcion: string | null
          per_id: number
          per_modulo: string
          per_nombre: string
        }
        Insert: {
          per_codigo: string
          per_descripcion?: string | null
          per_id?: never
          per_modulo: string
          per_nombre: string
        }
        Update: {
          per_codigo?: string
          per_descripcion?: string | null
          per_id?: never
          per_modulo?: string
          per_nombre?: string
        }
        Relationships: []
      }
      sgrh_cat_provincias: {
        Row: {
          prv_codigo: string
          prv_id: number
          prv_nombre: string
        }
        Insert: {
          prv_codigo: string
          prv_id?: never
          prv_nombre: string
        }
        Update: {
          prv_codigo?: string
          prv_id?: never
          prv_nombre?: string
        }
        Relationships: []
      }
      sgrh_cat_puestos: {
        Row: {
          pue_activo: boolean
          pue_descripcion: string | null
          pue_empresa_id: number
          pue_id: number
          pue_nombre: string
          pue_salario_minimo_referencia: number | null
        }
        Insert: {
          pue_activo?: boolean
          pue_descripcion?: string | null
          pue_empresa_id: number
          pue_id?: never
          pue_nombre: string
          pue_salario_minimo_referencia?: number | null
        }
        Update: {
          pue_activo?: boolean
          pue_descripcion?: string | null
          pue_empresa_id?: number
          pue_id?: never
          pue_nombre?: string
          pue_salario_minimo_referencia?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_cat_pue_empresa_id_fkey"
            columns: ["pue_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
        ]
      }
      sgrh_cat_roles: {
        Row: {
          rol_activo: boolean
          rol_codigo: string
          rol_descripcion: string | null
          rol_id: number
          rol_nombre: string
        }
        Insert: {
          rol_activo?: boolean
          rol_codigo: string
          rol_descripcion?: string | null
          rol_id?: never
          rol_nombre: string
        }
        Update: {
          rol_activo?: boolean
          rol_codigo?: string
          rol_descripcion?: string | null
          rol_id?: never
          rol_nombre?: string
        }
        Relationships: []
      }
      sgrh_cat_tipos_ausencia: {
        Row: {
          tau_codigo: string
          tau_descuenta_vacaciones: boolean
          tau_es_protegida: boolean
          tau_id: number
          tau_nombre: string
          tau_paga_ccss_desde_dia: number | null
          tau_paga_empleador_dias: number
          tau_porcentaje_pago_empleador: number
          tau_porcentaje_subsidio_ccss: number | null
          tau_referencia_legal: string | null
          tau_requiere_documento_ccss: boolean
        }
        Insert: {
          tau_codigo: string
          tau_descuenta_vacaciones?: boolean
          tau_es_protegida?: boolean
          tau_id?: never
          tau_nombre: string
          tau_paga_ccss_desde_dia?: number | null
          tau_paga_empleador_dias?: number
          tau_porcentaje_pago_empleador?: number
          tau_porcentaje_subsidio_ccss?: number | null
          tau_referencia_legal?: string | null
          tau_requiere_documento_ccss?: boolean
        }
        Update: {
          tau_codigo?: string
          tau_descuenta_vacaciones?: boolean
          tau_es_protegida?: boolean
          tau_id?: never
          tau_nombre?: string
          tau_paga_ccss_desde_dia?: number | null
          tau_paga_empleador_dias?: number
          tau_porcentaje_pago_empleador?: number
          tau_porcentaje_subsidio_ccss?: number | null
          tau_referencia_legal?: string | null
          tau_requiere_documento_ccss?: boolean
        }
        Relationships: []
      }
      sgrh_cat_tipos_contrato: {
        Row: {
          tco_codigo: string
          tco_id: number
          tco_nombre: string
          tco_nota_legal: string | null
          tco_permite_cesantia: boolean
          tco_permite_preaviso: boolean
        }
        Insert: {
          tco_codigo: string
          tco_id?: never
          tco_nombre: string
          tco_nota_legal?: string | null
          tco_permite_cesantia?: boolean
          tco_permite_preaviso?: boolean
        }
        Update: {
          tco_codigo?: string
          tco_id?: never
          tco_nombre?: string
          tco_nota_legal?: string | null
          tco_permite_cesantia?: boolean
          tco_permite_preaviso?: boolean
        }
        Relationships: []
      }
      sgrh_cat_tipos_identificacion: {
        Row: {
          tid_activo: boolean
          tid_codigo: string
          tid_id: number
          tid_nombre: string
        }
        Insert: {
          tid_activo?: boolean
          tid_codigo: string
          tid_id?: never
          tid_nombre: string
        }
        Update: {
          tid_activo?: boolean
          tid_codigo?: string
          tid_id?: never
          tid_nombre?: string
        }
        Relationships: []
      }
      sgrh_cat_tipos_jornada: {
        Row: {
          tjo_codigo: string
          tjo_horas_max_diarias: number | null
          tjo_horas_max_semanales: number | null
          tjo_id: number
          tjo_nombre: string
          tjo_recargo_porcentaje: number
        }
        Insert: {
          tjo_codigo: string
          tjo_horas_max_diarias?: number | null
          tjo_horas_max_semanales?: number | null
          tjo_id?: never
          tjo_nombre: string
          tjo_recargo_porcentaje?: number
        }
        Update: {
          tjo_codigo?: string
          tjo_horas_max_diarias?: number | null
          tjo_horas_max_semanales?: number | null
          tjo_id?: never
          tjo_nombre?: string
          tjo_recargo_porcentaje?: number
        }
        Relationships: []
      }
      sgrh_comisiones_calculadas: {
        Row: {
          cal_created_at: string
          cal_historial_laboral_id: number
          cal_id: number
          cal_monto_comision: number
          cal_nivel_comision_id: number | null
          cal_nomina_detalle_id: number | null
          cal_observacion: string | null
          cal_periodo_anio: number
          cal_periodo_mes: number
          cal_quincena: number
          cal_registrado_por: number
        }
        Insert: {
          cal_created_at?: string
          cal_historial_laboral_id: number
          cal_id?: never
          cal_monto_comision: number
          cal_nivel_comision_id?: number | null
          cal_nomina_detalle_id?: number | null
          cal_observacion?: string | null
          cal_periodo_anio: number
          cal_periodo_mes: number
          cal_quincena: number
          cal_registrado_por: number
        }
        Update: {
          cal_created_at?: string
          cal_historial_laboral_id?: number
          cal_id?: never
          cal_monto_comision?: number
          cal_nivel_comision_id?: number | null
          cal_nomina_detalle_id?: number | null
          cal_observacion?: string | null
          cal_periodo_anio?: number
          cal_periodo_mes?: number
          cal_quincena?: number
          cal_registrado_por?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_com_cal_historial_laboral_id_fkey"
            columns: ["cal_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_com_cal_nivel_comision_id_fkey"
            columns: ["cal_nivel_comision_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_niveles_comision"
            referencedColumns: ["nvc_id"]
          },
          {
            foreignKeyName: "sgrh_com_cal_nomina_detalle_id_fkey"
            columns: ["cal_nomina_detalle_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
          {
            foreignKeyName: "sgrh_com_cal_registrado_por_fkey"
            columns: ["cal_registrado_por"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
        ]
      }
      sgrh_comprobantes_pago: {
        Row: {
          com_codigo_verificacion: string
          com_confirmado_por_empleado: boolean
          com_fecha_confirmacion: string | null
          com_fecha_emision: string
          com_id: number
          com_metodo_pago: string | null
          com_nomina_detalle_id: number
          com_referencia_bancaria: string | null
        }
        Insert: {
          com_codigo_verificacion: string
          com_confirmado_por_empleado?: boolean
          com_fecha_confirmacion?: string | null
          com_fecha_emision?: string
          com_id?: never
          com_metodo_pago?: string | null
          com_nomina_detalle_id: number
          com_referencia_bancaria?: string | null
        }
        Update: {
          com_codigo_verificacion?: string
          com_confirmado_por_empleado?: boolean
          com_fecha_confirmacion?: string | null
          com_fecha_emision?: string
          com_id?: never
          com_metodo_pago?: string | null
          com_nomina_detalle_id?: number
          com_referencia_bancaria?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_nom_com_nomina_detalle_id_fkey"
            columns: ["com_nomina_detalle_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
        ]
      }
      sgrh_direcciones: {
        Row: {
          dir_codigo_postal: string
          dir_created_at: string
          dir_distrito_id: number
          dir_id: number
          dir_senas_exactas: string | null
        }
        Insert: {
          dir_codigo_postal?: string
          dir_created_at?: string
          dir_distrito_id: number
          dir_id?: number
          dir_senas_exactas?: string | null
        }
        Update: {
          dir_codigo_postal?: string
          dir_created_at?: string
          dir_distrito_id?: number
          dir_id?: number
          dir_senas_exactas?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_direcciones_dir_distrito_id_fkey"
            columns: ["dir_distrito_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_distritos"
            referencedColumns: ["dis_id"]
          },
        ]
      }
      sgrh_empleado_datos_pago: {
        Row: {
          edp_banco_id: number | null
          edp_created_at: string
          edp_empleado_id: number
          edp_id: number
          edp_numero_cuenta: string | null
          edp_tipo_cuenta: string | null
        }
        Insert: {
          edp_banco_id?: number | null
          edp_created_at?: string
          edp_empleado_id: number
          edp_id?: number
          edp_numero_cuenta?: string | null
          edp_tipo_cuenta?: string | null
        }
        Update: {
          edp_banco_id?: number | null
          edp_created_at?: string
          edp_empleado_id?: number
          edp_id?: number
          edp_numero_cuenta?: string | null
          edp_tipo_cuenta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_empleado_datos_pago_edp_banco_id_fkey"
            columns: ["edp_banco_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_bancos"
            referencedColumns: ["ban_id"]
          },
          {
            foreignKeyName: "sgrh_empleado_datos_pago_edp_empleado_id_fkey"
            columns: ["edp_empleado_id"]
            isOneToOne: true
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
        ]
      }
      sgrh_empleados: {
        Row: {
          emp_apellido_1: string
          emp_apellido_2: string | null
          emp_created_at: string
          emp_direccion_id: number
          emp_email_personal: string | null
          emp_fecha_ingreso_original: string
          emp_fecha_nacimiento: string | null
          emp_genero: string | null
          emp_id: number
          emp_nacionalidad: string
          emp_nombre: string
          emp_nombre_contacto_emergencia: string | null
          emp_numero_asegurado_ccss: string | null
          emp_numero_identificacion: string
          emp_rostro_hash: string | null
          emp_telefono: string | null
          emp_telefono_emergencia: string | null
          emp_tipo_identificacion_id: number
        }
        Insert: {
          emp_apellido_1: string
          emp_apellido_2?: string | null
          emp_created_at?: string
          emp_direccion_id: number
          emp_email_personal?: string | null
          emp_fecha_ingreso_original: string
          emp_fecha_nacimiento?: string | null
          emp_genero?: string | null
          emp_id?: never
          emp_nacionalidad?: string
          emp_nombre: string
          emp_nombre_contacto_emergencia?: string | null
          emp_numero_asegurado_ccss?: string | null
          emp_numero_identificacion: string
          emp_rostro_hash?: string | null
          emp_telefono?: string | null
          emp_telefono_emergencia?: string | null
          emp_tipo_identificacion_id: number
        }
        Update: {
          emp_apellido_1?: string
          emp_apellido_2?: string | null
          emp_created_at?: string
          emp_direccion_id?: number
          emp_email_personal?: string | null
          emp_fecha_ingreso_original?: string
          emp_fecha_nacimiento?: string | null
          emp_genero?: string | null
          emp_id?: never
          emp_nacionalidad?: string
          emp_nombre?: string
          emp_nombre_contacto_emergencia?: string | null
          emp_numero_asegurado_ccss?: string | null
          emp_numero_identificacion?: string
          emp_rostro_hash?: string | null
          emp_telefono?: string | null
          emp_telefono_emergencia?: string | null
          emp_tipo_identificacion_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_emp_tipo_identificacion_id_fkey"
            columns: ["emp_tipo_identificacion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_tipos_identificacion"
            referencedColumns: ["tid_id"]
          },
          {
            foreignKeyName: "sgrh_empleados_emp_direccion_id_fkey"
            columns: ["emp_direccion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_direcciones"
            referencedColumns: ["dir_id"]
          },
        ]
      }
      sgrh_empresas: {
        Row: {
          org_activa: boolean
          org_actividad_economica_ciiu: string | null
          org_cedula_juridica: string
          org_created_at: string
          org_dia_pago_1: number | null
          org_dia_pago_2: number | null
          org_direccion_id: number | null
          org_email_corporativo: string | null
          org_id: number
          org_logo_url: string | null
          org_nombre_fantasia: string | null
          org_nombre_social: string
          org_periodicidad_pago: string
          org_representante_legal: string | null
          org_telefono: string | null
        }
        Insert: {
          org_activa?: boolean
          org_actividad_economica_ciiu?: string | null
          org_cedula_juridica: string
          org_created_at?: string
          org_dia_pago_1?: number | null
          org_dia_pago_2?: number | null
          org_direccion_id?: number | null
          org_email_corporativo?: string | null
          org_id?: never
          org_logo_url?: string | null
          org_nombre_fantasia?: string | null
          org_nombre_social: string
          org_periodicidad_pago: string
          org_representante_legal?: string | null
          org_telefono?: string | null
        }
        Update: {
          org_activa?: boolean
          org_actividad_economica_ciiu?: string | null
          org_cedula_juridica?: string
          org_created_at?: string
          org_dia_pago_1?: number | null
          org_dia_pago_2?: number | null
          org_direccion_id?: number | null
          org_email_corporativo?: string | null
          org_id?: never
          org_logo_url?: string | null
          org_nombre_fantasia?: string | null
          org_nombre_social?: string
          org_periodicidad_pago?: string
          org_representante_legal?: string | null
          org_telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_empresas_org_direccion_id_fkey"
            columns: ["org_direccion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_direcciones"
            referencedColumns: ["dir_id"]
          },
        ]
      }
      sgrh_evaluacion_resultados: {
        Row: {
          evr_criterio_id: number
          evr_evaluacion_id: number
          evr_id: number
          evr_no_aplica: boolean
          evr_observacion: string | null
          evr_puntaje: number | null
        }
        Insert: {
          evr_criterio_id: number
          evr_evaluacion_id: number
          evr_id?: never
          evr_no_aplica?: boolean
          evr_observacion?: string | null
          evr_puntaje?: number | null
        }
        Update: {
          evr_criterio_id?: number
          evr_evaluacion_id?: number
          evr_id?: never
          evr_no_aplica?: boolean
          evr_observacion?: string | null
          evr_puntaje?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_eva_res_criterio_id_fkey"
            columns: ["evr_criterio_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_criterios_evaluacion"
            referencedColumns: ["cri_id"]
          },
          {
            foreignKeyName: "sgrh_eva_res_evaluacion_id_fkey"
            columns: ["evr_evaluacion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_evaluaciones"
            referencedColumns: ["eve_id"]
          },
        ]
      }
      sgrh_evaluaciones: {
        Row: {
          eve_created_at: string
          eve_empresa_id: number
          eve_estado: string
          eve_evaluador_id: number
          eve_fecha_evaluacion: string
          eve_historial_laboral_id: number | null
          eve_id: number
          eve_observaciones: string | null
          eve_promedio_final: number | null
          eve_resultado_texto: string | null
          eve_sucursal_id: number | null
          eve_tipo_evaluacion: string
          eve_tipo_periodo: string
        }
        Insert: {
          eve_created_at?: string
          eve_empresa_id: number
          eve_estado?: string
          eve_evaluador_id: number
          eve_fecha_evaluacion: string
          eve_historial_laboral_id?: number | null
          eve_id?: never
          eve_observaciones?: string | null
          eve_promedio_final?: number | null
          eve_resultado_texto?: string | null
          eve_sucursal_id?: number | null
          eve_tipo_evaluacion: string
          eve_tipo_periodo: string
        }
        Update: {
          eve_created_at?: string
          eve_empresa_id?: number
          eve_estado?: string
          eve_evaluador_id?: number
          eve_fecha_evaluacion?: string
          eve_historial_laboral_id?: number | null
          eve_id?: never
          eve_observaciones?: string | null
          eve_promedio_final?: number | null
          eve_resultado_texto?: string | null
          eve_sucursal_id?: number | null
          eve_tipo_evaluacion?: string
          eve_tipo_periodo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_eva_enc_empresa_id_fkey"
            columns: ["eve_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_eva_enc_evaluador_id_fkey"
            columns: ["eve_evaluador_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
          {
            foreignKeyName: "sgrh_eva_enc_historial_laboral_id_fkey"
            columns: ["eve_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_eva_enc_sucursal_id_fkey"
            columns: ["eve_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
        ]
      }
      sgrh_historial_laboral: {
        Row: {
          lab_created_at: string
          lab_empleado_id: number
          lab_empresa_id: number
          lab_fecha_fin: string | null
          lab_fecha_inicio: string
          lab_id: number
          lab_motivo_salida_id: number | null
          lab_observaciones_salida: string | null
          lab_puesto_id: number
          lab_recontratable: boolean
          lab_salario_base: number
          lab_salario_real: number
          lab_sucursal_id: number
          lab_tipo_contrato_id: number
          lab_tipo_jornada_id: number
        }
        Insert: {
          lab_created_at?: string
          lab_empleado_id: number
          lab_empresa_id: number
          lab_fecha_fin?: string | null
          lab_fecha_inicio: string
          lab_id?: never
          lab_motivo_salida_id?: number | null
          lab_observaciones_salida?: string | null
          lab_puesto_id: number
          lab_recontratable?: boolean
          lab_salario_base: number
          lab_salario_real: number
          lab_sucursal_id: number
          lab_tipo_contrato_id: number
          lab_tipo_jornada_id: number
        }
        Update: {
          lab_created_at?: string
          lab_empleado_id?: number
          lab_empresa_id?: number
          lab_fecha_fin?: string | null
          lab_fecha_inicio?: string
          lab_id?: never
          lab_motivo_salida_id?: number | null
          lab_observaciones_salida?: string | null
          lab_puesto_id?: number
          lab_recontratable?: boolean
          lab_salario_base?: number
          lab_salario_real?: number
          lab_sucursal_id?: number
          lab_tipo_contrato_id?: number
          lab_tipo_jornada_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_his_lab_empleado_id_fkey"
            columns: ["lab_empleado_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
          {
            foreignKeyName: "sgrh_his_lab_empresa_id_fkey"
            columns: ["lab_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_his_lab_motivo_salida_id_fkey"
            columns: ["lab_motivo_salida_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_motivos_salida"
            referencedColumns: ["mot_id"]
          },
          {
            foreignKeyName: "sgrh_his_lab_puesto_id_fkey"
            columns: ["lab_puesto_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_puestos"
            referencedColumns: ["pue_id"]
          },
          {
            foreignKeyName: "sgrh_his_lab_sucursal_id_fkey"
            columns: ["lab_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
          {
            foreignKeyName: "sgrh_his_lab_tipo_contrato_id_fkey"
            columns: ["lab_tipo_contrato_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_tipos_contrato"
            referencedColumns: ["tco_id"]
          },
          {
            foreignKeyName: "sgrh_his_lab_tipo_jornada_id_fkey"
            columns: ["lab_tipo_jornada_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_tipos_jornada"
            referencedColumns: ["tjo_id"]
          },
        ]
      }
      sgrh_liquidaciones: {
        Row: {
          liq_aguinaldo_proporcional: number
          liq_cesantia: number
          liq_created_at: string
          liq_dias_cesantia: number
          liq_dias_preaviso: number
          liq_dias_trabajados_mes: number
          liq_dias_vacaciones_pendientes: number
          liq_fecha_pago: string | null
          liq_fecha_salida: string
          liq_historial_laboral_id: number
          liq_id: number
          liq_motivo_salida_id: number
          liq_observaciones: string | null
          liq_pagado: boolean
          liq_preaviso: number
          liq_salario_diario: number
          liq_salario_proporcional: number
          liq_total: number
          liq_vacaciones_pagadas: number
        }
        Insert: {
          liq_aguinaldo_proporcional?: number
          liq_cesantia?: number
          liq_created_at?: string
          liq_dias_cesantia?: number
          liq_dias_preaviso?: number
          liq_dias_trabajados_mes?: number
          liq_dias_vacaciones_pendientes?: number
          liq_fecha_pago?: string | null
          liq_fecha_salida: string
          liq_historial_laboral_id: number
          liq_id?: never
          liq_motivo_salida_id: number
          liq_observaciones?: string | null
          liq_pagado?: boolean
          liq_preaviso?: number
          liq_salario_diario: number
          liq_salario_proporcional?: number
          liq_total?: number
          liq_vacaciones_pagadas?: number
        }
        Update: {
          liq_aguinaldo_proporcional?: number
          liq_cesantia?: number
          liq_created_at?: string
          liq_dias_cesantia?: number
          liq_dias_preaviso?: number
          liq_dias_trabajados_mes?: number
          liq_dias_vacaciones_pendientes?: number
          liq_fecha_pago?: string | null
          liq_fecha_salida?: string
          liq_historial_laboral_id?: number
          liq_id?: never
          liq_motivo_salida_id?: number
          liq_observaciones?: string | null
          liq_pagado?: boolean
          liq_preaviso?: number
          liq_salario_diario?: number
          liq_salario_proporcional?: number
          liq_total?: number
          liq_vacaciones_pagadas?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_liquidaciones_liq_historial_laboral_id_fkey"
            columns: ["liq_historial_laboral_id"]
            isOneToOne: true
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_liquidaciones_liq_motivo_salida_id_fkey"
            columns: ["liq_motivo_salida_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_motivos_salida"
            referencedColumns: ["mot_id"]
          },
        ]
      }
      sgrh_marcas_asistencia: {
        Row: {
          mar_created_at: string
          mar_dispositivo_id: string | null
          mar_distancia_geocerca_metros: number | null
          mar_fecha_hora: string
          mar_historial_laboral_id: number
          mar_id: number
          mar_latitud_marcada: number | null
          mar_longitud_marcada: number | null
          mar_metodo_verificacion: string
          mar_observacion: string | null
          mar_registrado_por_id: number | null
          mar_sucursal_id: number
          mar_tipo: string
        }
        Insert: {
          mar_created_at?: string
          mar_dispositivo_id?: string | null
          mar_distancia_geocerca_metros?: number | null
          mar_fecha_hora: string
          mar_historial_laboral_id: number
          mar_id?: never
          mar_latitud_marcada?: number | null
          mar_longitud_marcada?: number | null
          mar_metodo_verificacion: string
          mar_observacion?: string | null
          mar_registrado_por_id?: number | null
          mar_sucursal_id: number
          mar_tipo: string
        }
        Update: {
          mar_created_at?: string
          mar_dispositivo_id?: string | null
          mar_distancia_geocerca_metros?: number | null
          mar_fecha_hora?: string
          mar_historial_laboral_id?: number
          mar_id?: never
          mar_latitud_marcada?: number | null
          mar_longitud_marcada?: number | null
          mar_metodo_verificacion?: string
          mar_observacion?: string | null
          mar_registrado_por_id?: number | null
          mar_sucursal_id?: number
          mar_tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_asi_mar_historial_laboral_id_fkey"
            columns: ["mar_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_asi_mar_registrado_por_id_fkey"
            columns: ["mar_registrado_por_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
          {
            foreignKeyName: "sgrh_asi_mar_sucursal_id_fkey"
            columns: ["mar_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
        ]
      }
      sgrh_nomina_detalle: {
        Row: {
          ndt_created_at: string
          ndt_dias_ausencia_sin_goce: number
          ndt_dias_incapacidad_ccss: number
          ndt_dias_incapacidad_empleador: number
          ndt_fecha_pago: string | null
          ndt_fecha_registro: string
          ndt_historial_laboral_id: number
          ndt_horas_extra_al_50: number
          ndt_horas_extra_al_75: number
          ndt_horas_ordinarias_diurnas: number
          ndt_horas_ordinarias_mixtas: number
          ndt_horas_ordinarias_nocturnas: number
          ndt_id: number
          ndt_nomina_periodo_id: number
          ndt_pagado: boolean
          ndt_salario_bruto: number
          ndt_salario_neto: number
          ndt_salario_por_hora: number
          ndt_total_cargas_patronales: number
          ndt_total_deducciones_obreras: number
        }
        Insert: {
          ndt_created_at?: string
          ndt_dias_ausencia_sin_goce?: number
          ndt_dias_incapacidad_ccss?: number
          ndt_dias_incapacidad_empleador?: number
          ndt_fecha_pago?: string | null
          ndt_fecha_registro: string
          ndt_historial_laboral_id: number
          ndt_horas_extra_al_50?: number
          ndt_horas_extra_al_75?: number
          ndt_horas_ordinarias_diurnas?: number
          ndt_horas_ordinarias_mixtas?: number
          ndt_horas_ordinarias_nocturnas?: number
          ndt_id?: never
          ndt_nomina_periodo_id: number
          ndt_pagado?: boolean
          ndt_salario_bruto?: number
          ndt_salario_neto?: number
          ndt_salario_por_hora?: number
          ndt_total_cargas_patronales?: number
          ndt_total_deducciones_obreras?: number
        }
        Update: {
          ndt_created_at?: string
          ndt_dias_ausencia_sin_goce?: number
          ndt_dias_incapacidad_ccss?: number
          ndt_dias_incapacidad_empleador?: number
          ndt_fecha_pago?: string | null
          ndt_fecha_registro?: string
          ndt_historial_laboral_id?: number
          ndt_horas_extra_al_50?: number
          ndt_horas_extra_al_75?: number
          ndt_horas_ordinarias_diurnas?: number
          ndt_horas_ordinarias_mixtas?: number
          ndt_horas_ordinarias_nocturnas?: number
          ndt_id?: never
          ndt_nomina_periodo_id?: number
          ndt_pagado?: boolean
          ndt_salario_bruto?: number
          ndt_salario_neto?: number
          ndt_salario_por_hora?: number
          ndt_total_cargas_patronales?: number
          ndt_total_deducciones_obreras?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_nom_det_historial_laboral_id_fkey"
            columns: ["ndt_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_nom_det_nomina_periodo_id_fkey"
            columns: ["ndt_nomina_periodo_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_periodo"
            referencedColumns: ["npe_id"]
          },
        ]
      }
      sgrh_nomina_linea_deduccion: {
        Row: {
          ded_base_calculo: number | null
          ded_beneficio_id: number | null
          ded_concepto_id: number
          ded_es_voluntaria: boolean
          ded_id: number
          ded_monto: number
          ded_nomina_detalle_id: number
          ded_observacion: string | null
          ded_porcentaje_aplicado: number | null
        }
        Insert: {
          ded_base_calculo?: number | null
          ded_beneficio_id?: number | null
          ded_concepto_id: number
          ded_es_voluntaria?: boolean
          ded_id?: never
          ded_monto: number
          ded_nomina_detalle_id: number
          ded_observacion?: string | null
          ded_porcentaje_aplicado?: number | null
        }
        Update: {
          ded_base_calculo?: number | null
          ded_beneficio_id?: number | null
          ded_concepto_id?: number
          ded_es_voluntaria?: boolean
          ded_id?: never
          ded_monto?: number
          ded_nomina_detalle_id?: number
          ded_observacion?: string | null
          ded_porcentaje_aplicado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_nom_lin_ded_beneficio_id_fkey"
            columns: ["ded_beneficio_id"]
            isOneToOne: false
            referencedRelation: "sgrh_beneficios_empleado"
            referencedColumns: ["ben_id"]
          },
          {
            foreignKeyName: "sgrh_nom_lin_ded_concepto_id_fkey"
            columns: ["ded_concepto_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_conceptos_nomina"
            referencedColumns: ["con_id"]
          },
          {
            foreignKeyName: "sgrh_nom_lin_ded_nomina_detalle_id_fkey"
            columns: ["ded_nomina_detalle_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
        ]
      }
      sgrh_nomina_linea_ingreso: {
        Row: {
          ing_cantidad: number | null
          ing_concepto_id: number
          ing_id: number
          ing_monto: number
          ing_nomina_detalle_id: number
          ing_observacion: string | null
          ing_tarifa_unitaria: number | null
        }
        Insert: {
          ing_cantidad?: number | null
          ing_concepto_id: number
          ing_id?: never
          ing_monto: number
          ing_nomina_detalle_id: number
          ing_observacion?: string | null
          ing_tarifa_unitaria?: number | null
        }
        Update: {
          ing_cantidad?: number | null
          ing_concepto_id?: number
          ing_id?: never
          ing_monto?: number
          ing_nomina_detalle_id?: number
          ing_observacion?: string | null
          ing_tarifa_unitaria?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_nom_lin_ing_concepto_id_fkey"
            columns: ["ing_concepto_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_conceptos_nomina"
            referencedColumns: ["con_id"]
          },
          {
            foreignKeyName: "sgrh_nom_lin_ing_nomina_detalle_id_fkey"
            columns: ["ing_nomina_detalle_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
        ]
      }
      sgrh_nomina_linea_patronal: {
        Row: {
          pat_base_calculo: number | null
          pat_concepto_id: number
          pat_id: number
          pat_monto: number
          pat_nomina_detalle_id: number
          pat_porcentaje_aplicado: number | null
        }
        Insert: {
          pat_base_calculo?: number | null
          pat_concepto_id: number
          pat_id?: never
          pat_monto: number
          pat_nomina_detalle_id: number
          pat_porcentaje_aplicado?: number | null
        }
        Update: {
          pat_base_calculo?: number | null
          pat_concepto_id?: number
          pat_id?: never
          pat_monto?: number
          pat_nomina_detalle_id?: number
          pat_porcentaje_aplicado?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_nom_lin_pat_concepto_id_fkey"
            columns: ["pat_concepto_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_conceptos_nomina"
            referencedColumns: ["con_id"]
          },
          {
            foreignKeyName: "sgrh_nom_lin_pat_nomina_detalle_id_fkey"
            columns: ["pat_nomina_detalle_id"]
            isOneToOne: false
            referencedRelation: "sgrh_nomina_detalle"
            referencedColumns: ["ndt_id"]
          },
        ]
      }
      sgrh_nomina_periodo: {
        Row: {
          npe_aprobado_por_id: number | null
          npe_created_at: string
          npe_empresa_id: number
          npe_estado: string
          npe_fecha_aprobacion: string | null
          npe_fecha_fin_periodo: string | null
          npe_fecha_inicio_periodo: string | null
          npe_fecha_pago: string | null
          npe_id: number
          npe_observaciones: string | null
          npe_periodo_anio: number
          npe_periodo_mes: number
          npe_quincena: number
          npe_sucursal_id: number
        }
        Insert: {
          npe_aprobado_por_id?: number | null
          npe_created_at?: string
          npe_empresa_id: number
          npe_estado?: string
          npe_fecha_aprobacion?: string | null
          npe_fecha_fin_periodo?: string | null
          npe_fecha_inicio_periodo?: string | null
          npe_fecha_pago?: string | null
          npe_id?: never
          npe_observaciones?: string | null
          npe_periodo_anio: number
          npe_periodo_mes: number
          npe_quincena?: number
          npe_sucursal_id: number
        }
        Update: {
          npe_aprobado_por_id?: number | null
          npe_created_at?: string
          npe_empresa_id?: number
          npe_estado?: string
          npe_fecha_aprobacion?: string | null
          npe_fecha_fin_periodo?: string | null
          npe_fecha_inicio_periodo?: string | null
          npe_fecha_pago?: string | null
          npe_id?: never
          npe_observaciones?: string | null
          npe_periodo_anio?: number
          npe_periodo_mes?: number
          npe_quincena?: number
          npe_sucursal_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_nom_per_aprobado_por_id_fkey"
            columns: ["npe_aprobado_por_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
          {
            foreignKeyName: "sgrh_nom_per_empresa_id_fkey"
            columns: ["npe_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_nom_per_sucursal_id_fkey"
            columns: ["npe_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
        ]
      }
      sgrh_notificaciones: {
        Row: {
          ntf_canal: string
          ntf_created_at: string
          ntf_empleado_id: number | null
          ntf_empresa_id: number | null
          ntf_estado: string
          ntf_fecha_envio: string | null
          ntf_fecha_lectura: string | null
          ntf_id: number
          ntf_intentos: number
          ntf_leida: boolean
          ntf_mensaje: string
          ntf_tipo_notificacion: string
          ntf_titulo: string
          ntf_url_accion: string | null
          ntf_usuario_id: number | null
        }
        Insert: {
          ntf_canal: string
          ntf_created_at?: string
          ntf_empleado_id?: number | null
          ntf_empresa_id?: number | null
          ntf_estado?: string
          ntf_fecha_envio?: string | null
          ntf_fecha_lectura?: string | null
          ntf_id?: never
          ntf_intentos?: number
          ntf_leida?: boolean
          ntf_mensaje: string
          ntf_tipo_notificacion: string
          ntf_titulo: string
          ntf_url_accion?: string | null
          ntf_usuario_id?: number | null
        }
        Update: {
          ntf_canal?: string
          ntf_created_at?: string
          ntf_empleado_id?: number | null
          ntf_empresa_id?: number | null
          ntf_estado?: string
          ntf_fecha_envio?: string | null
          ntf_fecha_lectura?: string | null
          ntf_id?: never
          ntf_intentos?: number
          ntf_leida?: boolean
          ntf_mensaje?: string
          ntf_tipo_notificacion?: string
          ntf_titulo?: string
          ntf_url_accion?: string | null
          ntf_usuario_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_not_ntf_empleado_id_fkey"
            columns: ["ntf_empleado_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
          {
            foreignKeyName: "sgrh_not_ntf_empresa_id_fkey"
            columns: ["ntf_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_not_ntf_usuario_id_fkey"
            columns: ["ntf_usuario_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
        ]
      }
      sgrh_postulacion_etapas: {
        Row: {
          pet_created_at: string
          pet_etapa_id: number
          pet_fecha: string
          pet_id: number
          pet_notas: string | null
          pet_postulacion_id: number
          pet_responsable_id: number | null
          pet_resultado: string | null
        }
        Insert: {
          pet_created_at?: string
          pet_etapa_id: number
          pet_fecha: string
          pet_id?: never
          pet_notas?: string | null
          pet_postulacion_id: number
          pet_responsable_id?: number | null
          pet_resultado?: string | null
        }
        Update: {
          pet_created_at?: string
          pet_etapa_id?: number
          pet_fecha?: string
          pet_id?: never
          pet_notas?: string | null
          pet_postulacion_id?: number
          pet_responsable_id?: number | null
          pet_resultado?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_rec_pet_etapa_id_fkey"
            columns: ["pet_etapa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_etapas_seleccion"
            referencedColumns: ["eta_id"]
          },
          {
            foreignKeyName: "sgrh_rec_pet_postulacion_id_fkey"
            columns: ["pet_postulacion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_postulaciones"
            referencedColumns: ["pos_id"]
          },
          {
            foreignKeyName: "sgrh_rec_pet_responsable_id_fkey"
            columns: ["pet_responsable_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
        ]
      }
      sgrh_postulaciones: {
        Row: {
          pos_candidato_id: number
          pos_created_at: string
          pos_empresa_id: number
          pos_estado_final: string
          pos_fecha_postula: string
          pos_id: number
          pos_observaciones: string | null
          pos_puesto_id: number
          pos_sucursal_id: number | null
        }
        Insert: {
          pos_candidato_id: number
          pos_created_at?: string
          pos_empresa_id: number
          pos_estado_final?: string
          pos_fecha_postula?: string
          pos_id?: never
          pos_observaciones?: string | null
          pos_puesto_id: number
          pos_sucursal_id?: number | null
        }
        Update: {
          pos_candidato_id?: number
          pos_created_at?: string
          pos_empresa_id?: number
          pos_estado_final?: string
          pos_fecha_postula?: string
          pos_id?: never
          pos_observaciones?: string | null
          pos_puesto_id?: number
          pos_sucursal_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_rec_pos_candidato_id_fkey"
            columns: ["pos_candidato_id"]
            isOneToOne: false
            referencedRelation: "sgrh_candidatos"
            referencedColumns: ["cdt_id"]
          },
          {
            foreignKeyName: "sgrh_rec_pos_empresa_id_fkey"
            columns: ["pos_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_rec_pos_puesto_id_fkey"
            columns: ["pos_puesto_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_puestos"
            referencedColumns: ["pue_id"]
          },
          {
            foreignKeyName: "sgrh_rec_pos_sucursal_id_fkey"
            columns: ["pos_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
        ]
      }
      sgrh_programacion_semanal: {
        Row: {
          prg_creado_por_id: number | null
          prg_empleado_id: number
          prg_es_apertura: boolean
          prg_es_cierre: boolean
          prg_es_dia_libre: boolean
          prg_es_feriado: boolean
          prg_fecha: string
          prg_historial_laboral_id: number
          prg_hora_entrada_custom: string | null
          prg_hora_fin_almuerzo_custom: string | null
          prg_hora_fin_break_custom: string | null
          prg_hora_inicio_almuerzo_custom: string | null
          prg_hora_inicio_break_custom: string | null
          prg_hora_salida_custom: string | null
          prg_horario_id: number | null
          prg_id: number
          prg_observaciones: string | null
          prg_sucursal_id: number
        }
        Insert: {
          prg_creado_por_id?: number | null
          prg_empleado_id: number
          prg_es_apertura?: boolean
          prg_es_cierre?: boolean
          prg_es_dia_libre?: boolean
          prg_es_feriado?: boolean
          prg_fecha: string
          prg_historial_laboral_id: number
          prg_hora_entrada_custom?: string | null
          prg_hora_fin_almuerzo_custom?: string | null
          prg_hora_fin_break_custom?: string | null
          prg_hora_inicio_almuerzo_custom?: string | null
          prg_hora_inicio_break_custom?: string | null
          prg_hora_salida_custom?: string | null
          prg_horario_id?: number | null
          prg_id?: never
          prg_observaciones?: string | null
          prg_sucursal_id: number
        }
        Update: {
          prg_creado_por_id?: number | null
          prg_empleado_id?: number
          prg_es_apertura?: boolean
          prg_es_cierre?: boolean
          prg_es_dia_libre?: boolean
          prg_es_feriado?: boolean
          prg_fecha?: string
          prg_historial_laboral_id?: number
          prg_hora_entrada_custom?: string | null
          prg_hora_fin_almuerzo_custom?: string | null
          prg_hora_fin_break_custom?: string | null
          prg_hora_inicio_almuerzo_custom?: string | null
          prg_hora_inicio_break_custom?: string | null
          prg_hora_salida_custom?: string | null
          prg_horario_id?: number | null
          prg_id?: never
          prg_observaciones?: string | null
          prg_sucursal_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_asi_prg_creado_por_id_fkey"
            columns: ["prg_creado_por_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
          {
            foreignKeyName: "sgrh_asi_prg_empleado_id_fkey"
            columns: ["prg_empleado_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
          {
            foreignKeyName: "sgrh_asi_prg_historial_laboral_id_fkey"
            columns: ["prg_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
          {
            foreignKeyName: "sgrh_asi_prg_horario_id_fkey"
            columns: ["prg_horario_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_horarios"
            referencedColumns: ["hor_id"]
          },
          {
            foreignKeyName: "sgrh_asi_prg_sucursal_id_fkey"
            columns: ["prg_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
        ]
      }
      sgrh_provisiones_anuales: {
        Row: {
          pra_aguinaldo_pagado: boolean
          pra_anio: number
          pra_anios_servicio_al_cierre: number | null
          pra_dias_vacaciones_disponibles: number | null
          pra_dias_vacaciones_ganados: number
          pra_dias_vacaciones_usados: number
          pra_fecha_pago_aguinaldo: string | null
          pra_historial_laboral_id: number
          pra_id: number
          pra_monto_acumulado_aguinaldo: number
          pra_monto_acumulado_cesantia: number
          pra_updated_at: string
        }
        Insert: {
          pra_aguinaldo_pagado?: boolean
          pra_anio: number
          pra_anios_servicio_al_cierre?: number | null
          pra_dias_vacaciones_disponibles?: number | null
          pra_dias_vacaciones_ganados?: number
          pra_dias_vacaciones_usados?: number
          pra_fecha_pago_aguinaldo?: string | null
          pra_historial_laboral_id: number
          pra_id?: never
          pra_monto_acumulado_aguinaldo?: number
          pra_monto_acumulado_cesantia?: number
          pra_updated_at?: string
        }
        Update: {
          pra_aguinaldo_pagado?: boolean
          pra_anio?: number
          pra_anios_servicio_al_cierre?: number | null
          pra_dias_vacaciones_disponibles?: number | null
          pra_dias_vacaciones_ganados?: number
          pra_dias_vacaciones_usados?: number
          pra_fecha_pago_aguinaldo?: string | null
          pra_historial_laboral_id?: number
          pra_id?: never
          pra_monto_acumulado_aguinaldo?: number
          pra_monto_acumulado_cesantia?: number
          pra_updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_prv_anu_historial_laboral_id_fkey"
            columns: ["pra_historial_laboral_id"]
            isOneToOne: false
            referencedRelation: "sgrh_historial_laboral"
            referencedColumns: ["lab_id"]
          },
        ]
      }
      sgrh_rol_permisos: {
        Row: {
          rpe_id: number
          rpe_permiso_id: number
          rpe_rol_id: number
        }
        Insert: {
          rpe_id?: never
          rpe_permiso_id: number
          rpe_rol_id: number
        }
        Update: {
          rpe_id?: never
          rpe_permiso_id?: number
          rpe_rol_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_usr_rpe_permiso_id_fkey"
            columns: ["rpe_permiso_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_permisos"
            referencedColumns: ["per_id"]
          },
          {
            foreignKeyName: "sgrh_usr_rpe_rol_id_fkey"
            columns: ["rpe_rol_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_roles"
            referencedColumns: ["rol_id"]
          },
        ]
      }
      sgrh_sucursales: {
        Row: {
          suc_activa: boolean
          suc_codigo_interno: string | null
          suc_created_at: string
          suc_direccion_id: number | null
          suc_email_sucursal: string | null
          suc_empresa_id: number
          suc_id: number
          suc_latitud: number | null
          suc_longitud: number | null
          suc_nombre: string
          suc_radio_geocerca_metros: number
          suc_telefono: string | null
          suc_tolerancia_tardia_minutos: number
        }
        Insert: {
          suc_activa?: boolean
          suc_codigo_interno?: string | null
          suc_created_at?: string
          suc_direccion_id?: number | null
          suc_email_sucursal?: string | null
          suc_empresa_id: number
          suc_id?: never
          suc_latitud?: number | null
          suc_longitud?: number | null
          suc_nombre: string
          suc_radio_geocerca_metros?: number
          suc_telefono?: string | null
          suc_tolerancia_tardia_minutos?: number
        }
        Update: {
          suc_activa?: boolean
          suc_codigo_interno?: string | null
          suc_created_at?: string
          suc_direccion_id?: number | null
          suc_email_sucursal?: string | null
          suc_empresa_id?: number
          suc_id?: never
          suc_latitud?: number | null
          suc_longitud?: number | null
          suc_nombre?: string
          suc_radio_geocerca_metros?: number
          suc_telefono?: string | null
          suc_tolerancia_tardia_minutos?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_org_suc_empresa_id_fkey"
            columns: ["suc_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_sucursales_suc_direccion_id_fkey"
            columns: ["suc_direccion_id"]
            isOneToOne: false
            referencedRelation: "sgrh_direcciones"
            referencedColumns: ["dir_id"]
          },
        ]
      }
      sgrh_usuarios: {
        Row: {
          usr_activo: boolean
          usr_auth_id: string | null
          usr_created_at: string
          usr_email: string
          usr_empleado_id: number | null
          usr_id: number
          usr_password_hash: string
          usr_ultimo_acceso: string | null
        }
        Insert: {
          usr_activo?: boolean
          usr_auth_id?: string | null
          usr_created_at?: string
          usr_email: string
          usr_empleado_id?: number | null
          usr_id?: never
          usr_password_hash: string
          usr_ultimo_acceso?: string | null
        }
        Update: {
          usr_activo?: boolean
          usr_auth_id?: string | null
          usr_created_at?: string
          usr_email?: string
          usr_empleado_id?: number | null
          usr_id?: never
          usr_password_hash?: string
          usr_ultimo_acceso?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_usr_empleado_id_fkey"
            columns: ["usr_empleado_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empleados"
            referencedColumns: ["emp_id"]
          },
        ]
      }
      sgrh_usuarios_empresa_rol: {
        Row: {
          uer_activo: boolean
          uer_created_at: string
          uer_empresa_id: number
          uer_id: number
          uer_rol_id: number
          uer_sucursal_id: number | null
          uer_usuario_id: number
        }
        Insert: {
          uer_activo?: boolean
          uer_created_at?: string
          uer_empresa_id: number
          uer_id?: never
          uer_rol_id: number
          uer_sucursal_id?: number | null
          uer_usuario_id: number
        }
        Update: {
          uer_activo?: boolean
          uer_created_at?: string
          uer_empresa_id?: number
          uer_id?: never
          uer_rol_id?: number
          uer_sucursal_id?: number | null
          uer_usuario_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "sgrh_usr_uer_empresa_id_fkey"
            columns: ["uer_empresa_id"]
            isOneToOne: false
            referencedRelation: "sgrh_empresas"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "sgrh_usr_uer_rol_id_fkey"
            columns: ["uer_rol_id"]
            isOneToOne: false
            referencedRelation: "sgrh_cat_roles"
            referencedColumns: ["rol_id"]
          },
          {
            foreignKeyName: "sgrh_usr_uer_sucursal_id_fkey"
            columns: ["uer_sucursal_id"]
            isOneToOne: false
            referencedRelation: "sgrh_sucursales"
            referencedColumns: ["suc_id"]
          },
          {
            foreignKeyName: "sgrh_usr_uer_usuario_id_fkey"
            columns: ["uer_usuario_id"]
            isOneToOne: false
            referencedRelation: "sgrh_usuarios"
            referencedColumns: ["usr_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      crear_empleado_completo: {
        Args: {
          p_contratacion: Json
          p_datos_pago?: Json
          p_direccion?: Json
          p_empleado: Json
        }
        Returns: number
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_emp_id: { Args: never; Returns: number }
      get_empresa_id: { Args: never; Returns: number }
      get_rol: { Args: never; Returns: string }
      get_usr_id: { Args: never; Returns: number }
      tiene_permiso: { Args: { p_codigo: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
