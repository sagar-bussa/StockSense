/**
 * GENERATED FILE - DO NOT EDIT BY HAND.
 *
 * Regenerate with:
 *
 *   node scripts/gen-types.mjs
 *
 * Built by applying supabase/migrations to PGlite and reading the Postgres
 * system catalogs, so these types always match the schema the migrations
 * produce. `npm run db:types:check` fails if this file drifts.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      adjustments: {
        Row: {
          id: string;
          adjustment_number: string;
          product_id: string;
          warehouse_id: string;
          location_id: string;
          system_quantity: number;
          counted_quantity: number;
          difference: number | null;
          reason: Database['public']['Enums']['adjustment_reason'];
          notes: string | null;
          status: Database['public']['Enums']['doc_status'];
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          created_at: string;
          updated_at: string
        }
        Insert: {
          adjustment_number: string;
          product_id: string;
          warehouse_id: string;
          location_id: string;
          system_quantity: number;
          counted_quantity: number;
          difference: number | null;
          reason: Database['public']['Enums']['adjustment_reason'];
          notes: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null
        }
        Update: {
          id?: string;
          adjustment_number?: string;
          product_id?: string;
          warehouse_id?: string;
          location_id?: string;
          system_quantity?: number;
          counted_quantity?: number;
          difference?: number | null;
          reason?: Database['public']['Enums']['adjustment_reason'];
          notes?: string | null;
          status?: Database['public']['Enums']['doc_status'];
          created_by?: string | null;
          validated_by?: string | null;
          validated_at?: string | null;
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          color: string | null;
          status: Database['public']['Enums']['entity_status'];
          created_by: string | null;
          created_at: string;
          updated_at: string
        }
        Insert: {
          name: string;
          description: string | null;
          color: string | null;
          created_by: string | null
        }
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          color?: string | null;
          status?: Database['public']['Enums']['entity_status'];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          id: string;
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          country: string | null;
          notes: string | null;
          status: Database['public']['Enums']['entity_status'];
          created_at: string;
          updated_at: string
        }
        Insert: {
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          country: string | null;
          notes: string | null
        }
        Update: {
          id?: string;
          name?: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          country?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['entity_status'];
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      deliveries: {
        Row: {
          id: string;
          delivery_number: string;
          customer_id: string;
          warehouse_id: string;
          location_id: string;
          reference: string | null;
          notes: string | null;
          status: Database['public']['Enums']['doc_status'];
          expected_at: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          canceled_by: string | null;
          canceled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string
        }
        Insert: {
          delivery_number: string;
          customer_id: string;
          warehouse_id: string;
          location_id: string;
          reference: string | null;
          notes: string | null;
          expected_at: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          canceled_by: string | null;
          canceled_at: string | null;
          cancel_reason: string | null
        }
        Update: {
          id?: string;
          delivery_number?: string;
          customer_id?: string;
          warehouse_id?: string;
          location_id?: string;
          reference?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['doc_status'];
          expected_at?: string | null;
          created_by?: string | null;
          validated_by?: string | null;
          validated_at?: string | null;
          canceled_by?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      delivery_items: {
        Row: {
          id: string;
          delivery_id: string;
          product_id: string;
          location_id: string;
          quantity: number;
          unit_price: number | null;
          notes: string | null;
          created_at: string
        }
        Insert: {
          delivery_id: string;
          product_id: string;
          location_id: string;
          quantity: number;
          unit_price: number | null;
          notes: string | null
        }
        Update: {
          id?: string;
          delivery_id?: string;
          product_id?: string;
          location_id?: string;
          quantity?: number;
          unit_price?: number | null;
          notes?: string | null;
          created_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string;
          product_id: string;
          warehouse_id: string;
          location_id: string;
          quantity: number;
          updated_at: string
        }
        Insert: {
          product_id: string;
          warehouse_id: string;
          location_id: string
        }
        Update: {
          id?: string;
          product_id?: string;
          warehouse_id?: string;
          location_id?: string;
          quantity?: number;
          updated_at?: string
        }
        Relationships: []
      }
      locations: {
        Row: {
          id: string;
          warehouse_id: string;
          name: string;
          code: string;
          kind: Database['public']['Enums']['location_kind'];
          notes: string | null;
          status: Database['public']['Enums']['entity_status'];
          created_at: string;
          updated_at: string
        }
        Insert: {
          warehouse_id: string;
          name: string;
          code: string;
          notes: string | null
        }
        Update: {
          id?: string;
          warehouse_id?: string;
          name?: string;
          code?: string;
          kind?: Database['public']['Enums']['location_kind'];
          notes?: string | null;
          status?: Database['public']['Enums']['entity_status'];
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: Database['public']['Enums']['notification_type'];
          severity: Database['public']['Enums']['severity'];
          title: string;
          message: string;
          product_id: string | null;
          warehouse_id: string | null;
          reference_type: Database['public']['Enums']['ref_type'] | null;
          reference_id: string | null;
          link: string | null;
          dedupe_key: string | null;
          is_read: boolean;
          read_at: string | null;
          created_at: string
        }
        Insert: {
          user_id: string;
          type: Database['public']['Enums']['notification_type'];
          title: string;
          message: string;
          product_id: string | null;
          warehouse_id: string | null;
          reference_type: Database['public']['Enums']['ref_type'] | null;
          reference_id: string | null;
          link: string | null;
          dedupe_key: string | null;
          read_at: string | null
        }
        Update: {
          id?: string;
          user_id?: string;
          type?: Database['public']['Enums']['notification_type'];
          severity?: Database['public']['Enums']['severity'];
          title?: string;
          message?: string;
          product_id?: string | null;
          warehouse_id?: string | null;
          reference_type?: Database['public']['Enums']['ref_type'] | null;
          reference_id?: string | null;
          link?: string | null;
          dedupe_key?: string | null;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string;
          sku: string;
          name: string;
          description: string | null;
          category_id: string | null;
          unit_of_measure: Database['public']['Enums']['unit_of_measure'];
          reorder_level: number;
          initial_stock: number;
          status: Database['public']['Enums']['entity_status'];
          created_by: string | null;
          created_at: string;
          updated_at: string;
          search_document: string | null
        }
        Insert: {
          sku: string;
          name: string;
          description: string | null;
          category_id: string | null;
          created_by: string | null;
          search_document: string | null
        }
        Update: {
          id?: string;
          sku?: string;
          name?: string;
          description?: string | null;
          category_id?: string | null;
          unit_of_measure?: Database['public']['Enums']['unit_of_measure'];
          reorder_level?: number;
          initial_stock?: number;
          status?: Database['public']['Enums']['entity_status'];
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          search_document?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          role: Database['public']['Enums']['app_role'];
          avatar_url: string | null;
          phone: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string
        }
        Insert: {
          id: string;
          full_name: string | null;
          email: string | null;
          avatar_url: string | null;
          phone: string | null
        }
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          role?: Database['public']['Enums']['app_role'];
          avatar_url?: string | null;
          phone?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      receipt_items: {
        Row: {
          id: string;
          receipt_id: string;
          product_id: string;
          location_id: string;
          quantity: number;
          unit_cost: number | null;
          notes: string | null;
          created_at: string
        }
        Insert: {
          receipt_id: string;
          product_id: string;
          location_id: string;
          quantity: number;
          unit_cost: number | null;
          notes: string | null
        }
        Update: {
          id?: string;
          receipt_id?: string;
          product_id?: string;
          location_id?: string;
          quantity?: number;
          unit_cost?: number | null;
          notes?: string | null;
          created_at?: string
        }
        Relationships: []
      }
      receipts: {
        Row: {
          id: string;
          receipt_number: string;
          supplier_id: string;
          warehouse_id: string;
          location_id: string;
          reference: string | null;
          notes: string | null;
          status: Database['public']['Enums']['doc_status'];
          expected_at: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          canceled_by: string | null;
          canceled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string
        }
        Insert: {
          receipt_number: string;
          supplier_id: string;
          warehouse_id: string;
          location_id: string;
          reference: string | null;
          notes: string | null;
          expected_at: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          canceled_by: string | null;
          canceled_at: string | null;
          cancel_reason: string | null
        }
        Update: {
          id?: string;
          receipt_number?: string;
          supplier_id?: string;
          warehouse_id?: string;
          location_id?: string;
          reference?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['doc_status'];
          expected_at?: string | null;
          created_by?: string | null;
          validated_by?: string | null;
          validated_at?: string | null;
          canceled_by?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          id: number;
          product_id: string;
          product_name: string;
          sku: string;
          warehouse_id: string;
          warehouse_name: string;
          location_id: string;
          location_name: string;
          transaction_type: Database['public']['Enums']['tx_type'];
          quantity_change: number;
          previous_quantity: number;
          new_quantity: number;
          running_balance: number;
          source_location_id: string | null;
          destination_location_id: string | null;
          reference_type: Database['public']['Enums']['ref_type'];
          reference_id: string | null;
          reference_number: string | null;
          reason: string | null;
          notes: string | null;
          created_by: string | null;
          created_by_name: string | null;
          created_at: string
        }
        Insert: {
          product_id: string;
          product_name: string;
          sku: string;
          warehouse_id: string;
          warehouse_name: string;
          location_id: string;
          location_name: string;
          transaction_type: Database['public']['Enums']['tx_type'];
          quantity_change: number;
          previous_quantity: number;
          new_quantity: number;
          running_balance: number;
          source_location_id: string | null;
          destination_location_id: string | null;
          reference_type: Database['public']['Enums']['ref_type'];
          reference_id: string | null;
          reference_number: string | null;
          reason: string | null;
          notes: string | null;
          created_by: string | null;
          created_by_name: string | null
        }
        Update: {
          id?: number;
          product_id?: string;
          product_name?: string;
          sku?: string;
          warehouse_id?: string;
          warehouse_name?: string;
          location_id?: string;
          location_name?: string;
          transaction_type?: Database['public']['Enums']['tx_type'];
          quantity_change?: number;
          previous_quantity?: number;
          new_quantity?: number;
          running_balance?: number;
          source_location_id?: string | null;
          destination_location_id?: string | null;
          reference_type?: Database['public']['Enums']['ref_type'];
          reference_id?: string | null;
          reference_number?: string | null;
          reason?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_by_name?: string | null;
          created_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          id: string;
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          country: string | null;
          notes: string | null;
          status: Database['public']['Enums']['entity_status'];
          created_at: string;
          updated_at: string
        }
        Insert: {
          name: string;
          contact_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          country: string | null;
          notes: string | null
        }
        Update: {
          id?: string;
          name?: string;
          contact_name?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          country?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['entity_status'];
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      transfer_items: {
        Row: {
          id: string;
          transfer_id: string;
          product_id: string;
          quantity: number;
          notes: string | null;
          created_at: string
        }
        Insert: {
          transfer_id: string;
          product_id: string;
          quantity: number;
          notes: string | null
        }
        Update: {
          id?: string;
          transfer_id?: string;
          product_id?: string;
          quantity?: number;
          notes?: string | null;
          created_at?: string
        }
        Relationships: []
      }
      transfers: {
        Row: {
          id: string;
          transfer_number: string;
          source_warehouse_id: string;
          source_location_id: string;
          destination_warehouse_id: string;
          destination_location_id: string;
          reference: string | null;
          notes: string | null;
          status: Database['public']['Enums']['doc_status'];
          expected_at: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          canceled_by: string | null;
          canceled_at: string | null;
          cancel_reason: string | null;
          created_at: string;
          updated_at: string
        }
        Insert: {
          transfer_number: string;
          source_warehouse_id: string;
          source_location_id: string;
          destination_warehouse_id: string;
          destination_location_id: string;
          reference: string | null;
          notes: string | null;
          expected_at: string | null;
          created_by: string | null;
          validated_by: string | null;
          validated_at: string | null;
          canceled_by: string | null;
          canceled_at: string | null;
          cancel_reason: string | null
        }
        Update: {
          id?: string;
          transfer_number?: string;
          source_warehouse_id?: string;
          source_location_id?: string;
          destination_warehouse_id?: string;
          destination_location_id?: string;
          reference?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['doc_status'];
          expected_at?: string | null;
          created_by?: string | null;
          validated_by?: string | null;
          validated_at?: string | null;
          canceled_by?: string | null;
          canceled_at?: string | null;
          cancel_reason?: string | null;
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
      user_warehouses: {
        Row: {
          user_id: string;
          warehouse_id: string;
          created_at: string
        }
        Insert: {
          user_id: string;
          warehouse_id: string
        }
        Update: {
          user_id?: string;
          warehouse_id?: string;
          created_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          id: string;
          name: string;
          code: string;
          address: string | null;
          city: string | null;
          country: string | null;
          phone: string | null;
          email: string | null;
          manager_id: string | null;
          notes: string | null;
          status: Database['public']['Enums']['entity_status'];
          created_at: string;
          updated_at: string
        }
        Insert: {
          name: string;
          code: string;
          address: string | null;
          city: string | null;
          country: string | null;
          phone: string | null;
          email: string | null;
          manager_id: string | null;
          notes: string | null
        }
        Update: {
          id?: string;
          name?: string;
          code?: string;
          address?: string | null;
          city?: string | null;
          country?: string | null;
          phone?: string | null;
          email?: string | null;
          manager_id?: string | null;
          notes?: string | null;
          status?: Database['public']['Enums']['entity_status'];
          created_at?: string;
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_dashboard_kpis: {
        Row: {
          total_units: number | null;
          active_products: number | null;
          low_stock_products: number | null;
          out_of_stock_products: number | null;
          stocked_products: number | null;
          pending_receipts: number | null;
          pending_deliveries: number | null;
          pending_transfers: number | null;
          transfers_today: number | null;
          visible_warehouses: number | null;
          total_products: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_documents: {
        Row: {
          id: string | null;
          reference_type: Database['public']['Enums']['ref_type'] | null;
          document_number: string | null;
          status: Database['public']['Enums']['doc_status'] | null;
          warehouse_id: string | null;
          warehouse_name: string | null;
          reference: string | null;
          notes: string | null;
          expected_at: string | null;
          created_at: string | null;
          updated_at: string | null;
          validated_at: string | null;
          created_by: string | null;
          created_by_name: string | null;
          validated_by: string | null;
          validated_by_name: string | null;
          partner_name: string | null;
          partner_detail: string | null;
          line_count: number | null;
          total_quantity: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_inventory_detail: {
        Row: {
          id: string | null;
          product_id: string | null;
          sku: string | null;
          product_name: string | null;
          unit_of_measure: Database['public']['Enums']['unit_of_measure'] | null;
          reorder_level: number | null;
          product_status: Database['public']['Enums']['entity_status'] | null;
          category_id: string | null;
          category_name: string | null;
          warehouse_id: string | null;
          warehouse_name: string | null;
          warehouse_code: string | null;
          location_id: string | null;
          location_name: string | null;
          location_code: string | null;
          location_kind: Database['public']['Enums']['location_kind'] | null;
          quantity: number | null;
          updated_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_low_stock_products: {
        Row: {
          product_id: string | null;
          sku: string | null;
          product_name: string | null;
          category_name: string | null;
          unit_of_measure: Database['public']['Enums']['unit_of_measure'] | null;
          total_quantity: number | null;
          reorder_level: number | null;
          shortfall: number | null;
          stock_status: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_movements_daily: {
        Row: {
          day: string | null;
          received: number | null;
          dispatched: number | null;
          net: number | null;
          entries: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_product_stock: {
        Row: {
          product_id: string | null;
          sku: string | null;
          product_name: string | null;
          description: string | null;
          category_id: string | null;
          category_name: string | null;
          unit_of_measure: Database['public']['Enums']['unit_of_measure'] | null;
          reorder_level: number | null;
          product_status: Database['public']['Enums']['entity_status'] | null;
          total_quantity: number | null;
          warehouse_count: number | null;
          location_count: number | null;
          last_movement_at: string | null;
          created_at: string | null;
          updated_at: string | null;
          stock_status: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_recent_activity: {
        Row: {
          id: number | null;
          transaction_type: Database['public']['Enums']['tx_type'] | null;
          quantity_change: number | null;
          previous_quantity: number | null;
          new_quantity: number | null;
          product_id: string | null;
          product_name: string | null;
          sku: string | null;
          warehouse_name: string | null;
          location_name: string | null;
          reference_type: Database['public']['Enums']['ref_type'] | null;
          reference_id: string | null;
          reference_number: string | null;
          reason: string | null;
          created_by_name: string | null;
          created_at: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_stock_by_category: {
        Row: {
          category_id: string | null;
          category_name: string | null;
          total_quantity: number | null;
          product_count: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      v_stock_by_warehouse: {
        Row: {
          warehouse_id: string | null;
          warehouse_name: string | null;
          warehouse_code: string | null;
          total_quantity: number | null;
          product_count: number | null;
          location_count: number | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Functions: {
      alert_recipients: {
        Args: {
          p_warehouse_id: string
        }
        Returns: string[]
      }
      apply_stock_movement: {
        Args: {
          p_product_id: string;
          p_location_id: string;
          p_delta: number;
          p_transaction_type: Database['public']['Enums']['tx_type'];
          p_reference_type: Database['public']['Enums']['ref_type'];
          p_reference_id: string;
          p_reference_number: string;
          p_reason: string | undefined;
          p_source_location_id: string | undefined;
          p_destination_location_id: string | undefined;
          p_notes: string | undefined
        }
        Returns: Database['public']['Tables']['stock_ledger']['Row']
      }
      assert_valid_transition: {
        Args: {
          p_from: Database['public']['Enums']['doc_status'];
          p_to: Database['public']['Enums']['doc_status']
        }
        Returns: undefined
      }
      can_access_location: {
        Args: {
          p_location_id: string
        }
        Returns: boolean
      }
      can_access_warehouse: {
        Args: {
          p_warehouse_id: string
        }
        Returns: boolean
      }
      cancel_document: {
        Args: {
          p_reference_type: Database['public']['Enums']['ref_type'];
          p_document_id: string;
          p_reason: string
        }
        Returns: undefined
      }
      change_document_status: {
        Args: {
          p_reference_type: Database['public']['Enums']['ref_type'];
          p_document_id: string;
          p_new_status: Database['public']['Enums']['doc_status']
        }
        Returns: Database['public']['Enums']['doc_status']
      }
      check_delivery_availability: {
        Args: {
          p_delivery_id: string
        }
        Returns: {
product_id: string;
product_name: string;
sku: string;
location_id: string;
location_name: string;
requested: number;
available: number;
is_sufficient: boolean
}[]
      }
      check_transfer_availability: {
        Args: {
          p_transfer_id: string
        }
        Returns: {
product_id: string;
product_name: string;
sku: string;
requested: number;
available: number;
is_sufficient: boolean
}[]
      }
      create_delivery: {
        Args: {
          p_customer_id: string;
          p_warehouse_id: string;
          p_location_id: string;
          p_reference: string | undefined;
          p_notes: string | undefined;
          p_expected_at: string | undefined;
          p_items: Json | undefined
        }
        Returns: string
      }
      create_product: {
        Args: {
          p_name: string;
          p_sku: string;
          p_category_id: string | undefined;
          p_unit_of_measure: Database['public']['Enums']['unit_of_measure'] | undefined;
          p_reorder_level: number | undefined;
          p_initial_stock: number | undefined;
          p_description: string | undefined;
          p_initial_location_id: string | undefined
        }
        Returns: string
      }
      create_receipt: {
        Args: {
          p_supplier_id: string;
          p_warehouse_id: string;
          p_location_id: string;
          p_reference: string | undefined;
          p_notes: string | undefined;
          p_expected_at: string | undefined;
          p_items: Json | undefined
        }
        Returns: string
      }
      create_transfer: {
        Args: {
          p_source_warehouse_id: string;
          p_source_location_id: string;
          p_destination_warehouse_id: string;
          p_destination_location_id: string;
          p_reference: string | undefined;
          p_notes: string | undefined;
          p_expected_at: string | undefined;
          p_items: Json | undefined
        }
        Returns: string
      }
      crypt: {
        Args: Record<string, never>
        Returns: string
      }
      current_role: {
        Args: Record<string, never>
        Returns: Database['public']['Enums']['app_role']
      }
      forbid_ledger_mutation: {
        Args: Record<string, never>
        Returns: undefined
      }
      gen_random_uuid: {
        Args: Record<string, never>
        Returns: string
      }
      gen_salt: {
        Args: Record<string, never>
        Returns: string
      }
      get_location_stock: {
        Args: {
          p_product_id: string;
          p_location_id: string
        }
        Returns: number
      }
      get_my_profile: {
        Args: {
          p_user_id: string | undefined
        }
        Returns: {
id: string;
full_name: string;
email: string;
role: Database['public']['Enums']['app_role'];
avatar_url: string;
phone: string;
is_active: boolean;
created_at: string;
updated_at: string;
warehouse_ids: string[]
}[]
      }
      global_search: {
        Args: {
          p_query: string;
          p_limit: number | undefined
        }
        Returns: {
kind: string;
id: string;
title: string;
subtitle: string;
href: string;
sort_weight: number
}[]
      }
      handle_new_user: {
        Args: Record<string, never>
        Returns: undefined
      }
      inventory_write_guard: {
        Args: Record<string, never>
        Returns: undefined
      }
      is_admin: {
        Args: Record<string, never>
        Returns: boolean
      }
      is_manager: {
        Args: Record<string, never>
        Returns: boolean
      }
      mark_all_notifications_read: {
        Args: Record<string, never>
        Returns: number
      }
      mark_notification_read: {
        Args: {
          p_notification_id: string
        }
        Returns: undefined
      }
      next_adjustment_number: {
        Args: Record<string, never>
        Returns: string
      }
      next_delivery_number: {
        Args: Record<string, never>
        Returns: string
      }
      next_receipt_number: {
        Args: Record<string, never>
        Returns: string
      }
      next_transfer_number: {
        Args: Record<string, never>
        Returns: string
      }
      notify: {
        Args: {
          p_warehouse_id: string;
          p_type: Database['public']['Enums']['notification_type'];
          p_severity: Database['public']['Enums']['severity'];
          p_title: string;
          p_message: string;
          p_dedupe_key: string | undefined;
          p_product_id: string | undefined;
          p_reference_type: Database['public']['Enums']['ref_type'] | undefined;
          p_reference_id: string | undefined;
          p_link: string | undefined
        }
        Returns: number
      }
      post_adjustment: {
        Args: {
          p_product_id: string;
          p_location_id: string;
          p_counted_quantity: number;
          p_reason: Database['public']['Enums']['adjustment_reason'];
          p_notes: string | undefined
        }
        Returns: string
      }
      prevent_reference_delete: {
        Args: Record<string, never>
        Returns: undefined
      }
      product_total_stock: {
        Args: {
          p_product_id: string
        }
        Returns: number
      }
      set_updated_at: {
        Args: Record<string, never>
        Returns: undefined
      }
      set_user_warehouses: {
        Args: {
          p_user_id: string;
          p_warehouse_ids: string[]
        }
        Returns: undefined
      }
      sync_stock_alert: {
        Args: {
          p_product_id: string;
          p_warehouse_id: string | undefined
        }
        Returns: undefined
      }
      unread_notification_count: {
        Args: Record<string, never>
        Returns: number
      }
      update_delivery: {
        Args: {
          p_delivery_id: string;
          p_customer_id: string | undefined;
          p_location_id: string | undefined;
          p_reference: string | undefined;
          p_notes: string | undefined;
          p_expected_at: string | undefined;
          p_items: Json | undefined
        }
        Returns: string
      }
      update_profile_role: {
        Args: {
          p_user_id: string;
          p_role: Database['public']['Enums']['app_role']
        }
        Returns: undefined
      }
      update_receipt: {
        Args: {
          p_receipt_id: string;
          p_supplier_id: string | undefined;
          p_location_id: string | undefined;
          p_reference: string | undefined;
          p_notes: string | undefined;
          p_expected_at: string | undefined;
          p_items: Json | undefined
        }
        Returns: string
      }
      update_transfer: {
        Args: {
          p_transfer_id: string;
          p_source_location_id: string | undefined;
          p_destination_location_id: string | undefined;
          p_reference: string | undefined;
          p_notes: string | undefined;
          p_expected_at: string | undefined;
          p_items: Json | undefined
        }
        Returns: string
      }
      validate_delivery: {
        Args: {
          p_delivery_id: string
        }
        Returns: Json
      }
      validate_receipt: {
        Args: {
          p_receipt_id: string
        }
        Returns: Json
      }
      validate_transfer: {
        Args: {
          p_transfer_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      adjustment_reason: "damaged" | "expired" | "lost" | "found" | "miscount" | "returned" | "theft" | "production_consumption" | "quality_reject" | "other"
      app_role: "admin" | "inventory_manager" | "warehouse_staff"
      doc_status: "draft" | "waiting" | "ready" | "done" | "canceled"
      entity_status: "active" | "archived"
      location_kind: "rack" | "floor" | "store" | "dock" | "quarantine" | "staging"
      notification_type: "low_stock" | "out_of_stock" | "receipt_validated" | "delivery_validated" | "transfer_completed" | "adjustment_completed" | "system"
      ref_type: "receipt" | "delivery" | "transfer" | "adjustment" | "initial"
      severity: "info" | "warning" | "critical"
      tx_type: "receipt" | "delivery" | "transfer_in" | "transfer_out" | "adjustment"
      unit_of_measure: "pcs" | "kg" | "g" | "l" | "ml" | "m" | "m2" | "m3" | "box" | "pack" | "set" | "roll" | "bag" | "pair" | "carton" | "drum"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
