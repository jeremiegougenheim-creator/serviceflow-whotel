/**
 * Lauds Property Theming System (CLAUDE.md §16)
 *
 * Each property has a row in property_themes. At boot, the (app)/layout.tsx
 * server component loads the theme and injects it as CSS custom properties
 * on the root <div>. All components reference var(--lauds-*) — never
 * hardcoded hex values.
 */

import { createClient } from "@/lib/supabase/server";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PropertyTheme {
  property_id:   string;
  theme_name:    string;
  bg_primary:    string;
  bg_card:       string;
  text_primary:  string;
  text_secondary:string;
  text_muted:    string;
  accent_action: string;
  accent_savings:string;
  accent_alert:  string;
  divider:       string;
  font_heading:  string;
}

// ─── Default theme (Lauds identity) ──────────────────────────────────────────

export const LAUDS_DEFAULT_THEME: Omit<PropertyTheme, "property_id"> = {
  theme_name:    "lauds_default",
  bg_primary:    "#FAF8F4",
  bg_card:       "#FFFFFF",
  text_primary:  "#2A2520",
  text_secondary:"#4A453F",
  text_muted:    "#8C857C",
  accent_action: "#16A6EC",
  accent_savings:"#4A8F5E",
  accent_alert:  "#E01E8C",
  divider:       "#E2DDD4",
  font_heading:  "Cormorant Garamond",
};

// ─── Built-in presets (apply via upsert when onboarding a property) ───────────

export const THEME_PRESETS: Record<string, Omit<PropertyTheme, "property_id">> = {
  lauds_default: LAUDS_DEFAULT_THEME,
  w_hotels_inproperty: {
    theme_name:    "w_hotels_inproperty",
    bg_primary:    "#F7F3EE",
    bg_card:       "#E0D9CF",
    text_primary:  "#1A1714",
    text_secondary:"#3E3934",
    text_muted:    "#8C8479",
    accent_action: "#2B5BDB",
    accent_savings:"#2DA06B",
    accent_alert:  "#D4431F",
    divider:       "#C4BAA9",
    font_heading:  "Cormorant Garamond",
  },
  resort_neutral: {
    theme_name:    "resort_neutral",
    bg_primary:    "#F5F1EB",
    bg_card:       "#FFFFFF",
    text_primary:  "#1E1B18",
    text_secondary:"#3D3830",
    text_muted:    "#7E7569",
    accent_action: "#1D6FA3",
    accent_savings:"#2A8A52",
    accent_alert:  "#C94B1A",
    divider:       "#D9D3CA",
    font_heading:  "Cormorant Garamond",
  },
  marriott_classic: {
    theme_name:    "marriott_classic",
    bg_primary:    "#F8F5F0",
    bg_card:       "#FFFFFF",
    text_primary:  "#1C1915",
    text_secondary:"#3A3630",
    text_muted:    "#7A746E",
    accent_action: "#B5121B",
    accent_savings:"#2D6A3F",
    accent_alert:  "#C94B1A",
    divider:       "#DDD7CE",
    font_heading:  "Cormorant Garamond",
  },
};

// ─── CSS variable map ─────────────────────────────────────────────────────────

/**
 * Convert a PropertyTheme into a React style object with CSS custom properties.
 * Apply to the outermost <div> in (app)/layout.tsx.
 */
export function buildCssVars(
  theme: Partial<PropertyTheme> | null
): Record<string, string> {
  const t = { ...LAUDS_DEFAULT_THEME, ...theme };
  return {
    "--lauds-bg-primary":    t.bg_primary,
    "--lauds-bg-card":       t.bg_card,
    "--lauds-text-primary":  t.text_primary,
    "--lauds-text-secondary":t.text_secondary,
    "--lauds-text-muted":    t.text_muted,
    "--lauds-accent-action": t.accent_action,
    "--lauds-accent-savings":t.accent_savings,
    "--lauds-accent-alert":  t.accent_alert,
    "--lauds-divider":       t.divider,
    "--lauds-font-heading":  `"${t.font_heading}"`,
  };
}

/**
 * Client-side helper — imperatively sets CSS vars on document.documentElement.
 * Used when the theme changes at runtime without a full navigation.
 */
export function applyTheme(theme: Partial<PropertyTheme> | null): void {
  const vars = buildCssVars(theme);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v);
  }
}

// ─── Server-side fetch ────────────────────────────────────────────────────────

/**
 * Load a property's theme from Supabase.
 * Returns null (caller falls back to LAUDS_DEFAULT_THEME) if not found.
 * Called in server components — do not use in client components.
 */
export async function getPropertyTheme(
  propertyId: string | null | undefined
): Promise<PropertyTheme | null> {
  if (!propertyId) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("property_themes")
    .select("*")
    .eq("property_id", propertyId)
    .single();

  if (error || !data) return null;
  return data as PropertyTheme;
}

/**
 * Resolve the active property_id for the current session.
 * Returns the first active membership's property (primary property).
 */
export async function getSessionPropertyId(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("memberships")
    .select("property_id")
    .eq("user_id", user.id)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  return (data as { property_id: string } | null)?.property_id ?? null;
}
