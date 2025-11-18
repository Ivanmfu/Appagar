export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          display_name: string | null
          created_at: string | null
        }
        Insert: {
          id: string
          email?: string | null
          display_name?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          email?: string | null
          display_name?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          id: string
          group_id: string | null
          actor_id: string | null
          action: string
          payload: Json | null
          created_at: string | null
        }
        Insert: {
          id?: string
          group_id?: string | null
          actor_id?: string | null
          action: string
          payload?: Json | null
          created_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string | null
          actor_id?: string | null
          action?: string
          payload?: Json | null
          created_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'activity_events_actor_id_fkey'
            columns: ['actor_id']
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activity_events_group_id_fkey'
            columns: ['group_id']
            referencedRelation: 'groups'
            referencedColumns: ['id']
          }
        ]
      }
      groups: {
        Row: {
          id: string
          name: string
          base_currency: string
          created_by: string
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          base_currency?: string
          created_by: string
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          base_currency?: string
          created_by?: string
          created_at?: string | null
        }
        Relationships: []
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          is_active: boolean
          role: string | null
          joined_at: string | null
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          is_active?: boolean
          role?: string | null
          joined_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          is_active?: boolean
          role?: string | null
          joined_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          id: string
          group_id: string
          payer_id: string
          created_by: string
          amount_minor: number
          currency: string
          fx_rate: number
          amount_base_minor: number
          category: string | null
          note: string | null
          date: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          group_id: string
          payer_id: string
          created_by: string
          amount_minor: number
          currency?: string
          fx_rate?: number
          amount_base_minor: number
          category?: string | null
          note?: string | null
          date?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string
          payer_id?: string
          created_by?: string
          amount_minor?: number
          currency?: string
          fx_rate?: number
          amount_base_minor?: number
          category?: string | null
          note?: string | null
          date?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      group_invites: {
        Row: {
          id: string
          group_id: string
          email: string
          token: string
          status: string
          expires_at: string | null
          created_at: string | null
          created_by: string
        }
        Insert: {
          id?: string
          group_id: string
          email: string
          token: string
          status?: string
          expires_at?: string | null
          created_at?: string | null
          created_by: string
        }
        Update: {
          id?: string
          group_id?: string
          email?: string
          token?: string
          status?: string
          expires_at?: string | null
          created_at?: string | null
          created_by?: string
        }
        Relationships: []
      }
      expense_participants: {
        Row: {
          id: string
          expense_id: string
          user_id: string
          share_minor: number
          is_included: boolean
        }
        Insert: {
          id?: string
          expense_id: string
          user_id: string
          share_minor: number
          is_included?: boolean
        }
        Update: {
          id?: string
          expense_id?: string
          user_id?: string
          share_minor?: number
          is_included?: boolean
        }
        Relationships: []
      }
      settlements: {
        Row: {
          id: string
          group_id: string | null
          from_user_id: string
          to_user_id: string
          amount_minor: number
          created_at: string | null
          settled_at: string | null
        }
        Insert: {
          id?: string
          group_id?: string | null
          from_user_id: string
          to_user_id: string
          amount_minor: number
          created_at?: string | null
          settled_at?: string | null
        }
        Update: {
          id?: string
          group_id?: string | null
          from_user_id?: string
          to_user_id?: string
          amount_minor?: number
          created_at?: string | null
          settled_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      group_balance: {
        Row: {
          group_id: string
          user_id: string
          net_minor: number
        }
        Relationships: []
      }
    }
    Functions: {
      [_: string]: never
    }
    Enums: {
      [_: string]: never
    }
    CompositeTypes: {
      [_: string]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
      PublicSchema["Views"])
  ? (PublicSchema["Tables"] &
      PublicSchema["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
  ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
  ? PublicSchema["Enums"][PublicEnumNameOrOptions]
  : never

