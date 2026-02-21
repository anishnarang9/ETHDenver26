import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: ".next-web",
  experimental: {
    typedRoutes: false,
  },
};

export default nextConfig;
