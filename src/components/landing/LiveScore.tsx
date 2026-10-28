"use client";
import { useState } from "react";
import {
  applyAction,
  initialState,
  pointLabels,
  PRESETS,
  serviceInfo,
  type ScoreState,
  type Team,
} from "../../../packages/core/src/scoring";
import { Icon } from "@/components/ui/Icon";
import styles from "./landing.module.css";

function demoState(): ScoreState {
  const state = applyAction(initialState(PRESETS.STANDARD), {
    type: "START_MATCH",
    at: 0,
  });
  return {
    ...state,
    points: [3, 2],
    totalGames: 17,
    serverIndex: 1,
    sets: [
      { kind: "STANDARD", games: [6, 4], tiebreak: [0, 0], winner: "A" },
      { kind: "STANDARD", games: [4, 3], tiebreak: [0, 0], winner: null },
    ],
  };
}
export function LiveScore() {
  const [history, setHistory] = useState<ScoreState[]>(() => [demoState()]);
  const state = history[history.length - 1];
  const points = pointLabels(state);
  const serving = serviceInfo(state).team;
  const completed = state.status === "COMPLETED";
  const teams = ["Aditya / Rizky", "Bima / Kevin"];
  function award(team: Team) {
    setHistory((current) => {
      const latest = current[current.length - 1];
      return latest.status === "COMPLETED"
        ? current
        : [...current, applyAction(latest, { type: "AWARD_POINT", team })];
    });
  }
  return (
    <section
      id="demo"
      className={styles.scoreCard}
      aria-label="Demo live scoring interaktif"
    >
      <div className={styles.scoreTop}>
        <span className={styles.demoBadge}>
          <span /> DEMO INTERAKTIF
        </span>
        <span>
          COURT 01 <Icon name="live" size={15} />
        </span>
      </div>
      <div className={styles.scoreTitle}>
        <h2>Weekend Padel Club</h2>
        <p>Contoh pertandingan · Ganda putra</p>
      </div>
      <table className={styles.scoreTable}>
        <caption className={styles.srOnly}>
          Skor contoh pertandingan padel
        </caption>
        <thead>
          <tr>
            <th scope="col">PASANGAN</th>
            {[0, 1, 2].map((i) => (
              <th key={i} scope="col">
                S{i + 1}
              </th>
            ))}
            <th scope="col">POIN</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team, i) => (
            <tr key={team}>
              <th scope="row">
                <span
                  className={`${styles.teamAvatar} ${i === 1 ? styles.avatarBlue : ""}`}
                >
                  {i === 0 ? "AR" : "BK"}
                </span>
                <span>
                  {team}
                  {!completed && serving === (i === 0 ? "A" : "B") && (
                    <span
                      className={styles.servingDot}
                      aria-label="Sedang servis"
                    />
                  )}
                </span>
              </th>
              {[0, 1, 2].map((set) => (
                <td key={set}>{state.sets[set]?.games[i] ?? "–"}</td>
              ))}
              <td>
                <strong className={styles.pointScore}>
                  {completed
                    ? state.winner === (i === 0 ? "A" : "B")
                      ? "✓"
                      : "–"
                    : points[i]}
                </strong>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.scoreControls}>
        <button
          onClick={() => award("A")}
          disabled={completed}
          aria-label="Tambah poin Aditya dan Rizky"
        >
          <Icon name="plus" size={14} /> Poin AR
        </button>
        <button
          onClick={() => award("B")}
          disabled={completed}
          aria-label="Tambah poin Bima dan Kevin"
        >
          <Icon name="plus" size={14} /> Poin BK
        </button>
        <button
          onClick={() =>
            setHistory((current) =>
              current.length > 1 ? current.slice(0, -1) : current,
            )
          }
          disabled={history.length === 1}
          aria-label="Batalkan poin terakhir"
        >
          Undo
        </button>
        <button
          onClick={() => setHistory([demoState()])}
          aria-label="Reset demo skor"
        >
          Reset
        </button>
      </div>
      <p
        className={styles.scoreHint}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {completed
          ? `${teams[state.winner === "A" ? 0 : 1]} memenangkan pertandingan.`
          : history.length > 1
            ? `Set ${state.sets.length} · Game ${state.sets.at(-1)!.games.join("–")} · Poin ${points.join("–")}`
            : "Klik + Poin dan rasakan alur pertandingannya."}
      </p>
    </section>
  );
}
