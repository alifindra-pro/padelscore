import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";

// Tests must never touch the database in `.env`, which may be production.
// Point them at TEST_DATABASE_URL (from the shell or `.env.test`) instead.
const readEnvFile = (name: string) => {
  const file = path.resolve(__dirname, "../..", name);
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
};
const endpoint = (url?: string) => {
  try {
    return url ? new URL(url).hostname.replace("-pooler", "") : "";
  } catch {
    return "";
  }
};

const testEnv = readEnvFile(".env.test");
const url = process.env.TEST_DATABASE_URL ?? testEnv.TEST_DATABASE_URL;
const directUrl =
  process.env.TEST_DATABASE_URL_UNPOOLED ??
  testEnv.TEST_DATABASE_URL_UNPOOLED ??
  url;

if (!url) {
  // Unreachable on purpose: database tests fail fast instead of falling back to `.env`.
  const unreachable = "postgresql://test-database-not-configured@127.0.0.1:9/none";
  process.env.DATABASE_URL = unreachable;
  process.env.DATABASE_URL_UNPOOLED = unreachable;
  console.warn(
    "[tests] TEST_DATABASE_URL belum diatur di .env.test; test yang memakai database akan gagal.",
  );
} else {
  const production = readEnvFile(".env.neon-production");
  const productionHosts = [
    production.DATABASE_URL,
    production.DATABASE_URL_UNPOOLED,
    ...(process.env.PRODUCTION_DATABASE_HOSTS ?? "").split(","),
  ]
    .map((value) => (value?.includes("://") ? endpoint(value) : value?.trim()))
    .filter(Boolean);
  if ([endpoint(url), endpoint(directUrl)].some((h) => productionHosts.includes(h)))
    throw new Error(
      "[tests] TEST_DATABASE_URL mengarah ke database produksi. Gunakan branch development/test.",
    );
  process.env.DATABASE_URL = url;
  process.env.DATABASE_URL_UNPOOLED = directUrl;
}
