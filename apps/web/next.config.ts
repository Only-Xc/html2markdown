import type { NextConfig } from "next";

const distDir = process.env.NEXT_DIST_DIR?.trim() || ".next";

const nextConfig: NextConfig = {
  distDir,
  transpilePackages: ["@html2md/core"],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
