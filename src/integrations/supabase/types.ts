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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      case_attachments: {
        Row: {
          created_at: string
          demand_id: string
          filename: string
          id: string
          mime_type: string
          path: string
          size_bytes: number
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          demand_id: string
          filename: string
          id?: string
          mime_type: string
          path: string
          size_bytes: number
          uploaded_by: string
        }
        Update: {
          created_at?: string
          demand_id?: string
          filename?: string
          id?: string
          mime_type?: string
          path?: string
          size_bytes?: number
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_attachments_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demand_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_attachments_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_messages: {
        Row: {
          author_id: string
          author_name: string
          body: string
          created_at: string
          demand_id: string
          id: string
        }
        Insert: {
          author_id: string
          author_name: string
          body: string
          created_at?: string
          demand_id: string
          id?: string
        }
        Update: {
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          demand_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_messages_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demand_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_messages_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
        ]
      }
      changelog: {
        Row: {
          approved: boolean
          client_id: string | null
          code: string | null
          created_at: string
          demand_id: string | null
          description: string | null
          files: string | null
          id: string
          is_test: boolean
          kind: string | null
          notes: string | null
          notion_id: string | null
          notion_raw: Json | null
          occurred_at: string | null
          owner_id: string | null
          published_at: string | null
          release_version: string | null
          result: string | null
          source_date_precision: Json
          tests_run: string | null
          title: string
          tool: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approved?: boolean
          client_id?: string | null
          code?: string | null
          created_at?: string
          demand_id?: string | null
          description?: string | null
          files?: string | null
          id?: string
          is_test?: boolean
          kind?: string | null
          notes?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          occurred_at?: string | null
          owner_id?: string | null
          published_at?: string | null
          release_version?: string | null
          result?: string | null
          source_date_precision?: Json
          tests_run?: string | null
          title: string
          tool?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approved?: boolean
          client_id?: string | null
          code?: string | null
          created_at?: string
          demand_id?: string | null
          description?: string | null
          files?: string | null
          id?: string
          is_test?: boolean
          kind?: string | null
          notes?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          occurred_at?: string | null
          owner_id?: string | null
          published_at?: string | null
          release_version?: string | null
          result?: string | null
          source_date_precision?: Json
          tests_run?: string | null
          title?: string
          tool?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "changelog_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changelog_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demand_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changelog_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changelog_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_registration_requests: {
        Row: {
          created_at: string
          notion_page_id: string | null
          payload_hash: string
          request_id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          notion_page_id?: string | null
          payload_hash: string
          request_id: string
          state?: string
          user_id: string
        }
        Update: {
          created_at?: string
          notion_page_id?: string | null
          payload_hash?: string
          request_id?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          code: string
          company_email: string | null
          company_phone: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          empresa: string | null
          erp_id: string | null
          erp_slug: string | null
          id: string
          is_test: boolean
          name: string
          notes: string | null
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          plan: string | null
          product_id: string | null
          sales_customer_ref: string | null
          segments: string[]
          status: string | null
          updated_at: string
          version: number
          whatsapp: string | null
          whatsapp_group_url: string | null
        }
        Insert: {
          code?: string
          company_email?: string | null
          company_phone?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          empresa?: string | null
          erp_id?: string | null
          erp_slug?: string | null
          id?: string
          is_test?: boolean
          name: string
          notes?: string | null
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          owner_id?: string | null
          plan?: string | null
          product_id?: string | null
          sales_customer_ref?: string | null
          segments?: string[]
          status?: string | null
          updated_at?: string
          version?: number
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Update: {
          code?: string
          company_email?: string | null
          company_phone?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          empresa?: string | null
          erp_id?: string | null
          erp_slug?: string | null
          id?: string
          is_test?: boolean
          name?: string
          notes?: string | null
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          owner_id?: string | null
          plan?: string | null
          product_id?: string | null
          sales_customer_ref?: string | null
          segments?: string[]
          status?: string | null
          updated_at?: string
          version?: number
          whatsapp?: string | null
          whatsapp_group_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_requests: {
        Row: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          change_summary: string | null
          context: string
          created_at: string
          delivery_eta: string | null
          demand_id: string
          deployment_ref: string | null
          forecast_reason: string | null
          id: string
          next_update_at: string | null
          published_at: string | null
          rejection_reason: string | null
          repository_url: string | null
          requested_by: string | null
          technical: boolean
          technical_result: string | null
          technical_stage: string
          technician_id: string | null
          tests_result: string | null
          updated_at: string
          version: number
        }
        Insert: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          change_summary?: string | null
          context?: string
          created_at?: string
          delivery_eta?: string | null
          demand_id: string
          deployment_ref?: string | null
          forecast_reason?: string | null
          id?: string
          next_update_at?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          repository_url?: string | null
          requested_by?: string | null
          technical?: boolean
          technical_result?: string | null
          technical_stage?: string
          technician_id?: string | null
          tests_result?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          change_summary?: string | null
          context?: string
          created_at?: string
          delivery_eta?: string | null
          demand_id?: string
          deployment_ref?: string | null
          forecast_reason?: string | null
          id?: string
          next_update_at?: string | null
          published_at?: string | null
          rejection_reason?: string | null
          repository_url?: string | null
          requested_by?: string | null
          technical?: boolean
          technical_result?: string | null
          technical_stage?: string
          technician_id?: string | null
          tests_result?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "delivery_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: true
            referencedRelation: "demand_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: true
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_requests_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      demands: {
        Row: {
          approval_repository_url: string | null
          cancel_reason: string | null
          canceled_at: string | null
          channel: string | null
          classification: string | null
          client_id: string | null
          client_informed: boolean
          client_validated: boolean
          code: string
          completed_at: string | null
          complexity: string | null
          context: string | null
          created_at: string
          description: string | null
          due_date: string | null
          first_response_at: string | null
          first_response_due: string | null
          forwarded_at: string | null
          id: string
          impact: string | null
          is_test: boolean
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          policy_delivery_due: string | null
          priority: string
          published_at: string | null
          received_at: string | null
          resolution_due: string | null
          sla_start_at: string | null
          solution: string | null
          source_date_precision: Json
          stage: string
          technical_type: string | null
          test_result: string | null
          tests_run: string | null
          title: string
          updated_at: string
          validated_at: string | null
          version: number
        }
        Insert: {
          approval_repository_url?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          channel?: string | null
          classification?: string | null
          client_id?: string | null
          client_informed?: boolean
          client_validated?: boolean
          code?: string
          completed_at?: string | null
          complexity?: string | null
          context?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          first_response_at?: string | null
          first_response_due?: string | null
          forwarded_at?: string | null
          id?: string
          impact?: string | null
          is_test?: boolean
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          owner_id?: string | null
          policy_delivery_due?: string | null
          priority?: string
          published_at?: string | null
          received_at?: string | null
          resolution_due?: string | null
          sla_start_at?: string | null
          solution?: string | null
          source_date_precision?: Json
          stage?: string
          technical_type?: string | null
          test_result?: string | null
          tests_run?: string | null
          title: string
          updated_at?: string
          validated_at?: string | null
          version?: number
        }
        Update: {
          approval_repository_url?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          channel?: string | null
          classification?: string | null
          client_id?: string | null
          client_informed?: boolean
          client_validated?: boolean
          code?: string
          completed_at?: string | null
          complexity?: string | null
          context?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          first_response_at?: string | null
          first_response_due?: string | null
          forwarded_at?: string | null
          id?: string
          impact?: string | null
          is_test?: boolean
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          owner_id?: string | null
          policy_delivery_due?: string | null
          priority?: string
          published_at?: string | null
          received_at?: string | null
          resolution_due?: string | null
          sla_start_at?: string | null
          solution?: string | null
          source_date_precision?: Json
          stage?: string
          technical_type?: string | null
          test_result?: string | null
          tests_run?: string | null
          title?: string
          updated_at?: string
          validated_at?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "demands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_issues: {
        Row: {
          created_at: string
          detail: string | null
          id: string
          kind: string
          notion_id: string | null
          resolved_at: string | null
          run_id: string | null
          source: string
        }
        Insert: {
          created_at?: string
          detail?: string | null
          id?: string
          kind: string
          notion_id?: string | null
          resolved_at?: string | null
          run_id?: string | null
          source: string
        }
        Update: {
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          notion_id?: string | null
          resolved_at?: string | null
          run_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_issues_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "import_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          actor_id: string | null
          finished_at: string | null
          id: string
          report: Json | null
          started_at: string
          status: string
        }
        Insert: {
          actor_id?: string | null
          finished_at?: string | null
          id?: string
          report?: Json | null
          started_at?: string
          status: string
        }
        Update: {
          actor_id?: string | null
          finished_at?: string | null
          id?: string
          report?: Json | null
          started_at?: string
          status?: string
        }
        Relationships: []
      }
      interactions: {
        Row: {
          channel: string | null
          client_id: string | null
          code: string | null
          created_at: string
          decision: string | null
          demand_id: string | null
          id: string
          is_test: boolean
          next_action: string | null
          notion_id: string | null
          notion_raw: Json | null
          occurred_at: string | null
          owner_id: string | null
          problem: string | null
          source_date_precision: Json
          summary: string
          updated_at: string
          version: number
        }
        Insert: {
          channel?: string | null
          client_id?: string | null
          code?: string | null
          created_at?: string
          decision?: string | null
          demand_id?: string | null
          id?: string
          is_test?: boolean
          next_action?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          occurred_at?: string | null
          owner_id?: string | null
          problem?: string | null
          source_date_precision?: Json
          summary: string
          updated_at?: string
          version?: number
        }
        Update: {
          channel?: string | null
          client_id?: string | null
          code?: string | null
          created_at?: string
          decision?: string | null
          demand_id?: string | null
          id?: string
          is_test?: boolean
          next_action?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          occurred_at?: string | null
          owner_id?: string | null
          problem?: string | null
          source_date_precision?: Json
          summary?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "interactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demand_sla"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_demand_id_fkey"
            columns: ["demand_id"]
            isOneToOne: false
            referencedRelation: "demands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interactions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          detail: Json | null
          id: number
          job: string
          ok: boolean
          ran_at: string
        }
        Insert: {
          detail?: Json | null
          id?: number
          job: string
          ok: boolean
          ran_at?: string
        }
        Update: {
          detail?: Json | null
          id?: number
          job?: string
          ok?: boolean
          ran_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          deadline: string
          entity_id: string
          entity_type: string
          id: string
          level: string
          link: string
          obligation: string
          read_at: string | null
          recipient_id: string
          rule_version: number
          superseded_at: string | null
          title: string
        }
        Insert: {
          created_at?: string
          deadline: string
          entity_id: string
          entity_type: string
          id?: string
          level: string
          link: string
          obligation: string
          read_at?: string | null
          recipient_id: string
          rule_version?: number
          superseded_at?: string | null
          title: string
        }
        Update: {
          created_at?: string
          deadline?: string
          entity_id?: string
          entity_type?: string
          id?: string
          level?: string
          link?: string
          obligation?: string
          read_at?: string | null
          recipient_id?: string
          rule_version?: number
          superseded_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboardings: {
        Row: {
          client_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          current_step: string
          expected_date: string | null
          id: string
          info_complete_at: string | null
          is_test: boolean
          limit15_due: string | null
          milestone5_due: string | null
          notes: string | null
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          progress: number | null
          source_date_precision: Json
          stage: string
          started_at: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          client_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          current_step?: string
          expected_date?: string | null
          id?: string
          info_complete_at?: string | null
          is_test?: boolean
          limit15_due?: string | null
          milestone5_due?: string | null
          notes?: string | null
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          owner_id?: string | null
          progress?: number | null
          source_date_precision?: Json
          stage?: string
          started_at?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string | null
          code?: string
          completed_at?: string | null
          created_at?: string
          current_step?: string
          expected_date?: string | null
          id?: string
          info_complete_at?: string | null
          is_test?: boolean
          limit15_due?: string | null
          milestone5_due?: string | null
          notes?: string | null
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          owner_id?: string | null
          progress?: number | null
          source_date_precision?: Json
          stage?: string
          started_at?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboardings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboardings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          annual_monthly_value: number
          description: string
          id: string
          monthly_value: number
          name: string
          updated_at: string
          version: number
        }
        Insert: {
          active?: boolean
          annual_monthly_value: number
          description?: string
          id?: string
          monthly_value: number
          name: string
          updated_at?: string
          version?: number
        }
        Update: {
          active?: boolean
          annual_monthly_value?: number
          description?: string
          id?: string
          monthly_value?: number
          name?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          avatar_url: string | null
          commission_eligible: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          notion_user_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          avatar_url?: string | null
          commission_eligible?: boolean
          created_at?: string
          email: string
          full_name: string
          id: string
          notion_user_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          avatar_url?: string | null
          commission_eligible?: boolean
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          notion_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_intake_receipts: {
        Row: {
          client_id: string
          onboarding_id: string
          payload_hash: string
          received_at: string
          sale_id: string
          source_company_id: string
        }
        Insert: {
          client_id: string
          onboarding_id: string
          payload_hash: string
          received_at?: string
          sale_id: string
          source_company_id: string
        }
        Update: {
          client_id?: string
          onboarding_id?: string
          payload_hash?: string
          received_at?: string
          sale_id?: string
          source_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_intake_receipts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_intake_receipts_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_tasks: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string
          id: string
          notes: string
          record_id: string | null
          record_kind: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_at: string
          id: string
          notes?: string
          record_id?: string | null
          record_kind?: string | null
          status?: string
          task_type: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string
          id?: string
          notes?: string
          record_id?: string | null
          record_kind?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          category: string
          delivery_basis: string
          delivery_unit: string
          delivery_value: number | null
          resolution_basis: string
          resolution_unit: string
          resolution_value: number
          response_basis: string
          response_unit: string
          response_value: number
          updated_at: string
          version: number
        }
        Insert: {
          category: string
          delivery_basis?: string
          delivery_unit?: string
          delivery_value?: number | null
          resolution_basis?: string
          resolution_unit?: string
          resolution_value?: number
          response_basis?: string
          response_unit?: string
          response_value?: number
          updated_at?: string
          version?: number
        }
        Update: {
          category?: string
          delivery_basis?: string
          delivery_unit?: string
          delivery_value?: number | null
          resolution_basis?: string
          resolution_unit?: string
          resolution_value?: number
          response_basis?: string
          response_unit?: string
          response_value?: number
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      sync_snapshots: {
        Row: {
          key: string
          last_attempt_at: string | null
          last_error: string | null
          last_success_at: string | null
          payload: Json | null
          updated_at: string
        }
        Insert: {
          key: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          payload?: Json | null
          updated_at?: string
        }
        Update: {
          key?: string
          last_attempt_at?: string | null
          last_error?: string | null
          last_success_at?: string | null
          payload?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      upgrades: {
        Row: {
          accepted_at: string | null
          client_id: string | null
          code: string
          commission_eligible_at_effective: boolean | null
          commission_owner_id: string | null
          commission_paid: boolean
          created_at: string
          current_plan: string | null
          current_value: number | null
          effective_at: string | null
          id: string
          is_test: boolean
          lost_at: string | null
          need: string | null
          new_plan: string | null
          new_value: number | null
          notes: string | null
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          opportunity_at: string | null
          owner_id: string | null
          source_date_precision: Json
          stage: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          accepted_at?: string | null
          client_id?: string | null
          code?: string
          commission_eligible_at_effective?: boolean | null
          commission_owner_id?: string | null
          commission_paid?: boolean
          created_at?: string
          current_plan?: string | null
          current_value?: number | null
          effective_at?: string | null
          id?: string
          is_test?: boolean
          lost_at?: string | null
          need?: string | null
          new_plan?: string | null
          new_value?: number | null
          notes?: string | null
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          opportunity_at?: string | null
          owner_id?: string | null
          source_date_precision?: Json
          stage?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          accepted_at?: string | null
          client_id?: string | null
          code?: string
          commission_eligible_at_effective?: boolean | null
          commission_owner_id?: string | null
          commission_paid?: boolean
          created_at?: string
          current_plan?: string | null
          current_value?: number | null
          effective_at?: string | null
          id?: string
          is_test?: boolean
          lost_at?: string | null
          need?: string | null
          new_plan?: string | null
          new_value?: number | null
          notes?: string | null
          notion_code?: string | null
          notion_id?: string | null
          notion_raw?: Json | null
          opportunity_at?: string | null
          owner_id?: string | null
          source_date_precision?: Json
          stage?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "upgrades_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upgrades_commission_owner_id_fkey"
            columns: ["commission_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "upgrades_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflow_history: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          details: Json | null
          entity_id: string
          entity_type: string
          from_value: string | null
          id: string
          to_value: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          at?: string
          details?: Json | null
          entity_id: string
          entity_type: string
          from_value?: string | null
          id?: string
          to_value?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          details?: Json | null
          entity_id?: string
          entity_type?: string
          from_value?: string | null
          id?: string
          to_value?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      demand_sla: {
        Row: {
          client_id: string | null
          delivery_due: string | null
          delivery_state: string | null
          first_response_due: string | null
          first_response_state: string | null
          id: string | null
          is_test: boolean | null
          owner_id: string | null
          resolution_due: string | null
          resolution_state: string | null
        }
        Insert: {
          client_id?: string | null
          delivery_due?: never
          delivery_state?: never
          first_response_due?: string | null
          first_response_state?: never
          id?: string | null
          is_test?: boolean | null
          owner_id?: string | null
          resolution_due?: string | null
          resolution_state?: never
        }
        Update: {
          client_id?: string | null
          delivery_due?: never
          delivery_state?: never
          first_response_due?: string | null
          first_response_state?: never
          id?: string | null
          is_test?: boolean | null
          owner_id?: string | null
          resolution_due?: string | null
          resolution_state?: never
        }
        Relationships: [
          {
            foreignKeyName: "demands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demands_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      upgrade_commission: {
        Row: {
          commission_due: number | null
          commission_expected: number | null
          id: string | null
          owner_id: string | null
          payment_expected: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upgrades_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_edit_member_profile: {
        Args: {
          _active: boolean
          _avatar: string
          _commission: boolean
          _id: string
          _name: string
          _role: string
        }
        Returns: undefined
      }
      admin_update_member: {
        Args: {
          _active: boolean
          _commission: boolean
          _id: string
          _role: string
        }
        Returns: undefined
      }
      assign_client: {
        Args: { _id: string; _owner: string; _version: number }
        Returns: undefined
      }
      can_manage_case: {
        Args: { _demand: string; _uid: string }
        Returns: boolean
      }
      can_read_case: {
        Args: { _demand: string; _uid: string }
        Returns: boolean
      }
      case_notice: {
        Args: { _demand: string; _message: string; _technical?: boolean }
        Returns: undefined
      }
      case_object_demand: { Args: { _path: string }; Returns: string }
      claim_record: {
        Args: {
          _id: string
          _kind: string
          _release?: boolean
          _version: number
        }
        Returns: Json
      }
      configured_due: {
        Args: { _basis: string; _start: string; _unit: string; _value: number }
        Returns: string
      }
      contract_calendar: { Args: never; Returns: Json }
      delivery_action: {
        Args: {
          _action: string
          _data?: Json
          _demand: string
          _version: number
        }
        Returns: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          change_summary: string | null
          context: string
          created_at: string
          delivery_eta: string | null
          demand_id: string
          deployment_ref: string | null
          forecast_reason: string | null
          id: string
          next_update_at: string | null
          published_at: string | null
          rejection_reason: string | null
          repository_url: string | null
          requested_by: string | null
          technical: boolean
          technical_result: string | null
          technical_stage: string
          technician_id: string | null
          tests_result: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "delivery_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delivery_action_core: {
        Args: {
          _action: string
          _data?: Json
          _demand: string
          _version: number
        }
        Returns: {
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          change_summary: string | null
          context: string
          created_at: string
          delivery_eta: string | null
          demand_id: string
          deployment_ref: string | null
          forecast_reason: string | null
          id: string
          next_update_at: string | null
          published_at: string | null
          rejection_reason: string | null
          repository_url: string | null
          requested_by: string | null
          technical: boolean
          technical_result: string | null
          technical_stage: string
          technician_id: string | null
          tests_result: string | null
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "delivery_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delivery_deadline_tick: { Args: never; Returns: number }
      demand_stage_trace: { Args: { _demand: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_notion_bundle: {
        Args: { _actor: string; _bundle: Json }
        Returns: Json
      }
      is_active_user: { Args: { _uid: string }; Returns: boolean }
      is_admin: { Args: { _uid: string }; Returns: boolean }
      is_cs: { Args: { _uid: string }; Returns: boolean }
      is_internal: { Args: { _user_id: string }; Returns: boolean }
      is_operator: { Args: { _uid: string }; Returns: boolean }
      is_technical: { Args: { _uid: string }; Returns: boolean }
      is_workspace_user: { Args: { _uid: string }; Returns: boolean }
      policy_due: {
        Args: { _category: string; _obligation: string; _start: string }
        Returns: string
      }
      policy_risk_start: {
        Args: { _category: string; _due: string; _obligation: string }
        Returns: string
      }
      policy_sla_state: {
        Args: {
          _category: string
          _closed: boolean
          _done: string
          _due: string
          _obligation: string
        }
        Returns: string
      }
      post_case_message: {
        Args: { _body: string; _demand: string }
        Returns: {
          author_id: string
          author_name: string
          body: string
          created_at: string
          demand_id: string
          id: string
        }
        SetofOptions: {
          from: "*"
          to: "case_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      provision_member: {
        Args: {
          _actor: string
          _email: string
          _id: string
          _name: string
          _role: string
        }
        Returns: undefined
      }
      provision_member_profile: {
        Args: {
          _actor: string
          _avatar: string
          _email: string
          _id: string
          _name: string
          _role: string
        }
        Returns: undefined
      }
      receive_ikaros_sale: {
        Args: {
          _company: string
          _contact_name?: string
          _customer: string
          _email?: string
          _erp_id?: string
          _hash: string
          _name: string
          _phone?: string
          _sale: string
          _sold_at: string
        }
        Returns: Json
      }
      register_case_file: {
        Args: {
          _demand: string
          _filename: string
          _mime: string
          _path: string
          _size: number
        }
        Returns: {
          created_at: string
          demand_id: string
          filename: string
          id: string
          mime_type: string
          path: string
          size_bytes: number
          uploaded_by: string
        }
        SetofOptions: {
          from: "*"
          to: "case_attachments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_import_issue: {
        Args: { _client: string; _issue: string }
        Returns: undefined
      }
      save_product: {
        Args: {
          _active: boolean
          _annual: number
          _description: string
          _id: string
          _monthly: number
          _name: string
          _version: number
        }
        Returns: {
          active: boolean
          annual_monthly_value: number
          description: string
          id: string
          monthly_value: number
          name: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_scheduled_task: {
        Args: {
          _client: string
          _due: string
          _id: string
          _kind?: string
          _notes: string
          _record?: string
          _status?: string
          _title: string
          _type: string
          _version?: number
        }
        Returns: {
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string
          id: string
          notes: string
          record_id: string | null
          record_kind: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "scheduled_tasks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_sla_policy: {
        Args: { _category: string; _rules: Json; _version: number }
        Returns: Json
      }
      set_sla_risk_window: { Args: { _minutes: number }; Returns: undefined }
      sla_add_business_minutes: {
        Args: { mins: number; ts: string }
        Returns: string
      }
      sla_easter: { Args: { y: number }; Returns: string }
      sla_is_workday: { Args: { d: string }; Returns: boolean }
      sla_next_business_day: { Args: { ts: string }; Returns: string }
      sla_next_workday: { Args: { d: string }; Returns: string }
      sla_normalize: { Args: { ts: string }; Returns: string }
      sla_onboarding_due: { Args: { n: number; ts: string }; Returns: string }
      sla_prev_workday: { Args: { d: string }; Returns: string }
      sla_risk_minutes: { Args: never; Returns: number }
      sla_state: {
        Args: { closed: boolean; done_at: string; due: string }
        Returns: string
      }
      sla_sub_business_minutes: {
        Args: { mins: number; ts: string }
        Returns: string
      }
      sla_tick: { Args: never; Returns: number }
      submit_demand_validation: {
        Args: { _id: string; _version: number }
        Returns: {
          approval_repository_url: string | null
          cancel_reason: string | null
          canceled_at: string | null
          channel: string | null
          classification: string | null
          client_id: string | null
          client_informed: boolean
          client_validated: boolean
          code: string
          completed_at: string | null
          complexity: string | null
          context: string | null
          created_at: string
          description: string | null
          due_date: string | null
          first_response_at: string | null
          first_response_due: string | null
          forwarded_at: string | null
          id: string
          impact: string | null
          is_test: boolean
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          policy_delivery_due: string | null
          priority: string
          published_at: string | null
          received_at: string | null
          resolution_due: string | null
          sla_start_at: string | null
          solution: string | null
          source_date_precision: Json
          stage: string
          technical_type: string | null
          test_result: string | null
          tests_run: string | null
          title: string
          updated_at: string
          validated_at: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "demands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      task_reminder_tick: { Args: never; Returns: number }
      technical_queue: { Args: never; Returns: Json }
      transition_demand: {
        Args: {
          _action: string
          _id: string
          _reason?: string
          _stage?: string
          _version: number
        }
        Returns: {
          approval_repository_url: string | null
          cancel_reason: string | null
          canceled_at: string | null
          channel: string | null
          classification: string | null
          client_id: string | null
          client_informed: boolean
          client_validated: boolean
          code: string
          completed_at: string | null
          complexity: string | null
          context: string | null
          created_at: string
          description: string | null
          due_date: string | null
          first_response_at: string | null
          first_response_due: string | null
          forwarded_at: string | null
          id: string
          impact: string | null
          is_test: boolean
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          policy_delivery_due: string | null
          priority: string
          published_at: string | null
          received_at: string | null
          resolution_due: string | null
          sla_start_at: string | null
          solution: string | null
          source_date_precision: Json
          stage: string
          technical_type: string | null
          test_result: string | null
          tests_run: string | null
          title: string
          updated_at: string
          validated_at: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "demands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_demand_core: {
        Args: {
          _action: string
          _id: string
          _reason?: string
          _stage?: string
          _version: number
        }
        Returns: {
          approval_repository_url: string | null
          cancel_reason: string | null
          canceled_at: string | null
          channel: string | null
          classification: string | null
          client_id: string | null
          client_informed: boolean
          client_validated: boolean
          code: string
          completed_at: string | null
          complexity: string | null
          context: string | null
          created_at: string
          description: string | null
          due_date: string | null
          first_response_at: string | null
          first_response_due: string | null
          forwarded_at: string | null
          id: string
          impact: string | null
          is_test: boolean
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          policy_delivery_due: string | null
          priority: string
          published_at: string | null
          received_at: string | null
          resolution_due: string | null
          sla_start_at: string | null
          solution: string | null
          source_date_precision: Json
          stage: string
          technical_type: string | null
          test_result: string | null
          tests_run: string | null
          title: string
          updated_at: string
          validated_at: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "demands"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_onboarding: {
        Args: {
          _action: string
          _id: string
          _stage?: string
          _version: number
        }
        Returns: {
          client_id: string | null
          code: string
          completed_at: string | null
          created_at: string
          current_step: string
          expected_date: string | null
          id: string
          info_complete_at: string | null
          is_test: boolean
          limit15_due: string | null
          milestone5_due: string | null
          notes: string | null
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          owner_id: string | null
          progress: number | null
          source_date_precision: Json
          stage: string
          started_at: string | null
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "onboardings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_upgrade: {
        Args: {
          _action: string
          _id: string
          _stage?: string
          _version: number
        }
        Returns: {
          accepted_at: string | null
          client_id: string | null
          code: string
          commission_eligible_at_effective: boolean | null
          commission_owner_id: string | null
          commission_paid: boolean
          created_at: string
          current_plan: string | null
          current_value: number | null
          effective_at: string | null
          id: string
          is_test: boolean
          lost_at: string | null
          need: string | null
          new_plan: string | null
          new_value: number | null
          notes: string | null
          notion_code: string | null
          notion_id: string | null
          notion_raw: Json | null
          opportunity_at: string | null
          owner_id: string | null
          source_date_precision: Json
          stage: string
          title: string
          updated_at: string
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "upgrades"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role: "admin" | "viewer" | "cs" | "technical"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "viewer", "cs", "technical"],
    },
  },
} as const
