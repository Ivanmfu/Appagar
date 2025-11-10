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
          email: string
          created_at: string
        }
        Insert: {
          id: string
          email: string
          created_at?: string
        }
        Update: {
          id?: string
          email?: string
          created_at?: string
        }
      }
      groups: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      group_members: {
        Row: {
          id: string
          group_id: string
          user_id: string
          is_active: boolean
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          user_id: string
          is_active?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          user_id?: string
          is_active?: boolean
          created_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          group_id: string
          payer_id: string
          amount_minor: number
          currency: string
          fx_rate: number
          amount_base_minor: number
          category: string | null
          note: string | null
          date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          payer_id: string
          amount_minor: number
          currency?: string
          fx_rate?: number
          amount_base_minor: number
          category?: string | null
          note?: string | null
          date?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          payer_id?: string
          amount_minor?: number
          currency?: string
          fx_rate?: number
          amount_base_minor?: number
          category?: string | null
          note?: string | null
          date?: string | null
          created_at?: string
        }
      }
      expense_participants: {
        Row: {
          id: string
          expense_id: string
          user_id: string
          share_minor: number
          is_included: boolean
          created_at: string
        }
        Insert: {
          id?: string
          expense_id: string
          user_id: string
          share_minor: number
          is_included?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          expense_id?: string
          user_id?: string
          share_minor?: number
          is_included?: boolean
          created_at?: string
        }
      }
      settlements: {
        Row: {
          id: string
          group_id: string
          from_user_id: string
          to_user_id: string
          amount_minor: number
          created_at: string
        }
        Insert: {
          id?: string
          group_id: string
          from_user_id: string
          to_user_id: string
          amount_minor: number
          created_at?: string
        }
        Update: {
          id?: string
          group_id?: string
          from_user_id?: string
          to_user_id?: string
          amount_minor?: number
          created_at?: string
        }
      }
    }
    Views: {
      group_balance: {
        Row: {
          group_id: string
          user_id: string
          net_minor: number
        }
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
