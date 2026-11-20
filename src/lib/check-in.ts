import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Venue check-in codes. The organizer's screen shows a QR that changes every
 * 30 seconds, so a photo of it shared outside the venue stops working within a
 * minute. Scanning it trades the code for a pass that lets the player pick
 * their name for the next 10 minutes.
 */
export const QR_WINDOW_MS = 30_000;
const PASS_MS = 10 * 60_000;

function key() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is required");
  return createHmac("sha256", secret).update("venue-check-in").digest();
}
const sign = (text: string, length = 22) =>
  createHmac("sha256", key()).update(text).digest("base64url").slice(0, length);
const same = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function qrToken(categoryId: string, now = Date.now()) {
  const slot = Math.floor(now / QR_WINDOW_MS);
  return {
    token: sign(`qr:${categoryId}:${slot}`),
    expiresAt: (slot + 1) * QR_WINDOW_MS,
  };
}

/** Accepts the current code and the one before it, so a scan at the turn still works. */
export function validQrToken(
  categoryId: string,
  token: string,
  now = Date.now(),
) {
  const slot = Math.floor(now / QR_WINDOW_MS);
  return [slot, slot - 1].some((s) =>
    same(sign(`qr:${categoryId}:${s}`), token),
  );
}

export function issuePass(categoryId: string, now = Date.now()) {
  const exp = now + PASS_MS;
  return `${exp}.${sign(`pass:${categoryId}:${exp}`, 32)}`;
}

export function validPass(categoryId: string, pass: string, now = Date.now()) {
  const [exp, mac] = pass.split(".");
  if (!/^\d+$/.test(exp ?? "") || !mac || Number(exp) < now) return false;
  return same(sign(`pass:${categoryId}:${exp}`, 32), mac);
}

export type CheckInWindow = {
  checkInOpensAt: Date | null;
  checkInClosesAt: Date | null;
};

/** "open" between the organizer's times; closing time is optional. */
export function windowState(c: CheckInWindow, now = Date.now()) {
  if (!c.checkInOpensAt || c.checkInOpensAt.getTime() > now)
    return "NOT_OPEN" as const;
  if (c.checkInClosesAt && c.checkInClosesAt.getTime() <= now)
    return "CLOSED" as const;
  return "OPEN" as const;
}
