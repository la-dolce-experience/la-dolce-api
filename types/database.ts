
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "admin_users": {
                  Row: {
                    "created_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"deploy_requests": {
                  Row: {
                    "detail": string,"id": number,"ok": boolean,"requested_at": string,"requested_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "detail"?: string,"id"?: never,"ok": boolean,"requested_at"?: string,"requested_by"?: string | null
                  }
                  Update: {
                    "detail"?: string,"id"?: never,"ok"?: boolean,"requested_at"?: string,"requested_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"event_types": {
                  Row: {
                    "description": string,"form_label": string,"id": string,"position": number,"title": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"form_label": string,"id"?: string,"position"?: number,"title": string,"visible"?: boolean
                  }
                  Update: {
                    "description"?: string,"form_label"?: string,"id"?: string,"position"?: number,"title"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"faqs": {
                  Row: {
                    "answer": string,"id": string,"position": number,"question": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "answer": string,"id"?: string,"position"?: number,"question": string,"visible"?: boolean
                  }
                  Update: {
                    "answer"?: string,"id"?: string,"position"?: number,"question"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"features": {
                  Row: {
                    "id": string,"label": string,"position": number,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: string,"label": string,"position"?: number,"visible"?: boolean
                  }
                  Update: {
                    "id"?: string,"label"?: string,"position"?: number,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"flavor_items": {
                  Row: {
                    "alt": string,"description": string,"id": string,"kind": string,"media_id": string | null,"position": number,"title": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string,"description"?: string,"id"?: string,"kind": string,"media_id"?: string | null,"position"?: number,"title": string,"visible"?: boolean
                  }
                  Update: {
                    "alt"?: string,"description"?: string,"id"?: string,"kind"?: string,"media_id"?: string | null,"position"?: number,"title"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "flavor_items_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"gallery_items": {
                  Row: {
                    "alt": string,"caption": string,"id": string,"media_id": string,"position": number,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string,"caption"?: string,"id"?: string,"media_id": string,"position"?: number,"visible"?: boolean
                  }
                  Update: {
                    "alt"?: string,"caption"?: string,"id"?: string,"media_id"?: string,"position"?: number,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "gallery_items_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "alt": string,"created_at": string,"height_lg": number,"height_sm": number,"id": string,"mime_type": string,"original_name": string,"size_bytes": number,"src_lg": string,"src_sm": string,"width_lg": number,"width_sm": number
                  }
                  ComputedFields: never
                  Insert: {
                    "alt"?: string,"created_at"?: string,"height_lg": number,"height_sm": number,"id"?: string,"mime_type"?: string,"original_name"?: string,"size_bytes"?: number,"src_lg": string,"src_sm": string,"width_lg": number,"width_sm": number
                  }
                  Update: {
                    "alt"?: string,"created_at"?: string,"height_lg"?: number,"height_sm"?: number,"id"?: string,"mime_type"?: string,"original_name"?: string,"size_bytes"?: number,"src_lg"?: string,"src_sm"?: string,"width_lg"?: number,"width_sm"?: number
                  }
                  Relationships: [
                    
                  ]
                },"sections": {
                  Row: {
                    "body": string,"cta_label": string,"eyebrow": string,"image_alt": string,"image_caption": string,"image_media_id": string | null,"key": string,"note": string,"title": string,"updated_at": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "body"?: string,"cta_label"?: string,"eyebrow"?: string,"image_alt"?: string,"image_caption"?: string,"image_media_id"?: string | null,"key": string,"note"?: string,"title"?: string,"updated_at"?: string,"visible"?: boolean
                  }
                  Update: {
                    "body"?: string,"cta_label"?: string,"eyebrow"?: string,"image_alt"?: string,"image_caption"?: string,"image_media_id"?: string | null,"key"?: string,"note"?: string,"title"?: string,"updated_at"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "sections_image_media_id_fkey"
      columns: ["image_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"site_events": {
                  Row: {
                    "created_at": string,"id": number,"kind": string,"source": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"kind": string,"source"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"kind"?: string,"source"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"site_publish_state": {
                  Row: {
                    "content_changed_at": string | null,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "content_changed_at"?: string | null,"id"?: number
                  }
                  Update: {
                    "content_changed_at"?: string | null,"id"?: number
                  }
                  Relationships: [
                    
                  ]
                },"site_settings": {
                  Row: {
                    "address_district": string,"address_street": string,"business_name": string,"city": string,"email": string,"facebook_url": string,"footer_tagline": string,"id": number,"instagram_url": string,"logo_media_id": string | null,"maps_url": string,"og_media_id": string | null,"opening_hours": string,"phone": string,"postal_code": string,"seo_description": string,"seo_title": string,"service_area": string,"show_map": boolean,"state": string,"tiktok_url": string,"updated_at": string,"whatsapp_greeting": string,"whatsapp_number": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address_district"?: string,"address_street"?: string,"business_name": string,"city"?: string,"email"?: string,"facebook_url"?: string,"footer_tagline"?: string,"id"?: number,"instagram_url"?: string,"logo_media_id"?: string | null,"maps_url"?: string,"og_media_id"?: string | null,"opening_hours"?: string,"phone"?: string,"postal_code"?: string,"seo_description": string,"seo_title": string,"service_area"?: string,"show_map"?: boolean,"state"?: string,"tiktok_url"?: string,"updated_at"?: string,"whatsapp_greeting": string,"whatsapp_number": string
                  }
                  Update: {
                    "address_district"?: string,"address_street"?: string,"business_name"?: string,"city"?: string,"email"?: string,"facebook_url"?: string,"footer_tagline"?: string,"id"?: number,"instagram_url"?: string,"logo_media_id"?: string | null,"maps_url"?: string,"og_media_id"?: string | null,"opening_hours"?: string,"phone"?: string,"postal_code"?: string,"seo_description"?: string,"seo_title"?: string,"service_area"?: string,"show_map"?: boolean,"state"?: string,"tiktok_url"?: string,"updated_at"?: string,"whatsapp_greeting"?: string,"whatsapp_number"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_settings_logo_media_id_fkey"
      columns: ["logo_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "site_settings_og_media_id_fkey"
      columns: ["og_media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"steps": {
                  Row: {
                    "description": string,"id": string,"position": number,"title": string,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "description"?: string,"id"?: string,"position"?: number,"title": string,"visible"?: boolean
                  }
                  Update: {
                    "description"?: string,"id"?: string,"position"?: number,"title"?: string,"visible"?: boolean
                  }
                  Relationships: [
                    
                  ]
                },"testimonials": {
                  Row: {
                    "author": string,"authorized": boolean,"context": string,"id": string,"media_id": string | null,"photo_media_ids": (string)[],"position": number,"quote": string,"rating": number,"visible": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "author": string,"authorized"?: boolean,"context"?: string,"id"?: string,"media_id"?: string | null,"photo_media_ids"?: (string)[],"position"?: number,"quote": string,"rating"?: number,"visible"?: boolean
                  }
                  Update: {
                    "author"?: string,"authorized"?: boolean,"context"?: string,"id"?: string,"media_id"?: string | null,"photo_media_ids"?: (string)[],"position"?: number,"quote"?: string,"rating"?: number,"visible"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "testimonials_media_id_fkey"
      columns: ["media_id"]
isOneToOne: false
      referencedRelation: "media"
      referencedColumns: ["id"]
    }
                  ]
                },"trash": {
                  Row: {
                    "deleted_at": string,"deleted_by": string | null,"id": string,"label": string,"row_data": NonNullable<Json>,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deleted_at"?: string,"deleted_by"?: string | null,"id"?: string,"label"?: string,"row_data": NonNullable<Json>,"table_name": string
                  }
                  Update: {
                    "deleted_at"?: string,"deleted_by"?: string | null,"id"?: string,"label"?: string,"row_data"?: NonNullable<Json>,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "deploy_hook_url":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"events_summary":
{ Args: { "p_days"?: number }; Returns: {
              "day": string,"kind": string,"source": string,"total": number
            }[]
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_safe_url":
{ Args: { "value": string }; Returns: boolean
                           },
"publish_site_if_needed":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"restore_backup":
{ Args: { "p_backup": Json }; Returns: Json
                           },
"restore_from_trash":
{ Args: { "p_id": string }; Returns: undefined
                           },
"set_deploy_hook_url":
{ Args: { "p_url": string }; Returns: undefined
                           },
"site_publish_decision":
{ Args: { "p_now"?: string }; Returns: string
                           },
"track_event":
{ Args: { "p_kind": string,"p_source"?: string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
