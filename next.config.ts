import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/v2/matches/*/result.pdf": ["./public/fonts/plus-jakarta-sans.ttf"],
  },
};

export default nextConfig;
