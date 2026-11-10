export const DEFAULT_TOURNAMENT_COLOR = "#005baa";
function rgb(color: string) {
  return [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
}
function luminance(channels: number[]) {
  const linear = channels.map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}
const hex = (channels: number[]) =>
  "#" +
  channels.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
export function tournamentTheme(color?: string) {
  const accent =
    color && /^#[0-9a-f]{6}$/i.test(color) ? color : DEFAULT_TOURNAMENT_COLOR;
  let foreground = rgb(accent);
  // Keep branded text and white button labels legible on the light surfaces.
  while (luminance(foreground) > 0.14)
    foreground = foreground.map((v) => Math.floor(v * 0.9));
  return {
    accent,
    brand: hex(foreground),
    hover: hex(foreground.map((v) => v * 0.8)),
    soft: hex(rgb(accent).map((v) => 255 * 0.94 + v * 0.06)),
  };
}
