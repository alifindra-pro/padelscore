import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Declare your Neon services here
  preview: {
    realtime: {
      allowedOrigins: (
        process.env.PADEL_APP_ORIGINS ??
        "http://localhost:3100,http://127.0.0.1:3100"
      )
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    },
  },
  auth: false,
  functions: {
    scorefeed: {
      name: "Padel live score subscriptions",
      source: "./functions/scorefeed.ts",
      env: {
        PADEL_FUNCTION_SECRET: process.env.PADEL_FUNCTION_SECRET!,
        PADEL_REALTIME_SECRET: process.env.NEON_REALTIME_SECRET!,
        PADEL_REALTIME_URL: process.env.NEON_REALTIME_URL!,
      },
    },
    hello: { name: "Hello World", source: "./hello.ts" },
  },
  buckets: {
    // "private" is the default; use "public_read" for anonymous reads
    assets: { access: "private" },
  },
  // Branch policy: per-branch tuning
  branch: (branch) => {
    if (branch.isDefault) {
      // Default branch: no overrides, uses project defaults
      return {};
    }
    if (!branch.exists) {
      // New non-default branches: auto-expire
      // Run `neon checkout <name>` to create a new branch with these settings
      return { ttl: "7d" };
    }
    // Existing branch: no changes
    return {};
  },
});
