import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ServiceFlow by SparkEdge",
    short_name: "ServiceFlow",
    description: "Tomorrow's kitchen production and staffing plan, built from the hotel's own forecast.",
    start_url: "/",
    display: "standalone",
    background_color: "#0e1c24",
    theme_color: "#0e1c24",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
