"use client";

import { useId } from "react";
import { Icon } from "@/components/ui/Icon";
import type { SocialConfig } from "../../../packages/core/src";

export const FORMAT_OPTIONS = [
  {
    value: "SINGLE_ELIMINATION",
    label: "Sistem gugur",
    description:
      "Pemenang maju ke babak berikutnya. Sekali kalah, pasangan selesai bermain.",
    detail: "Pasangan tetap · Bagan menuju final",
    icon: "trophy",
  },
  {
    value: "ROUND_ROBIN",
    label: "Round robin",
    description:
      "Setiap pasangan bertemu semua pasangan lain. Hasil laga menentukan klasemen.",
    detail: "Pasangan tetap · Semua saling bertemu",
    icon: "grid",
  },
  {
    value: "AMERICANO",
    label: "Americano",
    description:
      "Pasangan berganti setiap ronde. Poin setiap laga masuk ke peringkat masing-masing pemain.",
    detail: "Pemain individu · Rotasi pasangan",
    icon: "refresh",
  },
  {
    value: "MEXICANO",
    label: "Mexicano",
    description:
      "Pasangan disusun ulang mengikuti peringkat terbaru setelah hasil ronde disahkan.",
    detail: "Pemain individu · Berdasarkan peringkat",
    icon: "users",
  },
];
export const EXTRA_FORMAT_OPTIONS = [
  {
    value: "GROUP_KNOCKOUT",
    label: "Grup + gugur",
    description:
      "Bermain di grup dahulu. Peserta yang lolos melanjutkan ke babak gugur.",
    icon: "grid",
  },
  {
    value: "DOUBLE_ELIMINATION",
    label: "Dua kali kalah gugur",
    description: "Pasangan masih punya kesempatan setelah kekalahan pertama.",
    icon: "trophy",
  },
];
export const PRESET_OPTIONS = [
  {
    value: "SINGLE",
    label: "Satu set standar",
    description: "Menang satu set sampai 6 game. Tie-break saat 6–6.",
    detail: "1 set kemenangan",
    icon: "court",
  },
  {
    value: "STANDARD",
    label: "Dua kemenangan set",
    description:
      "Menang dua set. Setiap set sampai 6 game, tie-break saat 6–6.",
    detail: "Maksimal 3 set",
    icon: "trophy",
  },
  {
    value: "SHORT",
    label: "Satu set pendek",
    description: "Menang satu set sampai 4 game. Tie-break saat 4–4.",
    detail: "Format singkat",
    icon: "live",
  },
  {
    value: "MATCH_TIEBREAK",
    label: "Dua set + tie-break",
    description: "Jika set 1–1, penentunya match tie-break sampai 10 poin.",
    icon: "court",
  },
  {
    value: "SHORT_THREE",
    label: "Dua set pendek",
    description: "Butuh dua kemenangan set. Setiap set sampai 4 game.",
    icon: "court",
  },
  {
    value: "TIMED",
    label: "20 menit",
    description: "Pertandingan dibatasi waktu. Hasil seri diperbolehkan.",
    icon: "calendar",
  },
  {
    value: "CUSTOM",
    label: "Kustom",
    description:
      "Atur rincian game, set, dan tie-break di pengaturan lanjutan.",
    icon: "settings",
  },
];
export const DEUCE_OPTIONS = [
  {
    value: "ADVANTAGE",
    label: "Advantage",
    description: "Saat 40–40, harus unggul dua poin untuk menang game.",
  },
  {
    value: "GOLDEN_POINT",
    label: "Golden Point",
    description: "Saat 40–40, satu poin berikutnya menentukan pemenang game.",
  },
  {
    value: "STAR_POINT",
    label: "Star Point",
    description:
      "Dua kali advantage, lalu satu poin penentu jika kembali deuce.",
  },
];

