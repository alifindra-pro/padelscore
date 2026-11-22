"use client";
import { useState } from "react";
import { PRESETS, roundFormat, type Rules } from "../../../packages/core/src";
import { PRESET_OPTIONS } from "@/components/admin/TournamentChoices";
import { matchFormat } from "@/lib/rules-summary";
import {
  PHASE_PRESETS,
  roundsFor,
  type KnockoutPhase,
  type PhasePolicy,
} from "@/lib/phase-rules";

type Phase = "group" | KnockoutPhase;
export type PhaseChoice = Partial<Record<Phase, string | null>>;

interface Props {
  format: string;
  rules: Rules;
  policy:
    | (PhasePolicy & {
        groups?: number;
        perGroup?: number;
        bestRunnersUp?: number;
      })
    | null;
  /** Rounds of the knockout bracket if it exists already. */
  knockoutRounds: number | null;
  entryCount: number;
  busy: boolean;
  onSave: (phases: PhaseChoice) => void;
}

const labelOf = (key: string) =>
  PRESET_OPTIONS.find((o) => o.value === key)?.label ?? key;
/** The preset a saved format came from, matched by its name. */
const keyOf = (r?: Partial<Rules>) =>
  r ? (PHASE_PRESETS.find((k) => PRESETS[k].name === r.name) ?? "") : "";

/**
 * One table for how every phase is played: group, knockout rounds, semifinal
 * and final. Each knockout row can follow the knockout default or its own.
 */
export function PhaseFormats({
  format,
  rules,
  policy,
  knockoutRounds,
  entryCount,
  busy,
  onSave,
}: Props) {
  const groups = format === "GROUP_KNOCKOUT";
  const saved: Record<Phase, string> = {
    group: keyOf(rules),
    knockout: keyOf(policy?.knockoutRules),
    quarterfinal: keyOf(policy?.quarterfinalRules),
    semifinal: keyOf(policy?.semifinalRules),
    final: keyOf(policy?.finalRules),
  };
  const [draft, setDraft] = useState(saved);
  // Reset the draft when the saved values change (another category, a save).
  const signature = JSON.stringify(saved);
  const [seen, setSeen] = useState(signature);
  if (seen !== signature) {
    setSeen(signature);
    setDraft(saved);
  }

  const qualifiers = groups
    ? (policy?.groups ?? 2) * (policy?.perGroup ?? 2) +
      (policy?.bestRunnersUp ?? 0)
    : entryCount;
  const rounds = knockoutRounds ?? roundsFor(qualifiers);
  // roundFormat keeps the category's deuce rule, as the server does.
  const base: Rules = draft.group
    ? { ...rules, ...roundFormat(draft.group) }
    : rules;
  const knockout: Rules = draft.knockout
    ? { ...base, ...roundFormat(draft.knockout) }
    : base;
  const effective = (phase: Phase): Rules => {
    if (phase === "group") return base;
    if (phase === "knockout" || !draft[phase]) return knockout;
    return { ...knockout, ...roundFormat(draft[phase]) };
  };

  const rows: { phase: Phase; name: string; note?: string }[] = [
    ...(groups ? [{ phase: "group" as const, name: "Fase grup" }] : []),
    {
      phase: "knockout",
      name: groups ? "Babak gugur" : "Semua babak",
      note:
        rounds > 3
          ? `Bawaan untuk ${2 ** rounds} besar dan babak yang tidak diatur di bawah`
          : "Bawaan untuk babak yang tidak diatur di bawah",
    },
    ...(!rounds || rounds >= 3
      ? [
          {
            phase: "quarterfinal" as const,
            name: "Perempat final",
            note: "8 besar",
          },
        ]
      : []),
    ...(!rounds || rounds >= 2
      ? [{ phase: "semifinal" as const, name: "Semifinal", note: "4 besar" }]
      : []),
    { phase: "final", name: "Final", note: "Termasuk perebutan juara 3" },
  ];
  const changed = rows.some((r) => draft[r.phase] !== saved[r.phase]);
  const followName = groups ? "fase grup" : "aturan skor";

  return (
    <section className="panel space-y-4" aria-labelledby="phase-title">
      <div>
        <h2 id="phase-title" className="panel-title">
          Sistem pertandingan per babak
        </h2>
        <p className="text-sm text-secondary mt-1">
          {groups
            ? `${policy?.groups ?? 2} grup, ${
                (policy?.perGroup ?? 2) === 1
                  ? "juara grup"
                  : `${policy?.perGroup ?? 2} teratas tiap grup`
              }${
                policy?.bestRunnersUp
                  ? ` + ${policy.bestRunnersUp} peringkat berikutnya terbaik`
                  : ""
              } lolos ke babak gugur (${qualifiers} pasangan).`
            : `${entryCount} pasangan, sistem gugur.`}{" "}
          Aturan deuce sama untuk semua babak.
        </p>
      </div>
      <ol className="phase-rows">
        {rows.map(({ phase, name, note }) => (
          <li key={phase}>
            <span className="phase-name">
              {name}
              {note && <small>{note}</small>}
            </span>
            <label className="field">
              <span className="sr-only">Format {name}</span>
              <select
                value={draft[phase]}
                disabled={busy}
                onChange={(e) =>
                  setDraft({ ...draft, [phase]: e.target.value })
                }
              >
                {phase === "group" ? (
                  !saved.group && (
                    <option value="">Kustom (pengaturan rinci)</option>
                  )
                ) : (
                  <option value="">
                    {phase === "knockout"
                      ? `Sama seperti ${followName}`
                      : "Sama seperti babak gugur"}
                  </option>
                )}
                {PHASE_PRESETS.map((key) => (
                  <option key={key} value={key}>
                    {labelOf(key)}
                  </option>
                ))}
              </select>
            </label>
            <span className="phase-detail">{matchFormat(effective(phase))}</span>
          </li>
        ))}
      </ol>
      <div className="action-row">
        <button
          className="btn-primary"
          disabled={busy || !changed}
          onClick={() =>
            onSave({
              ...(groups && draft.group && { group: draft.group }),
              ...Object.fromEntries(
                rows
                  .filter((r) => r.phase !== "group")
                  .map((r) => [r.phase, draft[r.phase] || null]),
              ),
            })
          }
        >
          {busy ? "Menyimpan…" : "Simpan sistem pertandingan"}
        </button>
        {changed && (
          <button
            className="btn-secondary"
            disabled={busy}
            onClick={() => setDraft(saved)}
          >
            Batal
          </button>
        )}
      </div>
      <p className="setting-help">
        Berlaku untuk laga yang belum dibuka wasit. Laga yang sudah dibuka di HP
        wasit tetap memakai format saat dibuka.
      </p>
    </section>
  );
}
