import { expect, it } from "vitest";
import { tournamentTheme } from "@/lib/tournament-theme";
const light = (hex: string) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((s) => (s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
};
it("keeps custom accents but ensures readable text and white button labels even for pale colors", () => {
  for (const color of [
    "#ffffff",
    "#000000",
    "#e0bdff",
    "#dfff00",
    "#ff0000",
    "#005baa",
  ]) {
    const theme = tournamentTheme(color);
    expect(theme.accent).toBe(color);
    expect(
      (light(theme.soft) + 0.05) / (light(theme.brand) + 0.05),
    ).toBeGreaterThanOrEqual(4.5);
    expect(1.05 / (light(theme.brand) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
  expect(tournamentTheme("url(https://invalid)").accent).toBe("#005baa");
});