interface Choice {
  value: string;
  label: string;
  description: string;
  detail?: string;
  icon?: string;
}
export function OptionCards({
  legend,
  help,
  name,
  value,
  options,
  onChange,
  compact = false,
  disabled = false,
}: {
  legend: string;
  help?: string;
  name: string;
  value: string;
  options: Choice[];
  onChange: (value: string) => void;
  compact?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset
      className={`setting-options ${compact ? "setting-options-compact" : ""}`}
      disabled={disabled}
    >
      <legend>{legend}</legend>
      {help && <p className="setting-help">{help}</p>}
      <div className="setting-option-grid">
        {options.map((option) => (
          <label className="setting-option" key={option.value}>
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              aria-label={option.label}
              aria-describedby={`${id}-${option.value}`}
            />
            <span className="setting-option-body">
              <span className="setting-option-top">
                {option.icon && (
                  <span className="setting-option-icon">
                    <Icon name={option.icon} />
                  </span>
                )}
                <strong>{option.label}</strong>
                <span className="setting-option-check">
                  <Icon name="check" size={14} />
                </span>
              </span>
              <span
                id={`${id}-${option.value}`}
                className="setting-option-description"
              >
                {option.description}
              </span>
              {option.detail && (
                <span className="setting-option-detail">{option.detail}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SocialSettings({
  format,
  value,
  onChange,
  disabled = false,
}: {
  format: string;
  value: Pick<SocialConfig, "target" | "rounds" | "ranking" | "pairing">;
  onChange: (
    value: Pick<SocialConfig, "target" | "rounds" | "ranking" | "pairing">,
  ) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const exampleA = Math.ceil(value.target * 0.6);
  return (
    <div className="space-y-5">
      <div className="setting-section-heading">
        <span className="setting-section-icon">
          <Icon name="live" />
        </span>
        <div>
          <h3>Hitungan {format === "MEXICANO" ? "Mexicano" : "Americano"}</h3>
          <p>
            Setiap reli bernilai satu poin. Hasil dihitung untuk tiap pemain.
          </p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="field">
          Total poin per laga
          <input
            name="target"
            type="number"
            min={1}
            max={200}
            required
            disabled={disabled}
            value={value.target || ""}
            onChange={(e) =>
              onChange({ ...value, target: Number(e.target.value) })
            }
            aria-describedby={`${id}-example`}
          />
        </label>
        <label className="field">
          Jumlah ronde
          <input
            name="rounds"
            type="number"
            min={1}
            max={100}
            required
            disabled={disabled}
            value={value.rounds || ""}
            onChange={(e) =>
              onChange({ ...value, rounds: Number(e.target.value) })
            }
          />
        </label>
      </div>
      <div
        className="setting-point-presets"
        role="group"
        aria-label="Pilihan total poin"
      >
        {[16, 24, 32].map((points) => (
          <button
            key={points}
            type="button"
            aria-pressed={value.target === points}
            disabled={disabled}
            onClick={() => onChange({ ...value, target: points })}
          >
            {points} poin
          </button>
        ))}
      </div>
      <div className="scoring-example" id={`${id}-example`}>
        <div>
          <span>Contoh hasil</span>
          <strong>
            {exampleA} <small>:</small> {value.target - exampleA}
          </strong>
        </div>
        <p>
          Total skor A + B = <b>{value.target || "…"} poin</b>. Setiap pemain di
          pasangan A mendapat {exampleA} poin; pemain di pasangan B mendapat{" "}
          {value.target - exampleA} poin.
        </p>
      </div>
      <OptionCards
        legend="Peringkat berdasarkan"
        name="ranking"
        compact
        disabled={disabled}
        value={value.ranking}
        onChange={(ranking) =>
          onChange({ ...value, ranking: ranking as SocialConfig["ranking"] })
        }
        options={[
          {
            value: "TOTAL",
            label: "Total poin",
            description:
              "Jumlah seluruh poin pemain. Cocok jika semua bermain sama banyak.",
          },
          {
            value: "AVERAGE",
            label: "Rata-rata poin",
            description:
              "Total poin dibagi jumlah laga. Membantu saat jatah bermain berbeda.",
          },
        ]}
      />
      {format === "MEXICANO" && (
        <OptionCards
          legend="Susunan pasangan"
          name="pairing"
          compact
          disabled={disabled}
          value={value.pairing}
          onChange={(pairing) =>
            onChange({ ...value, pairing: pairing as SocialConfig["pairing"] })
          }
          options={[
            {
              value: "BALANCED",
              label: "Seimbang",
              description:
                "Dalam kelompok empat pemain: peringkat 1 & 4 melawan 2 & 3.",
            },
            {
              value: "ADJACENT",
              label: "Berdekatan",
              description:
                "Dalam kelompok empat pemain: peringkat 1 & 2 melawan 3 & 4.",
            },
          ]}
        />
      )}
    </div>
  );
}
