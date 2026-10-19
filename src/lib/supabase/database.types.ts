// Generated from the Supabase schema (MCP generate_typescript_types). Regenerate after migrations.
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
      announcements: {
        Row: {
          author: string | null
          body: string
          course_id: string
          external_id: string
          id: string
          posted_at: string
          read_at: string | null
          source: string
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          author?: string | null
          body?: string
          course_id: string
          external_id: string
          id?: string
          posted_at: string
          read_at?: string | null
          source: string
          title: string
          url?: string | null
          user_id?: string
        }
        Update: {
          author?: string | null
          body?: string
          course_id?: string
          external_id?: string
          id?: string
          posted_at?: string
          read_at?: string | null
          source?: string
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          course_id: string
          done_at: string | null
          due_at: string | null
          external_id: string
          id: string
          late_due_at: string | null
          released_at: string | null
          score: string | null
          status: string
          title: string
          updated_at: string
          url: string | null
          user_id: string
        }
        Insert: {
          course_id: string
          done_at?: string | null
          due_at?: string | null
          external_id: string
          id?: string
          late_due_at?: string | null
          released_at?: string | null
          score?: string | null
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Update: {
          course_id?: string
          done_at?: string | null
          due_at?: string | null
          external_id?: string
          id?: string
          late_due_at?: string | null
          released_at?: string | null
          score?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      class_connections: {
        Row: {
          last_error: string | null
          last_synced_at: string | null
          provider: string
          secret: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_error?: string | null
          last_synced_at?: string | null
          provider: string
          secret: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          last_error?: string | null
          last_synced_at?: string | null
          provider?: string
          secret?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      courses: {
        Row: {
          canvas_id: string | null
          code: string
          created_at: string
          ed_id: string | null
          gradescope_id: string | null
          hidden: boolean
          id: string
          name: string
          term: string | null
          user_id: string
          website_url: string | null
        }
        Insert: {
          canvas_id?: string | null
          code: string
          created_at?: string
          ed_id?: string | null
          gradescope_id?: string | null
          hidden?: boolean
          id?: string
          name: string
          term?: string | null
          user_id?: string
          website_url?: string | null
        }
        Update: {
          canvas_id?: string | null
          code?: string
          created_at?: string
          ed_id?: string | null
          gradescope_id?: string | null
          hidden?: boolean
          id?: string
          name?: string
          term?: string | null
          user_id?: string
          website_url?: string | null
        }
        Relationships: []
      }
      exercises: {
        Row: {
          archived: boolean
          created_at: string
          equipment: Database["public"]["Enums"]["equipment"]
          id: string
          kind: Database["public"]["Enums"]["exercise_kind"]
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
          user_id: string | null
        }
        Insert: {
          archived?: boolean
          created_at?: string
          equipment: Database["public"]["Enums"]["equipment"]
          id?: string
          kind?: Database["public"]["Enums"]["exercise_kind"]
          muscle_group: Database["public"]["Enums"]["muscle_group"]
          name: string
          user_id?: string | null
        }
        Update: {
          archived?: boolean
          created_at?: string
          equipment?: Database["public"]["Enums"]["equipment"]
          id?: string
          kind?: Database["public"]["Enums"]["exercise_kind"]
          muscle_group?: Database["public"]["Enums"]["muscle_group"]
          name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      food_logs: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          food_id: string | null
          id: string
          logged_on: string
          name: string
          protein_g: number
          servings: number
          user_id: string
        }
        Insert: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          id?: string
          logged_on: string
          name: string
          protein_g?: number
          servings?: number
          user_id?: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          food_id?: string | null
          id?: string
          logged_on?: string
          name?: string
          protein_g?: number
          servings?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "food_logs_food_id_fkey"
            columns: ["food_id"]
            isOneToOne: false
            referencedRelation: "foods"
            referencedColumns: ["id"]
          },
        ]
      }
      foods: {
        Row: {
          calories: number
          carbs_g: number
          created_at: string
          fat_g: number
          fiber_g: number
          id: string
          name: string
          protein_g: number
          serving: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          name: string
          protein_g?: number
          serving?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          calories?: number
          carbs_g?: number
          created_at?: string
          fat_g?: number
          fiber_g?: number
          id?: string
          name?: string
          protein_g?: number
          serving?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      material_pages: {
        Row: {
          markdown: string
          material_id: string
          needs_review: boolean
          page: number
          user_id: string
        }
        Insert: {
          markdown: string
          material_id: string
          needs_review?: boolean
          page: number
          user_id?: string
        }
        Update: {
          markdown?: string
          material_id?: string
          needs_review?: boolean
          page?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_pages_material_id_fkey"
            columns: ["material_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      materials: {
        Row: {
          content_hash: string | null
          course_id: string
          discovered_at: string
          error: string | null
          format: string
          id: string
          kind: string
          page_count: number | null
          parent_id: string | null
          processed_at: string | null
          sort_date: string | null
          source_url: string
          status: string
          storage_path: string | null
          title: string
          user_id: string
          week_label: string | null
        }
        Insert: {
          content_hash?: string | null
          course_id: string
          discovered_at?: string
          error?: string | null
          format: string
          id?: string
          kind: string
          page_count?: number | null
          parent_id?: string | null
          processed_at?: string | null
          sort_date?: string | null
          source_url: string
          status?: string
          storage_path?: string | null
          title: string
          user_id?: string
          week_label?: string | null
        }
        Update: {
          content_hash?: string | null
          course_id?: string
          discovered_at?: string
          error?: string | null
          format?: string
          id?: string
          kind?: string
          page_count?: number | null
          parent_id?: string | null
          processed_at?: string | null
          sort_date?: string | null
          source_url?: string
          status?: string
          storage_path?: string | null
          title?: string
          user_id?: string
          week_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materials_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "materials_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "materials"
            referencedColumns: ["id"]
          },
        ]
      }
      nutrition_goals: {
        Row: {
          max: number | null
          min: number | null
          nutrient: Database["public"]["Enums"]["nutrient"]
          updated_at: string
          user_id: string
        }
        Insert: {
          max?: number | null
          min?: number | null
          nutrient: Database["public"]["Enums"]["nutrient"]
          updated_at?: string
          user_id?: string
        }
        Update: {
          max?: number | null
          min?: number | null
          nutrient?: Database["public"]["Enums"]["nutrient"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      template_exercises: {
        Row: {
          exercise_id: string
          id: string
          position: number
          rest_seconds: number
          target_reps: string | null
          target_sets: number
          template_id: string
          user_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          position?: number
          rest_seconds?: number
          target_reps?: string | null
          target_sets?: number
          template_id: string
          user_id?: string
        }
        Update: {
          exercise_id?: string
          id?: string
          position?: number
          rest_seconds?: number
          target_reps?: string | null
          target_sets?: number
          template_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "template_exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_entries: {
        Row: {
          created_at: string
          logged_on: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          logged_on: string
          user_id?: string
          weight: number
        }
        Update: {
          created_at?: string
          logged_on?: string
          user_id?: string
          weight?: number
        }
        Relationships: []
      }
      workout_exercises: {
        Row: {
          exercise_id: string
          id: string
          notes: string | null
          position: number
          rest_seconds: number
          user_id: string
          workout_id: string
        }
        Insert: {
          exercise_id: string
          id?: string
          notes?: string | null
          position?: number
          rest_seconds?: number
          user_id?: string
          workout_id: string
        }
        Update: {
          exercise_id?: string
          id?: string
          notes?: string | null
          position?: number
          rest_seconds?: number
          user_id?: string
          workout_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_exercises_workout_id_fkey"
            columns: ["workout_id"]
            isOneToOne: false
            referencedRelation: "workouts"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sets: {
        Row: {
          completed_at: string | null
          id: string
          position: number
          reps: number | null
          user_id: string
          weight: number | null
          workout_exercise_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          position?: number
          reps?: number | null
          user_id?: string
          weight?: number | null
          workout_exercise_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          position?: number
          reps?: number | null
          user_id?: string
          weight?: number | null
          workout_exercise_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sets_workout_exercise_id_fkey"
            columns: ["workout_exercise_id"]
            isOneToOne: false
            referencedRelation: "workout_exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      workouts: {
        Row: {
          ended_at: string | null
          id: string
          name: string
          notes: string | null
          started_at: string
          template_id: string | null
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_at?: string
          template_id?: string | null
          user_id?: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          name?: string
          notes?: string | null
          started_at?: string
          template_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workouts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workout_templates"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      exercise_set_history: {
        Row: {
          e1rm: number | null
          exercise_id: string | null
          position: number | null
          reps: number | null
          set_id: string | null
          started_at: string | null
          user_id: string | null
          weight: number | null
          workout_id: string | null
        }
        Relationships: []
      }
      nutrition_daily_totals: {
        Row: {
          calories: number | null
          carbs_g: number | null
          fat_g: number | null
          fiber_g: number | null
          logged_on: string | null
          protein_g: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      last_sets: {
        Args: { before?: string; exercise_ids: string[] }
        Returns: {
          exercise_id: string
          position: number
          reps: number
          weight: number
        }[]
      }
    }
    Enums: {
      equipment: "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell" | "band" | "other"
      exercise_kind: "weighted" | "bodyweight"
      muscle_group:
        | "chest"
        | "back"
        | "shoulders"
        | "biceps"
        | "triceps"
        | "forearms"
        | "quads"
        | "hamstrings"
        | "glutes"
        | "calves"
        | "core"
        | "full_body"
      nutrient: "calories" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"]

export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
