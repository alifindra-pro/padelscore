import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  outputFileTracingIncludes: {
    "/api/v2/matches/*/result.pdf": ["./public/fonts/plus-jakarta-sans.ttf"],
  },
  async headers() {
    // Signed-in areas must not be framed by other sites (clickjacking).
    // Public scoreboards stay embeddable, e.g. on a club website.
    const noFraming = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    ];
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      ...[
        "/admin/:path*",
        "/referee/:path*",
        "/login",
        "/invite",
        "/register",
      ].map((source) => ({ source, headers: noFraming })),
    ];
  },
};

export default nextConfig;
