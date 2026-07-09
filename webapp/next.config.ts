import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Fija la raíz del workspace a esta carpeta (hay otros lockfiles en el repo/HOME).
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
