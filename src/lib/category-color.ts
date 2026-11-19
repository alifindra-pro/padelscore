// One colour per category so spectators can tell them apart at a glance:
// women pink, men blue, mixed purple; anything else follows the list order.
// Each colour keeps at least 4.5:1 contrast for white text and on white.
const PINK = { accent: "#c2185b", soft: "#fdeef4", label: "merah muda" };
const BLUE = { accent: "#005baa", soft: "#eaf2fb", label: "biru" };
const PURPLE = { accent: "#6a3fb0", soft: "#f2edfb", label: "ungu" };
const OTHERS = [
  { accent: "#0b7a55", soft: "#e8f6f0", label: "hijau" },
  { accent: "#b3470b", soft: "#fcefe6", label: "oranye" },
  { accent: "#37474f", soft: "#eef1f2", label: "abu" },
];

export type CategoryColor = typeof PINK;

export function categoryColor(name: string, index = 0): CategoryColor {
  const n = name.toLowerCase();
  // "women" contains "men", so women is checked first.
  if (/\b(women|woman|wanita|putri|ladies|female)\b/.test(n)) return PINK;
  if (/\b(mix|mixed|campuran)\b/.test(n)) return PURPLE;
  if (/\b(men|man|pria|putra|male)\b/.test(n)) return BLUE;
  return OTHERS[index % OTHERS.length];
}

/** CSS custom properties for a category block. */
export const categoryStyle = (name: string, index = 0) => {
  const c = categoryColor(name, index);
  return { "--cat": c.accent, "--cat-soft": c.soft } as Record<string, string>;
};
