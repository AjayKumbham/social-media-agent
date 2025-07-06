export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      ai_settings: {
        Row: {
          active_models: Json | null
          ai_temperature: number | null
          content_length: number
          created_at: string
          creativity_level: number
          id: string
          target_audience: string | null
          tone: string
          topics: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          active_models?: Json | null
          ai_temperature?: number | null
          content_length?: number
          created_at?: string
          creativity_level?: number
          id?: string
          target_audience?: string | null
          tone?: string
          topics?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          active_models?: Json | null
          ai_temperature?: number | null
          content_length?: number
          created_at?: string
          creativity_level?: number
          id?: string
          target_audience?: string | null
          tone?: string
          topics?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_posts: {
        Row: {
          analytics: Json | null
          content: string
          created_at: string
          error_message: string | null
          id: string
          media_url: string | null
          platform_name: string
          platform_post_id: string | null
          post_type: string
          posted_at: string | null
          scheduled_for: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analytics?: Json | null
          content: string
          created_at?: string
          error_message?: string | null
          id?: string
          media_url?: string | null
          platform_name: string
          platform_post_id?: string | null
          post_type: string
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analytics?: Json | null
          content?: string
          created_at?: string
          error_message?: string | null
          id?: string
          media_url?: string | null
          platform_name?: string
          platform_post_id?: string | null
          post_type?: string
          posted_at?: string | null
          scheduled_for?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      llm_api_credentials: {
        Row: {
          api_key: string
          api_name: string
          created_at: string | null
          id: string
          is_connected: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_key: string
          api_name: string
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string
          api_name?: string
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      media_api_credentials: {
        Row: {
          api_name: string
          created_at: string | null
          credentials: Json
          id: string
          is_connected: boolean | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          api_name: string
          created_at?: string | null
          credentials: Json
          id?: string
          is_connected?: boolean | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          api_name?: string
          created_at?: string | null
          credentials?: Json
          id?: string
          is_connected?: boolean | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          id: string
          preferences: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          preferences?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          preferences?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action: string | null
          category: string | null
          created_at: string
          id: string
          message: string
          platform: string | null
          priority: string | null
          read: boolean
          title: string
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          action?: string | null
          category?: string | null
          created_at?: string
          id?: string
          message: string
          platform?: string | null
          priority?: string | null
          read?: boolean
          title: string
          type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          action?: string | null
          category?: string | null
          created_at?: string
          id?: string
          message?: string
          platform?: string | null
          priority?: string | null
          read?: boolean
          title?: string
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platforms: {
        Row: {
          created_at: string
          credentials: Json
          id: string
          is_active: boolean
          is_connected: boolean
          platform_name: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          id?: string
          is_active?: boolean
          is_connected?: boolean
          platform_name: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          id?: string
          is_active?: boolean
          is_connected?: boolean
          platform_name?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      posting_schedule: {
        Row: {
          created_at: string
          days_of_week: Json
          id: string
          is_active: boolean
          max_posts_per_day: number
          platform_name: string
          preferred_times: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          days_of_week?: Json
          id?: string
          is_active?: boolean
          max_posts_per_day?: number
          platform_name: string
          preferred_times?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          days_of_week?: Json
          id?: string
          is_active?: boolean
          max_posts_per_day?: number
          platform_name?: string
          preferred_times?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      security_audit_logs: {
        Row: {
          created_at: string
          event_details: Json | null
          event_type: string
          id: string
          ip_address: unknown | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
