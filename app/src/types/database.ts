export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      orgs: {
        Row: {
          id: string;
          name: string;
          slug: string;
          logo_url: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          logo_url?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          logo_url?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      properties: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          slug: string;
          brand: string | null;
          keys: number;
          timezone: string;
          address: string | null;
          country_code: string;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          slug: string;
          brand?: string | null;
          keys: number;
          timezone: string;
          address?: string | null;
          country_code: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          slug?: string;
          brand?: string | null;
          keys?: number;
          timezone?: string;
          address?: string | null;
          country_code?: string;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "properties_org_id_fkey";
            columns: ["org_id"];
            referencedRelation: "orgs";
            referencedColumns: ["id"];
          }
        ];
      };

      outlets: {
        Row: {
          id: string;
          property_id: string;
          name: string;
          slug: string;
          outlet_type: string;
          capacity_pax: number | null;
          settings: Json;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          name: string;
          slug: string;
          outlet_type: string;
          capacity_pax?: number | null;
          settings?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          name?: string;
          slug?: string;
          outlet_type?: string;
          capacity_pax?: number | null;
          settings?: Json;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outlets_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };

      stations: {
        Row: {
          id: string;
          outlet_id: string;
          name: string;
          slug: string;
          food_category: string;
          co2e_factor_kg_per_kg: number;
          sort_order: number;
          active: boolean;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          name: string;
          slug: string;
          food_category: string;
          co2e_factor_kg_per_kg: number;
          sort_order?: number;
          active?: boolean;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          name?: string;
          slug?: string;
          food_category?: string;
          co2e_factor_kg_per_kg?: number;
          sort_order?: number;
          active?: boolean;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "stations_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          }
        ];
      };

      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          avatar_url?: string | null;
          locale?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      memberships: {
        Row: {
          id: string;
          user_id: string;
          property_id: string;
          role: string;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          property_id: string;
          role: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          property_id?: string;
          role?: string;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "memberships_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "memberships_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };

      pms_daily: {
        Row: {
          id: string;
          property_id: string;
          service_date: string;
          rooms_occupied: number;
          rooms_available: number;
          occupancy_pct: number;
          adr: number | null;
          revpar: number | null;
          segment_leisure_pct: number;
          segment_business_pct: number;
          segment_group_pct: number;
          segment_other_pct: number;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          service_date: string;
          rooms_occupied: number;
          rooms_available: number;
          occupancy_pct: number;
          adr?: number | null;
          revpar?: number | null;
          segment_leisure_pct?: number;
          segment_business_pct?: number;
          segment_group_pct?: number;
          segment_other_pct?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          service_date?: string;
          rooms_occupied?: number;
          rooms_available?: number;
          occupancy_pct?: number;
          adr?: number | null;
          revpar?: number | null;
          segment_leisure_pct?: number;
          segment_business_pct?: number;
          segment_group_pct?: number;
          segment_other_pct?: number;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pms_daily_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };

      weather_daily: {
        Row: {
          id: string;
          property_id: string;
          service_date: string;
          temp_c: number | null;
          feels_like_c: number | null;
          humidity_pct: number | null;
          condition: string | null;
          precipitation_mm: number | null;
          wind_kph: number | null;
          source: string;
          fetched_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          service_date: string;
          temp_c?: number | null;
          feels_like_c?: number | null;
          humidity_pct?: number | null;
          condition?: string | null;
          precipitation_mm?: number | null;
          wind_kph?: number | null;
          source?: string;
          fetched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          service_date?: string;
          temp_c?: number | null;
          feels_like_c?: number | null;
          humidity_pct?: number | null;
          condition?: string | null;
          precipitation_mm?: number | null;
          wind_kph?: number | null;
          source?: string;
          fetched_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weather_daily_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };

      events_daily: {
        Row: {
          id: string;
          property_id: string;
          service_date: string;
          event_name: string;
          event_type: string;
          pax_expected: number | null;
          lift_factor: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          property_id: string;
          service_date: string;
          event_name: string;
          event_type: string;
          pax_expected?: number | null;
          lift_factor?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          property_id?: string;
          service_date?: string;
          event_name?: string;
          event_type?: string;
          pax_expected?: number | null;
          lift_factor?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "events_daily_property_id_fkey";
            columns: ["property_id"];
            referencedRelation: "properties";
            referencedColumns: ["id"];
          }
        ];
      };

      waste_measured: {
        Row: {
          id: string;
          outlet_id: string;
          station_id: string | null;
          service_date: string;
          wave_label: string | null;
          waste_kg: number;
          co2e_kg: number;
          source: string;
          raw_payload: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          station_id?: string | null;
          service_date: string;
          wave_label?: string | null;
          waste_kg: number;
          co2e_kg: number;
          source?: string;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          station_id?: string | null;
          service_date?: string;
          wave_label?: string | null;
          waste_kg?: number;
          co2e_kg?: number;
          source?: string;
          raw_payload?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "waste_measured_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "waste_measured_station_id_fkey";
            columns: ["station_id"];
            referencedRelation: "stations";
            referencedColumns: ["id"];
          }
        ];
      };

      forecasts: {
        Row: {
          id: string;
          outlet_id: string;
          service_date: string;
          covers_p10: number;
          covers_p50: number;
          covers_p90: number;
          occupancy_input: number;
          segment_leisure_pct: number;
          segment_business_pct: number;
          segment_group_pct: number;
          weather_condition: string | null;
          temp_c: number | null;
          event_lift: number;
          is_weekend: boolean;
          model_version: string;
          generated_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          service_date: string;
          covers_p10: number;
          covers_p50: number;
          covers_p90: number;
          occupancy_input: number;
          segment_leisure_pct?: number;
          segment_business_pct?: number;
          segment_group_pct?: number;
          weather_condition?: string | null;
          temp_c?: number | null;
          event_lift?: number;
          is_weekend?: boolean;
          model_version?: string;
          generated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          service_date?: string;
          covers_p10?: number;
          covers_p50?: number;
          covers_p90?: number;
          occupancy_input?: number;
          segment_leisure_pct?: number;
          segment_business_pct?: number;
          segment_group_pct?: number;
          weather_condition?: string | null;
          temp_c?: number | null;
          event_lift?: number;
          is_weekend?: boolean;
          model_version?: string;
          generated_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "forecasts_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          }
        ];
      };

      station_pars: {
        Row: {
          id: string;
          forecast_id: string;
          station_id: string;
          wave_label: string;
          par_kg: number;
          par_kg_p10: number;
          par_kg_p90: number;
          waste_risk_kg: number;
          co2e_risk_kg: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          forecast_id: string;
          station_id: string;
          wave_label: string;
          par_kg: number;
          par_kg_p10: number;
          par_kg_p90: number;
          waste_risk_kg: number;
          co2e_risk_kg: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          forecast_id?: string;
          station_id?: string;
          wave_label?: string;
          par_kg?: number;
          par_kg_p10?: number;
          par_kg_p90?: number;
          waste_risk_kg?: number;
          co2e_risk_kg?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "station_pars_forecast_id_fkey";
            columns: ["forecast_id"];
            referencedRelation: "forecasts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "station_pars_station_id_fkey";
            columns: ["station_id"];
            referencedRelation: "stations";
            referencedColumns: ["id"];
          }
        ];
      };

      actions: {
        Row: {
          id: string;
          forecast_id: string;
          station_id: string | null;
          action_type: string;
          priority: number;
          title: string;
          description: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          forecast_id: string;
          station_id?: string | null;
          action_type: string;
          priority?: number;
          title: string;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          forecast_id?: string;
          station_id?: string | null;
          action_type?: string;
          priority?: number;
          title?: string;
          description?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "actions_forecast_id_fkey";
            columns: ["forecast_id"];
            referencedRelation: "forecasts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "actions_station_id_fkey";
            columns: ["station_id"];
            referencedRelation: "stations";
            referencedColumns: ["id"];
          }
        ];
      };

      prep_status: {
        Row: {
          id: string;
          forecast_id: string;
          station_id: string;
          wave_label: string;
          status: string;
          actual_kg: number | null;
          notes: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          forecast_id: string;
          station_id: string;
          wave_label: string;
          status?: string;
          actual_kg?: number | null;
          notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          forecast_id?: string;
          station_id?: string;
          wave_label?: string;
          status?: string;
          actual_kg?: number | null;
          notes?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prep_status_forecast_id_fkey";
            columns: ["forecast_id"];
            referencedRelation: "forecasts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prep_status_station_id_fkey";
            columns: ["station_id"];
            referencedRelation: "stations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "prep_status_updated_by_fkey";
            columns: ["updated_by"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      outcomes: {
        Row: {
          id: string;
          outlet_id: string;
          service_date: string;
          actual_covers: number | null;
          forecast_covers_p50: number | null;
          total_waste_kg: number | null;
          total_co2e_kg: number | null;
          food_cost_saved_usd: number | null;
          accuracy_pct: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          service_date: string;
          actual_covers?: number | null;
          forecast_covers_p50?: number | null;
          total_waste_kg?: number | null;
          total_co2e_kg?: number | null;
          food_cost_saved_usd?: number | null;
          accuracy_pct?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          service_date?: string;
          actual_covers?: number | null;
          forecast_covers_p50?: number | null;
          total_waste_kg?: number | null;
          total_co2e_kg?: number | null;
          food_cost_saved_usd?: number | null;
          accuracy_pct?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "outcomes_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          }
        ];
      };

      esg_log: {
        Row: {
          id: string;
          outlet_id: string;
          service_date: string;
          period_type: string;
          waste_kg: number;
          co2e_kg: number;
          food_cost_saved_usd: number;
          water_l: number | null;
          covers_served: number | null;
          waste_per_cover_kg: number | null;
          co2e_per_cover_kg: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          service_date: string;
          period_type: string;
          waste_kg: number;
          co2e_kg: number;
          food_cost_saved_usd: number;
          water_l?: number | null;
          covers_served?: number | null;
          waste_per_cover_kg?: number | null;
          co2e_per_cover_kg?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          service_date?: string;
          period_type?: string;
          waste_kg?: number;
          co2e_kg?: number;
          food_cost_saved_usd?: number;
          water_l?: number | null;
          covers_served?: number | null;
          waste_per_cover_kg?: number | null;
          co2e_per_cover_kg?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "esg_log_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          }
        ];
      };

      prediction_log: {
        Row: {
          id: string;
          outlet_id: string;
          service_date: string;
          model_version: string;
          input_snapshot: Json;
          covers_p10: number;
          covers_p50: number;
          covers_p90: number;
          actual_covers: number | null;
          mae: number | null;
          mape: number | null;
          within_band: boolean | null;
          generated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          service_date: string;
          model_version: string;
          input_snapshot: Json;
          covers_p10: number;
          covers_p50: number;
          covers_p90: number;
          actual_covers?: number | null;
          mae?: number | null;
          mape?: number | null;
          within_band?: boolean | null;
          generated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          service_date?: string;
          model_version?: string;
          input_snapshot?: Json;
          covers_p10?: number;
          covers_p50?: number;
          covers_p90?: number;
          actual_covers?: number | null;
          mae?: number | null;
          mape?: number | null;
          within_band?: boolean | null;
          generated_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "prediction_log_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          }
        ];
      };
      pace_log: {
        Row: {
          id: string;
          outlet_id: string;
          service_date: string;
          logged_at: string;
          covers_cumul: number;
          covers_delta: number;
          wave_label: "wave1" | "wave2" | "wave3" | null;
          source: "pos_simphony" | "manual_fallback";
          raw_payload: Json | null;
        };
        Insert: {
          id?: string;
          outlet_id: string;
          service_date: string;
          logged_at?: string;
          covers_cumul: number;
          covers_delta?: number;
          wave_label?: "wave1" | "wave2" | "wave3" | null;
          source: "pos_simphony" | "manual_fallback";
          raw_payload?: Json | null;
        };
        Update: {
          id?: string;
          outlet_id?: string;
          service_date?: string;
          logged_at?: string;
          covers_cumul?: number;
          covers_delta?: number;
          wave_label?: "wave1" | "wave2" | "wave3" | null;
          source?: "pos_simphony" | "manual_fallback";
          raw_payload?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: "pace_log_outlet_id_fkey";
            columns: ["outlet_id"];
            referencedRelation: "outlets";
            referencedColumns: ["id"];
          }
        ];
      };
    };

    Views: {
      [_ in never]: never;
    };

    Functions: {
      get_user_property_ids: {
        Args: Record<PropertyKey, never>;
        Returns: string[];
      };
    };

    Enums: {
      [_ in never]: never;
    };

    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database[Extract<keyof Database, "public">];

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
      Row: infer R;
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;
