import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Prevent Turbopack from inferring the wrong monorepo/workspace root
    // when parent directories contain other lockfiles.
    root: path.join(__dirname),
  },
};

export default nextConfig;
