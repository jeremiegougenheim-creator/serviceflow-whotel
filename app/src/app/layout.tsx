import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";
import { readTheme, THEME_COLOR } from "@/lib/theme";

export async function generateMetadata(): Promise<Metadata> {
  const theme = await readTheme();
  return {
    title: { default: "ServiceFlow by SparkEdge", template: "%s · ServiceFlow" },
    description: "Tomorrow's kitchen production and staffing plan, built from the hotel's own forecast.",
    manifest: "/manifest.webmanifest",
    // iOS home-screen app: light text over the dark theme, dark text over paper
    appleWebApp: { capable: true, statusBarStyle: theme === "dark" ? "black-translucent" : "default", title: "ServiceFlow" },
  };
}

export async function generateViewport(): Promise<Viewport> {
  const theme = await readTheme();
  return {
    themeColor:
      theme === "system"
        ? [
            { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
            { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
          ]
        : THEME_COLOR[theme],
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const theme = await readTheme();
  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme}>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
