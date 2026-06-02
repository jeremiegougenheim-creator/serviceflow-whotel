import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/serviceflow-whotel",

  images: {
    unoptimized: true,
  },

  experimental: {
    serverComponentsExternalPackages: [],
  },
};

export default nextConfig;
