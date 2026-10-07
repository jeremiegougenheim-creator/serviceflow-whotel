import "server-only";
import { cookies } from "next/headers";

export type Theme = "system" | "light" | "dark";
export const THEME_COOKIE = "sf_theme";

/** The appearance chosen in the account menu; "system" follows the device. */
export async function readTheme(): Promise<Theme> {
  const v = (await cookies()).get(THEME_COOKIE)?.value;
  return v === "light" || v === "dark" ? v : "system";
}

export const THEME_COLOR = { light: "#f4efe5", dark: "#0e1c24" } as const;
