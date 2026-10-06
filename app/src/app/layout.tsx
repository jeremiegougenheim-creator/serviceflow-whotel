import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/register-sw";

export const metadata: Metadata = {
  title: { default: "ServiceFlow by SparkEdge", template: "%s · ServiceFlow" },
  description: "Tomorrow's kitchen production and staffing plan, built from the hotel's own forecast.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "ServiceFlow" },
};

export const viewport: Viewport = {
  themeColor: "#0e1c24",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
