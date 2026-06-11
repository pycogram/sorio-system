import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: path.join(__dirname, "../.."),
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;