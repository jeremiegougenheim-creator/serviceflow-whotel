
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "asset_readings": {
                  Row: {
                    "asset_id": string,"at": string,"id": string,"metric": string,"property_id": string,"source": string,"unit": string | null,"value": number
                  }
                  Insert: {
                    "asset_id": string,"at"?: string,"id"?: string,"metric": string,"property_id": string,"source"?: string,"unit"?: string | null,"value": number
                  }
                  Update: {
                    "asset_id"?: string,"at"?: string,"id"?: string,"metric"?: string,"property_id"?: string,"source"?: string,"unit"?: string | null,"value"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "asset_readings_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "asset_readings_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"assets": {
                  Row: {
                    "active": boolean,"guest_facing": boolean,"id": string,"kind": string,"location": string | null,"name": string,"property_id": string,"sort_order": number,"status": string,"status_note": string | null,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"guest_facing"?: boolean,"id"?: string,"kind": string,"location"?: string | null,"name": string,"property_id": string,"sort_order"?: number,"status"?: string,"status_note"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"guest_facing"?: boolean,"id"?: string,"kind"?: string,"location"?: string | null,"name"?: string,"property_id"?: string,"sort_order"?: number,"status"?: string,"status_note"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "assets_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"after": Json | null,"at": string,"before": Json | null,"id": number,"property_id": string | null,"row_id": string | null,"table_name": string | null,"user_id": string | null
                  }
                  Insert: {
                    "action": string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: number,"property_id"?: string | null,"row_id"?: string | null,"table_name"?: string | null,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"after"?: Json | null,"at"?: string,"before"?: Json | null,"id"?: number,"property_id"?: string | null,"row_id"?: string | null,"table_name"?: string | null,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_log_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"banquet_events": {
                  Row: {
                    "booked_count": number,"confirmed_count": number,"cook_count": number | null,"courses": NonNullable<Json>,"created_at": string,"diets": NonNullable<Json>,"id": string,"name": string,"outlet_id": string,"property_id": string,"serve_from": string | null,"service_date": string,"status": string,"updated_at": string,"venue": string | null
                  }
                  Insert: {
                    "booked_count"?: number,"confirmed_count"?: number,"cook_count"?: number | null,"courses"?: NonNullable<Json>,"created_at"?: string,"diets"?: NonNullable<Json>,"id"?: string,"name": string,"outlet_id": string,"property_id": string,"serve_from"?: string | null,"service_date": string,"status"?: string,"updated_at"?: string,"venue"?: string | null
                  }
                  Update: {
                    "booked_count"?: number,"confirmed_count"?: number,"cook_count"?: number | null,"courses"?: NonNullable<Json>,"created_at"?: string,"diets"?: NonNullable<Json>,"id"?: string,"name"?: string,"outlet_id"?: string,"property_id"?: string,"serve_from"?: string | null,"service_date"?: string,"status"?: string,"updated_at"?: string,"venue"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "banquet_events_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "banquet_events_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings_daily": {
                  Row: {
                    "covers_booked": number,"created_at": string,"id": string,"largest_party": number | null,"largest_party_at": string | null,"outlet_id": string,"parties": NonNullable<Json>,"peak_at": string | null,"peak_covers": number | null,"property_id": string,"service_date": string,"source": string,"updated_at": string,"walk_in_expected": number
                  }
                  Insert: {
                    "covers_booked"?: number,"created_at"?: string,"id"?: string,"largest_party"?: number | null,"largest_party_at"?: string | null,"outlet_id": string,"parties"?: NonNullable<Json>,"peak_at"?: string | null,"peak_covers"?: number | null,"property_id": string,"service_date": string,"source"?: string,"updated_at"?: string,"walk_in_expected"?: number
                  }
                  Update: {
                    "covers_booked"?: number,"created_at"?: string,"id"?: string,"largest_party"?: number | null,"largest_party_at"?: string | null,"outlet_id"?: string,"parties"?: NonNullable<Json>,"peak_at"?: string | null,"peak_covers"?: number | null,"property_id"?: string,"service_date"?: string,"source"?: string,"updated_at"?: string,"walk_in_expected"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_daily_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_daily_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"decisions": {
                  Row: {
                    "created_at": string,"currency": string | null,"decided_at": string | null,"decided_by": string | null,"delta_pct": number | null,"department": string,"detail": string | null,"est_saving": number | null,"forecast_id": string | null,"id": string,"kind": string,"outlet_id": string | null,"payload": NonNullable<Json>,"property_id": string,"rank": number,"reason": string | null,"service_date": string,"source": string,"station_id": string | null,"status": string,"title": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"delta_pct"?: number | null,"department"?: string,"detail"?: string | null,"est_saving"?: number | null,"forecast_id"?: string | null,"id"?: string,"kind": string,"outlet_id"?: string | null,"payload"?: NonNullable<Json>,"property_id": string,"rank"?: number,"reason"?: string | null,"service_date": string,"source"?: string,"station_id"?: string | null,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"delta_pct"?: number | null,"department"?: string,"detail"?: string | null,"est_saving"?: number | null,"forecast_id"?: string | null,"id"?: string,"kind"?: string,"outlet_id"?: string | null,"payload"?: NonNullable<Json>,"property_id"?: string,"rank"?: number,"reason"?: string | null,"service_date"?: string,"source"?: string,"station_id"?: string | null,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "decisions_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "v_latest_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "decisions_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id"]
    }
                  ]
                },"energy_readings": {
                  Row: {
                    "category": string,"created_at": string,"id": string,"kwh": number,"note": string | null,"property_id": string,"service_date": string,"source": string
                  }
                  Insert: {
                    "category": string,"created_at"?: string,"id"?: string,"kwh": number,"note"?: string | null,"property_id": string,"service_date": string,"source"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"id"?: string,"kwh"?: number,"note"?: string | null,"property_id"?: string,"service_date"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "energy_readings_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"events_daily": {
                  Row: {
                    "created_at": string,"id": string,"kind": string,"label": string,"lift": number,"outlet_id": string | null,"property_id": string,"service_date": string,"size": number | null,"starts_at": string | null
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"label": string,"lift"?: number,"outlet_id"?: string | null,"property_id": string,"service_date": string,"size"?: number | null,"starts_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"kind"?: string,"label"?: string,"lift"?: number,"outlet_id"?: string | null,"property_id"?: string,"service_date"?: string,"size"?: number | null,"starts_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "events_daily_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "events_daily_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"forecasts": {
                  Row: {
                    "confirmed_at": string | null,"confirmed_by": string | null,"covers_p10": number,"covers_p50": number,"covers_p90": number,"created_at": string,"drivers": NonNullable<Json>,"id": string,"inputs": NonNullable<Json>,"issued_at": string,"kind": string,"model_version": string,"occupancy": number | null,"outlet_id": string,"property_id": string,"service_date": string,"signals_read": number,"status": string,"updated_at": string,"usual_covers": number | null,"version": number,"wave_split": NonNullable<Json>
                  }
                  Insert: {
                    "confirmed_at"?: string | null,"confirmed_by"?: string | null,"covers_p10": number,"covers_p50": number,"covers_p90": number,"created_at"?: string,"drivers"?: NonNullable<Json>,"id"?: string,"inputs"?: NonNullable<Json>,"issued_at"?: string,"kind"?: string,"model_version"?: string,"occupancy"?: number | null,"outlet_id": string,"property_id": string,"service_date": string,"signals_read"?: number,"status"?: string,"updated_at"?: string,"usual_covers"?: number | null,"version"?: number,"wave_split"?: NonNullable<Json>
                  }
                  Update: {
                    "confirmed_at"?: string | null,"confirmed_by"?: string | null,"covers_p10"?: number,"covers_p50"?: number,"covers_p90"?: number,"created_at"?: string,"drivers"?: NonNullable<Json>,"id"?: string,"inputs"?: NonNullable<Json>,"issued_at"?: string,"kind"?: string,"model_version"?: string,"occupancy"?: number | null,"outlet_id"?: string,"property_id"?: string,"service_date"?: string,"signals_read"?: number,"status"?: string,"updated_at"?: string,"usual_covers"?: number | null,"version"?: number,"wave_split"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "forecasts_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forecasts_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forecasts_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"imports": {
                  Row: {
                    "created_at": string,"errors": NonNullable<Json>,"file_name": string | null,"id": string,"imported_by": string | null,"kind": string,"property_id": string,"rows_failed": number,"rows_ok": number,"rows_total": number,"status": string
                  }
                  Insert: {
                    "created_at"?: string,"errors"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"imported_by"?: string | null,"kind": string,"property_id": string,"rows_failed"?: number,"rows_ok"?: number,"rows_total"?: number,"status"?: string
                  }
                  Update: {
                    "created_at"?: string,"errors"?: NonNullable<Json>,"file_name"?: string | null,"id"?: string,"imported_by"?: string | null,"kind"?: string,"property_id"?: string,"rows_failed"?: number,"rows_ok"?: number,"rows_total"?: number,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "imports_imported_by_fkey"
      columns: ["imported_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "imports_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"job_runs": {
                  Row: {
                    "error": string | null,"finished_at": string | null,"id": string,"job": string,"log": NonNullable<Json>,"outlet_id": string | null,"property_id": string | null,"service_date": string | null,"started_at": string,"status": string
                  }
                  Insert: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job": string,"log"?: NonNullable<Json>,"outlet_id"?: string | null,"property_id"?: string | null,"service_date"?: string | null,"started_at"?: string,"status"?: string
                  }
                  Update: {
                    "error"?: string | null,"finished_at"?: string | null,"id"?: string,"job"?: string,"log"?: NonNullable<Json>,"outlet_id"?: string | null,"property_id"?: string | null,"service_date"?: string | null,"started_at"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "job_runs_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "job_runs_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"live_events": {
                  Row: {
                    "acted_at": string | null,"acted_by": string | null,"at": string,"body": string | null,"decision_id": string | null,"id": string,"kind": string,"outlet_id": string,"payload": NonNullable<Json>,"property_id": string,"proposal": string | null,"service_date": string,"station_id": string | null,"status": string,"title": string
                  }
                  Insert: {
                    "acted_at"?: string | null,"acted_by"?: string | null,"at"?: string,"body"?: string | null,"decision_id"?: string | null,"id"?: string,"kind": string,"outlet_id": string,"payload"?: NonNullable<Json>,"property_id": string,"proposal"?: string | null,"service_date": string,"station_id"?: string | null,"status"?: string,"title": string
                  }
                  Update: {
                    "acted_at"?: string | null,"acted_by"?: string | null,"at"?: string,"body"?: string | null,"decision_id"?: string | null,"id"?: string,"kind"?: string,"outlet_id"?: string,"payload"?: NonNullable<Json>,"property_id"?: string,"proposal"?: string | null,"service_date"?: string,"station_id"?: string | null,"status"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "live_events_acted_by_fkey"
      columns: ["acted_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_events_decision_id_fkey"
      columns: ["decision_id"]
isOneToOne: false
      referencedRelation: "decisions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_events_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_events_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "live_events_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "active": boolean,"created_at": string,"id": string,"invited_email": string | null,"org_id": string,"property_id": string | null,"region_id": string | null,"role": string,"scope_type": string,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"invited_email"?: string | null,"org_id": string,"property_id"?: string | null,"region_id"?: string | null,"role": string,"scope_type": string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"id"?: string,"invited_email"?: string | null,"org_id"?: string,"property_id"?: string | null,"region_id"?: string | null,"role"?: string,"scope_type"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"nightly_reports": {
                  Row: {
                    "best_log": Json | null,"computed_at": string,"grades": NonNullable<Json>,"id": string,"property_id": string,"service_date": string,"summary": NonNullable<Json>
                  }
                  Insert: {
                    "best_log"?: Json | null,"computed_at"?: string,"grades"?: NonNullable<Json>,"id"?: string,"property_id": string,"service_date": string,"summary"?: NonNullable<Json>
                  }
                  Update: {
                    "best_log"?: Json | null,"computed_at"?: string,"grades"?: NonNullable<Json>,"id"?: string,"property_id"?: string,"service_date"?: string,"summary"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "nightly_reports_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"channels": (string)[],"created_at": string,"href": string | null,"id": string,"kind": string,"payload": NonNullable<Json>,"property_id": string,"read_at": string | null,"sent_at": string | null,"team_member_id": string | null,"title": string,"user_id": string | null
                  }
                  Insert: {
                    "body"?: string | null,"channels"?: (string)[],"created_at"?: string,"href"?: string | null,"id"?: string,"kind": string,"payload"?: NonNullable<Json>,"property_id": string,"read_at"?: string | null,"sent_at"?: string | null,"team_member_id"?: string | null,"title": string,"user_id"?: string | null
                  }
                  Update: {
                    "body"?: string | null,"channels"?: (string)[],"created_at"?: string,"href"?: string | null,"id"?: string,"kind"?: string,"payload"?: NonNullable<Json>,"property_id"?: string,"read_at"?: string | null,"sent_at"?: string | null,"team_member_id"?: string | null,"title"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_team_member_id_fkey"
      columns: ["team_member_id"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"orgs": {
                  Row: {
                    "created_at": string,"currency": string,"id": string,"name": string,"settings": NonNullable<Json>,"slug": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name": string,"settings"?: NonNullable<Json>,"slug": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"id"?: string,"name"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"outcomes": {
                  Row: {
                    "actual_covers": number | null,"baseline_g_per_cover": number | null,"co2e_avoided_kg": number | null,"co2e_kg": number | null,"computed_at": string,"currency": string,"decisions_approved": number | null,"decisions_total": number | null,"error_pct": number | null,"food_cost": number | null,"forecast_covers_p10": number | null,"forecast_covers_p50": number | null,"forecast_covers_p90": number | null,"forecast_id": string | null,"id": string,"mape": number | null,"notes": string | null,"outlet_id": string,"plan_followed_pct": number | null,"property_id": string,"saving_bin_scale": number | null,"saving_serviceflow": number | null,"saving_total": number | null,"service_date": string,"usual_covers": number | null,"waste_avoided_kg": number | null,"waste_g_per_cover": number | null,"waste_kg": number | null,"within_band": boolean | null
                  }
                  Insert: {
                    "actual_covers"?: number | null,"baseline_g_per_cover"?: number | null,"co2e_avoided_kg"?: number | null,"co2e_kg"?: number | null,"computed_at"?: string,"currency"?: string,"decisions_approved"?: number | null,"decisions_total"?: number | null,"error_pct"?: number | null,"food_cost"?: number | null,"forecast_covers_p10"?: number | null,"forecast_covers_p50"?: number | null,"forecast_covers_p90"?: number | null,"forecast_id"?: string | null,"id"?: string,"mape"?: number | null,"notes"?: string | null,"outlet_id": string,"plan_followed_pct"?: number | null,"property_id": string,"saving_bin_scale"?: number | null,"saving_serviceflow"?: number | null,"saving_total"?: number | null,"service_date": string,"usual_covers"?: number | null,"waste_avoided_kg"?: number | null,"waste_g_per_cover"?: number | null,"waste_kg"?: number | null,"within_band"?: boolean | null
                  }
                  Update: {
                    "actual_covers"?: number | null,"baseline_g_per_cover"?: number | null,"co2e_avoided_kg"?: number | null,"co2e_kg"?: number | null,"computed_at"?: string,"currency"?: string,"decisions_approved"?: number | null,"decisions_total"?: number | null,"error_pct"?: number | null,"food_cost"?: number | null,"forecast_covers_p10"?: number | null,"forecast_covers_p50"?: number | null,"forecast_covers_p90"?: number | null,"forecast_id"?: string | null,"id"?: string,"mape"?: number | null,"notes"?: string | null,"outlet_id"?: string,"plan_followed_pct"?: number | null,"property_id"?: string,"saving_bin_scale"?: number | null,"saving_serviceflow"?: number | null,"saving_total"?: number | null,"service_date"?: string,"usual_covers"?: number | null,"waste_avoided_kg"?: number | null,"waste_g_per_cover"?: number | null,"waste_kg"?: number | null,"within_band"?: boolean | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "outcomes_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcomes_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "v_latest_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcomes_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "outcomes_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"outlets": {
                  Row: {
                    "active": boolean,"capacity_pax": number | null,"closes_at": string,"created_at": string,"id": string,"meal_period": string,"name": string,"opens_at": string,"outlet_type": string,"property_id": string,"settings": NonNullable<Json>,"slug": string,"sort_order": number,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"capacity_pax"?: number | null,"closes_at"?: string,"created_at"?: string,"id"?: string,"meal_period"?: string,"name": string,"opens_at"?: string,"outlet_type": string,"property_id": string,"settings"?: NonNullable<Json>,"slug": string,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"capacity_pax"?: number | null,"closes_at"?: string,"created_at"?: string,"id"?: string,"meal_period"?: string,"name"?: string,"opens_at"?: string,"outlet_type"?: string,"property_id"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "outlets_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_corrections": {
                  Row: {
                    "created_at": string,"created_by": string | null,"factor": number,"id": string,"note": string | null,"outlet_id": string,"property_id": string,"service_date": string,"station_id": string | null
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"factor"?: number,"id"?: string,"note"?: string | null,"outlet_id": string,"property_id": string,"service_date": string,"station_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"factor"?: number,"id"?: string,"note"?: string | null,"outlet_id"?: string,"property_id"?: string,"service_date"?: string,"station_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_corrections_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_corrections_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_corrections_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "plan_corrections_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id"]
    }
                  ]
                },"planned_works": {
                  Row: {
                    "areas": string | null,"asset_id": string | null,"checks": NonNullable<Json>,"confirmed_at": string | null,"confirmed_by": string | null,"created_at": string,"duration_min": number,"id": string,"notify_guests": boolean,"outlet_id": string | null,"property_id": string,"starts_at": string,"status": string,"title": string,"updated_at": string,"verdict": string
                  }
                  Insert: {
                    "areas"?: string | null,"asset_id"?: string | null,"checks"?: NonNullable<Json>,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"duration_min"?: number,"id"?: string,"notify_guests"?: boolean,"outlet_id"?: string | null,"property_id": string,"starts_at": string,"status"?: string,"title": string,"updated_at"?: string,"verdict"?: string
                  }
                  Update: {
                    "areas"?: string | null,"asset_id"?: string | null,"checks"?: NonNullable<Json>,"confirmed_at"?: string | null,"confirmed_by"?: string | null,"created_at"?: string,"duration_min"?: number,"id"?: string,"notify_guests"?: boolean,"outlet_id"?: string | null,"property_id"?: string,"starts_at"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"verdict"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planned_works_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planned_works_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planned_works_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planned_works_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"pms_daily": {
                  Row: {
                    "arrivals": number,"created_at": string,"departures": number,"departures_am": number,"early_checkins": number,"group_manifest": NonNullable<Json>,"guests_in_house": number,"id": string,"late_arrivals_prev": number,"los_distribution": NonNullable<Json>,"lounge_eligible": number,"loyalty_tier_mix": NonNullable<Json>,"nationality_mix": NonNullable<Json>,"property_id": string,"rate_code_mix": NonNullable<Json>,"raw": Json | null,"rooms_occupied": number,"rooms_total": number | null,"service_date": string,"source": string,"suites_occupied": number,"travel_source_mix": NonNullable<Json>,"updated_at": string,"vip_arrivals": number
                  }
                  Insert: {
                    "arrivals"?: number,"created_at"?: string,"departures"?: number,"departures_am"?: number,"early_checkins"?: number,"group_manifest"?: NonNullable<Json>,"guests_in_house"?: number,"id"?: string,"late_arrivals_prev"?: number,"los_distribution"?: NonNullable<Json>,"lounge_eligible"?: number,"loyalty_tier_mix"?: NonNullable<Json>,"nationality_mix"?: NonNullable<Json>,"property_id": string,"rate_code_mix"?: NonNullable<Json>,"raw"?: Json | null,"rooms_occupied": number,"rooms_total"?: number | null,"service_date": string,"source"?: string,"suites_occupied"?: number,"travel_source_mix"?: NonNullable<Json>,"updated_at"?: string,"vip_arrivals"?: number
                  }
                  Update: {
                    "arrivals"?: number,"created_at"?: string,"departures"?: number,"departures_am"?: number,"early_checkins"?: number,"group_manifest"?: NonNullable<Json>,"guests_in_house"?: number,"id"?: string,"late_arrivals_prev"?: number,"los_distribution"?: NonNullable<Json>,"lounge_eligible"?: number,"loyalty_tier_mix"?: NonNullable<Json>,"nationality_mix"?: NonNullable<Json>,"property_id"?: string,"rate_code_mix"?: NonNullable<Json>,"raw"?: Json | null,"rooms_occupied"?: number,"rooms_total"?: number | null,"service_date"?: string,"source"?: string,"suites_occupied"?: number,"travel_source_mix"?: NonNullable<Json>,"updated_at"?: string,"vip_arrivals"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "pms_daily_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_pace": {
                  Row: {
                    "at": string,"covers_seated": number,"id": string,"logged_by": string | null,"outlet_id": string,"property_id": string,"service_date": string,"source": string
                  }
                  Insert: {
                    "at"?: string,"covers_seated": number,"id"?: string,"logged_by"?: string | null,"outlet_id": string,"property_id": string,"service_date": string,"source"?: string
                  }
                  Update: {
                    "at"?: string,"covers_seated"?: number,"id"?: string,"logged_by"?: string | null,"outlet_id"?: string,"property_id"?: string,"service_date"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_pace_logged_by_fkey"
      columns: ["logged_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_pace_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_pace_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"pos_variances": {
                  Row: {
                    "amount": number,"created_at": string,"detail": string,"due_by": string | null,"id": string,"items": number | null,"kind": string,"outlet_id": string | null,"property_id": string,"resolved_at": string | null,"resolved_by": string | null,"service_date": string,"status": string
                  }
                  Insert: {
                    "amount"?: number,"created_at"?: string,"detail": string,"due_by"?: string | null,"id"?: string,"items"?: number | null,"kind": string,"outlet_id"?: string | null,"property_id": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"service_date": string,"status"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"detail"?: string,"due_by"?: string | null,"id"?: string,"items"?: number | null,"kind"?: string,"outlet_id"?: string | null,"property_id"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"service_date"?: string,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "pos_variances_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_variances_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "pos_variances_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"prediction_log": {
                  Row: {
                    "created_at": string,"features": NonNullable<Json>,"forecast_id": string | null,"id": string,"model_version": string,"outcome": Json | null,"outlet_id": string,"prediction": NonNullable<Json>,"property_id": string,"service_date": string
                  }
                  Insert: {
                    "created_at"?: string,"features"?: NonNullable<Json>,"forecast_id"?: string | null,"id"?: string,"model_version": string,"outcome"?: Json | null,"outlet_id": string,"prediction"?: NonNullable<Json>,"property_id": string,"service_date": string
                  }
                  Update: {
                    "created_at"?: string,"features"?: NonNullable<Json>,"forecast_id"?: string | null,"id"?: string,"model_version"?: string,"outcome"?: Json | null,"outlet_id"?: string,"prediction"?: NonNullable<Json>,"property_id"?: string,"service_date"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "prediction_log_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prediction_log_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "v_latest_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prediction_log_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "prediction_log_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"properties": {
                  Row: {
                    "active": boolean,"brand": string | null,"city": string | null,"country_code": string,"created_at": string,"currency": string,"id": string,"keys": number,"name": string,"org_id": string,"region_id": string | null,"settings": NonNullable<Json>,"slug": string,"timezone": string,"updated_at": string
                  }
                  Insert: {
                    "active"?: boolean,"brand"?: string | null,"city"?: string | null,"country_code"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"keys": number,"name": string,"org_id": string,"region_id"?: string | null,"settings"?: NonNullable<Json>,"slug": string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"brand"?: string | null,"city"?: string | null,"country_code"?: string,"created_at"?: string,"currency"?: string,"id"?: string,"keys"?: number,"name"?: string,"org_id"?: string,"region_id"?: string | null,"settings"?: NonNullable<Json>,"slug"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_region_id_fkey"
      columns: ["region_id"]
isOneToOne: false
      referencedRelation: "regions"
      referencedColumns: ["id"]
    }
                  ]
                },"property_financials": {
                  Row: {
                    "asset_value": number | null,"created_at": string,"currency": string,"fx_to_org": number,"gop": number | null,"id": string,"noi": number | null,"occupancy": number | null,"period": string,"property_id": string,"revenue": number | null,"revpar": number | null,"source": string,"updated_at": string
                  }
                  Insert: {
                    "asset_value"?: number | null,"created_at"?: string,"currency"?: string,"fx_to_org"?: number,"gop"?: number | null,"id"?: string,"noi"?: number | null,"occupancy"?: number | null,"period": string,"property_id": string,"revenue"?: number | null,"revpar"?: number | null,"source"?: string,"updated_at"?: string
                  }
                  Update: {
                    "asset_value"?: number | null,"created_at"?: string,"currency"?: string,"fx_to_org"?: number,"gop"?: number | null,"id"?: string,"noi"?: number | null,"occupancy"?: number | null,"period"?: string,"property_id"?: string,"revenue"?: number | null,"revpar"?: number | null,"source"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "property_financials_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"push_subscriptions": {
                  Row: {
                    "created_at": string,"endpoint": string,"id": string,"keys": NonNullable<Json>,"user_agent": string | null,"user_id": string
                  }
                  Insert: {
                    "created_at"?: string,"endpoint": string,"id"?: string,"keys": NonNullable<Json>,"user_agent"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"endpoint"?: string,"id"?: string,"keys"?: NonNullable<Json>,"user_agent"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "push_subscriptions_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"regions": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"org_id": string,"slug": string,"sort_order": number
                  }
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"org_id": string,"slug": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"org_id"?: string,"slug"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "regions_org_id_fkey"
      columns: ["org_id"]
isOneToOne: false
      referencedRelation: "orgs"
      referencedColumns: ["id"]
    }
                  ]
                },"room_tasks": {
                  Row: {
                    "arrival_at": string | null,"created_at": string,"departure_at": string | null,"dnd_until": string | null,"done_at": string | null,"done_by": string | null,"id": string,"inspected_at": string | null,"inspected_by": string | null,"kind": string,"minutes": number | null,"needed_by": string | null,"notes": string | null,"priority": number,"property_id": string,"room_id": string,"service_date": string,"source": string,"started_at": string | null,"status": string,"updated_at": string,"vip": boolean
                  }
                  Insert: {
                    "arrival_at"?: string | null,"created_at"?: string,"departure_at"?: string | null,"dnd_until"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"inspected_at"?: string | null,"inspected_by"?: string | null,"kind": string,"minutes"?: number | null,"needed_by"?: string | null,"notes"?: string | null,"priority"?: number,"property_id": string,"room_id": string,"service_date": string,"source"?: string,"started_at"?: string | null,"status"?: string,"updated_at"?: string,"vip"?: boolean
                  }
                  Update: {
                    "arrival_at"?: string | null,"created_at"?: string,"departure_at"?: string | null,"dnd_until"?: string | null,"done_at"?: string | null,"done_by"?: string | null,"id"?: string,"inspected_at"?: string | null,"inspected_by"?: string | null,"kind"?: string,"minutes"?: number | null,"needed_by"?: string | null,"notes"?: string | null,"priority"?: number,"property_id"?: string,"room_id"?: string,"service_date"?: string,"source"?: string,"started_at"?: string | null,"status"?: string,"updated_at"?: string,"vip"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "room_tasks_done_by_fkey"
      columns: ["done_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_tasks_inspected_by_fkey"
      columns: ["inspected_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_tasks_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "room_tasks_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                },"rooms": {
                  Row: {
                    "active": boolean,"floor": number | null,"id": string,"is_suite": boolean,"number": string,"property_id": string,"room_type": string,"target_minutes": number
                  }
                  Insert: {
                    "active"?: boolean,"floor"?: number | null,"id"?: string,"is_suite"?: boolean,"number": string,"property_id": string,"room_type"?: string,"target_minutes"?: number
                  }
                  Update: {
                    "active"?: boolean,"floor"?: number | null,"id"?: string,"is_suite"?: boolean,"number"?: string,"property_id"?: string,"room_type"?: string,"target_minutes"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "rooms_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"roster_shifts": {
                  Row: {
                    "acknowledged_at": string | null,"created_at": string,"ends_at": string,"hours": number,"id": string,"note": string | null,"property_id": string,"service_date": string,"service_line_id": string,"starts_at": string,"station_id": string | null,"status": string,"team_member_id": string | null,"updated_at": string
                  }
                  Insert: {
                    "acknowledged_at"?: string | null,"created_at"?: string,"ends_at": string,"hours": number,"id"?: string,"note"?: string | null,"property_id": string,"service_date": string,"service_line_id": string,"starts_at": string,"station_id"?: string | null,"status"?: string,"team_member_id"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "acknowledged_at"?: string | null,"created_at"?: string,"ends_at"?: string,"hours"?: number,"id"?: string,"note"?: string | null,"property_id"?: string,"service_date"?: string,"service_line_id"?: string,"starts_at"?: string,"station_id"?: string | null,"status"?: string,"team_member_id"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_shifts_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_shifts_service_line_id_fkey"
      columns: ["service_line_id"]
isOneToOne: false
      referencedRelation: "service_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_shifts_service_line_id_fkey"
      columns: ["service_line_id"]
isOneToOne: false
      referencedRelation: "v_staffing_day"
      referencedColumns: ["service_line_id"]
    },{
      foreignKeyName: "roster_shifts_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_shifts_team_member_id_fkey"
      columns: ["team_member_id"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    }
                  ]
                },"roster_suggestions": {
                  Row: {
                    "applied_at": string | null,"applied_by": string | null,"created_at": string,"delta_hours": number | null,"detail": string | null,"id": string,"moves": NonNullable<Json>,"property_id": string,"service_date": string | null,"service_line_id": string | null,"status": string,"title": string,"week_start": string
                  }
                  Insert: {
                    "applied_at"?: string | null,"applied_by"?: string | null,"created_at"?: string,"delta_hours"?: number | null,"detail"?: string | null,"id"?: string,"moves"?: NonNullable<Json>,"property_id": string,"service_date"?: string | null,"service_line_id"?: string | null,"status"?: string,"title": string,"week_start": string
                  }
                  Update: {
                    "applied_at"?: string | null,"applied_by"?: string | null,"created_at"?: string,"delta_hours"?: number | null,"detail"?: string | null,"id"?: string,"moves"?: NonNullable<Json>,"property_id"?: string,"service_date"?: string | null,"service_line_id"?: string | null,"status"?: string,"title"?: string,"week_start"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roster_suggestions_applied_by_fkey"
      columns: ["applied_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_suggestions_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_suggestions_service_line_id_fkey"
      columns: ["service_line_id"]
isOneToOne: false
      referencedRelation: "service_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roster_suggestions_service_line_id_fkey"
      columns: ["service_line_id"]
isOneToOne: false
      referencedRelation: "v_staffing_day"
      referencedColumns: ["service_line_id"]
    }
                  ]
                },"service_actuals": {
                  Row: {
                    "actual_covers": number,"by_wave": NonNullable<Json>,"closed_at": string,"closed_by": string | null,"id": string,"outlet_id": string,"property_id": string,"revenue": number | null,"service_date": string,"source": string
                  }
                  Insert: {
                    "actual_covers": number,"by_wave"?: NonNullable<Json>,"closed_at"?: string,"closed_by"?: string | null,"id"?: string,"outlet_id": string,"property_id": string,"revenue"?: number | null,"service_date": string,"source"?: string
                  }
                  Update: {
                    "actual_covers"?: number,"by_wave"?: NonNullable<Json>,"closed_at"?: string,"closed_by"?: string | null,"id"?: string,"outlet_id"?: string,"property_id"?: string,"revenue"?: number | null,"service_date"?: string,"source"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_actuals_closed_by_fkey"
      columns: ["closed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_actuals_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_actuals_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"service_lines": {
                  Row: {
                    "active": boolean,"department": string,"ends_at": string | null,"fixed_hours": number,"hours_per_cover": number | null,"id": string,"min_hours": number,"minutes_per_room": number | null,"name": string,"outlet_id": string | null,"property_id": string,"shift_label": string | null,"sort_order": number,"starts_at": string | null
                  }
                  Insert: {
                    "active"?: boolean,"department": string,"ends_at"?: string | null,"fixed_hours"?: number,"hours_per_cover"?: number | null,"id"?: string,"min_hours"?: number,"minutes_per_room"?: number | null,"name": string,"outlet_id"?: string | null,"property_id": string,"shift_label"?: string | null,"sort_order"?: number,"starts_at"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"department"?: string,"ends_at"?: string | null,"fixed_hours"?: number,"hours_per_cover"?: number | null,"id"?: string,"min_hours"?: number,"minutes_per_room"?: number | null,"name"?: string,"outlet_id"?: string | null,"property_id"?: string,"shift_label"?: string | null,"sort_order"?: number,"starts_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_lines_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_lines_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"staffing_demand": {
                  Row: {
                    "basis": NonNullable<Json>,"computed_at": string,"demand_hours": number,"id": string,"property_id": string,"service_date": string,"service_line_id": string
                  }
                  Insert: {
                    "basis"?: NonNullable<Json>,"computed_at"?: string,"demand_hours": number,"id"?: string,"property_id": string,"service_date": string,"service_line_id": string
                  }
                  Update: {
                    "basis"?: NonNullable<Json>,"computed_at"?: string,"demand_hours"?: number,"id"?: string,"property_id"?: string,"service_date"?: string,"service_line_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staffing_demand_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staffing_demand_service_line_id_fkey"
      columns: ["service_line_id"]
isOneToOne: false
      referencedRelation: "service_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staffing_demand_service_line_id_fkey"
      columns: ["service_line_id"]
isOneToOne: false
      referencedRelation: "v_staffing_day"
      referencedColumns: ["service_line_id"]
    }
                  ]
                },"station_plans": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"delta_pct": number | null,"expected_consumption": number | null,"forecast_id": string,"id": string,"prepped_at": string | null,"prepped_by": string | null,"property_id": string,"qty": number,"reason": string | null,"station_id": string,"status": string,"uncertainty": number | null,"unit": string,"updated_at": string,"usual_qty": number | null,"wave_id": string | null
                  }
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"delta_pct"?: number | null,"expected_consumption"?: number | null,"forecast_id": string,"id"?: string,"prepped_at"?: string | null,"prepped_by"?: string | null,"property_id": string,"qty": number,"reason"?: string | null,"station_id": string,"status"?: string,"uncertainty"?: number | null,"unit"?: string,"updated_at"?: string,"usual_qty"?: number | null,"wave_id"?: string | null
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"delta_pct"?: number | null,"expected_consumption"?: number | null,"forecast_id"?: string,"id"?: string,"prepped_at"?: string | null,"prepped_by"?: string | null,"property_id"?: string,"qty"?: number,"reason"?: string | null,"station_id"?: string,"status"?: string,"uncertainty"?: number | null,"unit"?: string,"updated_at"?: string,"usual_qty"?: number | null,"wave_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "station_plans_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_plans_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_plans_forecast_id_fkey"
      columns: ["forecast_id"]
isOneToOne: false
      referencedRelation: "v_latest_forecasts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_plans_prepped_by_fkey"
      columns: ["prepped_by"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_plans_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_plans_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "station_plans_wave_id_fkey"
      columns: ["wave_id"]
isOneToOne: false
      referencedRelation: "waves"
      referencedColumns: ["id"]
    }
                  ]
                },"stations": {
                  Row: {
                    "active": boolean,"base_par": number,"co2e_factor": number | null,"cost_per_unit": number,"created_at": string,"dow_profile": NonNullable<Json>,"food_category": string,"high_value": boolean,"id": string,"kg_per_unit": number,"name": string,"nationality_priors": NonNullable<Json>,"outlet_id": string,"property_id": string,"settings": NonNullable<Json>,"slug": string,"sort_order": number,"station_kind": string,"unit": string,"updated_at": string,"usual_covers": number | null,"weather_profile": NonNullable<Json>
                  }
                  Insert: {
                    "active"?: boolean,"base_par"?: number,"co2e_factor"?: number | null,"cost_per_unit"?: number,"created_at"?: string,"dow_profile"?: NonNullable<Json>,"food_category"?: string,"high_value"?: boolean,"id"?: string,"kg_per_unit"?: number,"name": string,"nationality_priors"?: NonNullable<Json>,"outlet_id": string,"property_id": string,"settings"?: NonNullable<Json>,"slug": string,"sort_order"?: number,"station_kind"?: string,"unit"?: string,"updated_at"?: string,"usual_covers"?: number | null,"weather_profile"?: NonNullable<Json>
                  }
                  Update: {
                    "active"?: boolean,"base_par"?: number,"co2e_factor"?: number | null,"cost_per_unit"?: number,"created_at"?: string,"dow_profile"?: NonNullable<Json>,"food_category"?: string,"high_value"?: boolean,"id"?: string,"kg_per_unit"?: number,"name"?: string,"nationality_priors"?: NonNullable<Json>,"outlet_id"?: string,"property_id"?: string,"settings"?: NonNullable<Json>,"slug"?: string,"sort_order"?: number,"station_kind"?: string,"unit"?: string,"updated_at"?: string,"usual_covers"?: number | null,"weather_profile"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "stations_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stations_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"team_members": {
                  Row: {
                    "active": boolean,"created_at": string,"department": string,"email": string | null,"hourly_cost": number | null,"id": string,"name": string,"phone": string | null,"pool": boolean,"property_id": string,"role": string,"updated_at": string,"user_id": string | null
                  }
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"department": string,"email"?: string | null,"hourly_cost"?: number | null,"id"?: string,"name": string,"phone"?: string | null,"pool"?: boolean,"property_id": string,"role"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"department"?: string,"email"?: string | null,"hourly_cost"?: number | null,"id"?: string,"name"?: string,"phone"?: string | null,"pool"?: boolean,"property_id"?: string,"role"?: string,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "team_members_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "team_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    }
                  ]
                },"users": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"locale": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"locale"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"locale"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"voice_logs": {
                  Row: {
                    "applied_id": string | null,"applied_table": string | null,"confidence": number | null,"created_at": string,"department": string,"id": string,"language": string | null,"logged_by": string | null,"outlet_id": string | null,"parsed": NonNullable<Json>,"property_id": string,"seconds_to_log": number | null,"transcript": string
                  }
                  Insert: {
                    "applied_id"?: string | null,"applied_table"?: string | null,"confidence"?: number | null,"created_at"?: string,"department"?: string,"id"?: string,"language"?: string | null,"logged_by"?: string | null,"outlet_id"?: string | null,"parsed"?: NonNullable<Json>,"property_id": string,"seconds_to_log"?: number | null,"transcript": string
                  }
                  Update: {
                    "applied_id"?: string | null,"applied_table"?: string | null,"confidence"?: number | null,"created_at"?: string,"department"?: string,"id"?: string,"language"?: string | null,"logged_by"?: string | null,"outlet_id"?: string | null,"parsed"?: NonNullable<Json>,"property_id"?: string,"seconds_to_log"?: number | null,"transcript"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "voice_logs_logged_by_fkey"
      columns: ["logged_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_logs_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "voice_logs_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"waste_logs": {
                  Row: {
                    "co2e_kg": number,"created_at": string,"id": string,"kg": number,"language": string | null,"logged_at": string,"logged_by": string | null,"outlet_id": string,"property_id": string,"reason": string | null,"seconds_to_log": number | null,"service_date": string,"source": string,"station_id": string | null,"transcript": string | null,"wave_id": string | null
                  }
                  Insert: {
                    "co2e_kg"?: number,"created_at"?: string,"id"?: string,"kg": number,"language"?: string | null,"logged_at"?: string,"logged_by"?: string | null,"outlet_id": string,"property_id": string,"reason"?: string | null,"seconds_to_log"?: number | null,"service_date": string,"source"?: string,"station_id"?: string | null,"transcript"?: string | null,"wave_id"?: string | null
                  }
                  Update: {
                    "co2e_kg"?: number,"created_at"?: string,"id"?: string,"kg"?: number,"language"?: string | null,"logged_at"?: string,"logged_by"?: string | null,"outlet_id"?: string,"property_id"?: string,"reason"?: string | null,"seconds_to_log"?: number | null,"service_date"?: string,"source"?: string,"station_id"?: string | null,"transcript"?: string | null,"wave_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "waste_logs_logged_by_fkey"
      columns: ["logged_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_logs_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_logs_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_logs_station_id_fkey"
      columns: ["station_id"]
isOneToOne: false
      referencedRelation: "stations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waste_logs_wave_id_fkey"
      columns: ["wave_id"]
isOneToOne: false
      referencedRelation: "waves"
      referencedColumns: ["id"]
    }
                  ]
                },"waves": {
                  Row: {
                    "id": string,"label": string,"outlet_id": string,"property_id": string,"share_default": number,"sort_order": number,"starts_at": string
                  }
                  Insert: {
                    "id"?: string,"label": string,"outlet_id": string,"property_id": string,"share_default"?: number,"sort_order"?: number,"starts_at": string
                  }
                  Update: {
                    "id"?: string,"label"?: string,"outlet_id"?: string,"property_id"?: string,"share_default"?: number,"sort_order"?: number,"starts_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "waves_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "waves_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"weather_daily": {
                  Row: {
                    "condition": string | null,"created_at": string,"id": string,"property_id": string,"rain_prob": number | null,"service_date": string,"source": string,"temp_c": number | null
                  }
                  Insert: {
                    "condition"?: string | null,"created_at"?: string,"id"?: string,"property_id": string,"rain_prob"?: number | null,"service_date": string,"source"?: string,"temp_c"?: number | null
                  }
                  Update: {
                    "condition"?: string | null,"created_at"?: string,"id"?: string,"property_id"?: string,"rain_prob"?: number | null,"service_date"?: string,"source"?: string,"temp_c"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "weather_daily_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"work_orders": {
                  Row: {
                    "asset_id": string | null,"assigned_to": string | null,"closed_at": string | null,"created_at": string,"detail": string | null,"due_at": string | null,"guest_impact": string,"id": string,"opened_at": string,"outlet_id": string | null,"priority": string,"property_id": string,"raised_by": string | null,"room_id": string | null,"source": string,"status": string,"title": string,"updated_at": string,"vendor": string | null
                  }
                  Insert: {
                    "asset_id"?: string | null,"assigned_to"?: string | null,"closed_at"?: string | null,"created_at"?: string,"detail"?: string | null,"due_at"?: string | null,"guest_impact"?: string,"id"?: string,"opened_at"?: string,"outlet_id"?: string | null,"priority"?: string,"property_id": string,"raised_by"?: string | null,"room_id"?: string | null,"source"?: string,"status"?: string,"title": string,"updated_at"?: string,"vendor"?: string | null
                  }
                  Update: {
                    "asset_id"?: string | null,"assigned_to"?: string | null,"closed_at"?: string | null,"created_at"?: string,"detail"?: string | null,"due_at"?: string | null,"guest_impact"?: string,"id"?: string,"opened_at"?: string,"outlet_id"?: string | null,"priority"?: string,"property_id"?: string,"raised_by"?: string | null,"room_id"?: string | null,"source"?: string,"status"?: string,"title"?: string,"updated_at"?: string,"vendor"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "work_orders_asset_id_fkey"
      columns: ["asset_id"]
isOneToOne: false
      referencedRelation: "assets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "team_members"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_raised_by_fkey"
      columns: ["raised_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "work_orders_room_id_fkey"
      columns: ["room_id"]
isOneToOne: false
      referencedRelation: "rooms"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_latest_forecasts": {
                  Row: {
                    "confirmed_at": string | null,"confirmed_by": string | null,"covers_p10": number | null,"covers_p50": number | null,"covers_p90": number | null,"created_at": string | null,"drivers": Json | null,"id": string | null,"inputs": Json | null,"issued_at": string | null,"kind": string | null,"model_version": string | null,"occupancy": number | null,"outlet_id": string | null,"property_id": string | null,"service_date": string | null,"signals_read": number | null,"status": string | null,"updated_at": string | null,"usual_covers": number | null,"version": number | null,"wave_split": Json | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "forecasts_confirmed_by_fkey"
      columns: ["confirmed_by"]
isOneToOne: false
      referencedRelation: "users"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forecasts_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "forecasts_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                },"v_staffing_day": {
                  Row: {
                    "basis": Json | null,"delta_hours": number | null,"demand_hours": number | null,"department": string | null,"outlet_id": string | null,"planned_hours": number | null,"property_id": string | null,"service_date": string | null,"service_line": string | null,"service_line_id": string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "service_lines_outlet_id_fkey"
      columns: ["outlet_id"]
isOneToOne: false
      referencedRelation: "outlets"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "service_lines_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "sf_can":
{ Args: { "p_property": string,"p_roles": (string)[] }; Returns: boolean
                           },
"sf_co2e_factor":
{ Args: { "p_property": string,"p_station": string }; Returns: number
                           },
"sf_is_member":
{ Args: { "p_property": string }; Returns: boolean
                           },
"sf_my_org_ids":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"sf_my_property_ids":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"sf_my_roles":
{ Args: { "p_property": string }; Returns: (string)[]
                           },
"sf_portfolio_ops":
{ Args: { "p_date"?: string }; Returns: {
              "accuracy_4w": number,"cooked_vs_plan_pct": number,"covers_tomorrow": number,"hours_short": number,"keys": number,"property": string,"property_id": string,"region": string,"region_id": string,"short_lines": string
            }[]
                           },
"sf_portfolio_quarter":
{ Args: { "p_quarter_start"?: string }; Returns: {
              "asset_value": number,"currency": string,"energy_vs_baseline_pct": number,"gop": number,"gop_margin": number,"gop_margin_ly": number,"keys": number,"noi": number,"noi_yield": number,"property": string,"property_id": string,"region": string,"region_id": string,"revenue": number
            }[]
                           },
"sf_waste_by_station":
{ Args: { "p_date": string,"p_outlet": string,"p_weeks"?: number }; Returns: {
              "avg_kg": number,"delta_pct": number,"kg": number,"station": string,"station_id": string
            }[]
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
  "public": {
          Enums: {
            
          }
        }
} as const
