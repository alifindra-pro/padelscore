import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";

/**
 * Court referees and match start codes.
 *
 * Each court can have one referee account. The referee opens the court link
 * and types a 6-digit token; changing the token signs out every device that
 * used the old one. A referee then needs a 4-digit code from the control desk
 * before a match can start. Both numbers are derived from the server secret,
 * so neither is stored.
 */
function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return createHmac("sha256", secret).update("court-referee").digest();
}
function digits(text: string, length: number) {
  const n = createHmac("sha256", key()).update(text).digest().readUInt32BE(0);
  return String(n % 10 ** length).padStart(length, "0");
}
export const sameCode = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const newLinkId = () => randomBytes(12).toString("base64url");

export const courtToken = (courtId: string, version: number) =>
  digits(`court:${courtId}:${version}`, 6);

export const matchStartCode = (matchId: string) =>
  digits(`start:${matchId}`, 4);

export const START_CODE_TRIES = 5;

/** Referees cannot open a match for scoring until the desk's code is entered. */
export function assertStartUnlocked(
  user: { role: string },
  match: { startUnlockedAt: Date | null; status: string },
) {
  if (user.role !== "REFEREE" || match.startUnlockedAt) return;
  // Matches already under way before this rule keep working.
  if (!["SCHEDULED", "WARMUP"].includes(match.status)) return;
  throw new AppError(
    423,
    "START_LOCKED",
    "Masukkan kode mulai dari meja panitia untuk membuka laga ini.",
  );
}
