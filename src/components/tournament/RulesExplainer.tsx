"use client";
import { draw } from "../../../packages/core/src";
import type { MatchKind, RulesInfo } from "@/lib/rules-summary";

/**
 * Visual explanation of how a category is played: the path from groups to the
 * final, the knockout bracket with seed positions, and how points, games and
 * group standings are counted. The bracket uses the same draw as the real
 * one, so the pairings shown are the pairings that will be played.
 */
export function RulesExplainer({ info }: { info: RulesInfo }) {
  const knockout = info.format === "GROUP_KNOCKOUT" && info.qualifiers >= 2;
  return (
    <div className="rules-explainer">
      {knockout && <Path info={info} />}
      {knockout && <Bracket qualifiers={info.qualifiers} />}
      <Scoring info={info} />
    </div>
  );
}

function roundName(size: number) {
  return size === 2
    ? "Final"
    : size === 4
      ? "Semifinal"
      : size === 8
        ? "Perempat final"
        : `Babak ${size} besar`;
}

function Path({ info }: { info: RulesInfo }) {
  const q = info.qualifiers;
  let size = 1;
  while (size < q) size *= 2;
  const opening = q - size / 2; // matches before the round where byes rejoin
  const groupGames = info.groupSize
    ? (info.groups * info.groupSize * (info.groupSize - 1)) / 2
    : 0;
  const byes = size - q;
  // Each step: one number worth remembering, one short line of context.
  const steps: { title: string; big: string; text: string }[] = [
    {
      title: "Fase grup",
      big: groupGames ? `${groupGames} laga` : `${info.groups} grup`,
      text: info.groupSize
        ? `${info.groups} grup × ${info.groupSize} pasangan, semua saling bertemu`
        : "Semua pasangan dalam grup saling bertemu",
    },
    {
      title: "Lolos",
      big: `${q} pasangan`,
      text: `${info.perGroup === 2 ? "Juara + runner-up" : info.perGroup === 1 ? "Juara" : `${info.perGroup} teratas`} tiap grup${info.bestRunnersUp ? ` + ${info.bestRunnersUp} terbaik` : ""}, jadi P1–P${q}`,
    },
  ];
  if (opening > 0 && opening < size / 2)
    steps.push({
      title: "Babak awal",
      big: `${opening} laga`,
      text: `P${byes + 1}–P${q} bermain, P1–P${byes} langsung lolos`,
    });
  for (
    let s = opening > 0 && opening < size / 2 ? size / 2 : size;
    s >= 2;
    s /= 2
  )
    steps.push({
      title: roundName(s),
      big: `${s / 2} laga`,
      text: `${s} pasangan`,
    });
  return (
    <section className="rules-block">
      <h4>Alur turnamen</h4>
      <ol className="rules-path">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span className="rules-path-step">
              {i + 1}. {step.title}
            </span>
            <strong>{step.big}</strong>
            <span className="rules-path-text">{step.text}</span>
          </li>
        ))}
      </ol>
      <p className="rules-note">
        Total {q - 1} laga babak gugur. Pasangan unggulan teratas baru bisa
        saling bertemu di laga terakhir.
      </p>
    </section>
  );
}

type Node = ReturnType<typeof draw>[number];

function Bracket({ qualifiers }: { qualifiers: number }) {
  const nodes = draw(
    Array.from({ length: qualifiers }, (_, i) => ({
      id: `P${i + 1}`,
      seed: i + 1,
    })),
    "SINGLE_ELIMINATION",
    "SEEDED",
    Array.from({ length: qualifiers }, () => 0.5),
  );
  const rounds = [...new Set(nodes.map((n) => n.round))].sort((a, b) => a - b);
  const lastRound = rounds.at(-1)!;
  const feeders = (n: Node) =>
    nodes
      .filter((x) => x.winnerTo?.[0] === n.number)
      .sort((x, y) => x.winnerTo![1].localeCompare(y.winnerTo![1]));
  // Top-to-bottom order of every round, walked back from the final so the two
  // matches that feed one match always sit next to each other.
  const order = new Map<number, Node[]>();
  let level = nodes.filter((n) => n.round === lastRound);
  for (let r = lastRound; level.length; r--) {
    order.set(r, level);
    level = level.flatMap(feeders);
  }
  const label = new Map<number, string>();
  for (const round of rounds) {
    const size = 2 ** (lastRound - round + 1);
    (order.get(round) ?? [])
      .filter((n) => !n.bye)
      .forEach((n, i) =>
        label.set(
          n.number,
          round === lastRound
            ? "Final"
            : size === 4
              ? `SF ${i + 1}`
              : size === 8
                ? `QF ${i + 1}`
                : `Laga ${i + 1}`,
        ),
      );
  }
  const feed = new Map<string, string>();
  for (const n of nodes)
    if (n.winnerTo)
      feed.set(
        `${n.winnerTo[0]}:${n.winnerTo[1]}`,
        n.bye ? (n.a ?? n.b ?? "") : `Pemenang ${label.get(n.number)}`,
      );
  const slot = (n: Node, side: "a" | "b") =>
    (side === "a" ? n.a : n.b) ?? feed.get(`${n.number}:${side}`) ?? "";
  const hasFeed = (n: Node) => feeders(n).some((f) => !f.bye);

  // A first round with byes is drawn next to the match each game feeds, so its
  // line runs straight across; full rounds pair up two matches per line.
  const columns = rounds.flatMap((round, i) => {
    const list = order.get(round) ?? [];
    const size = 2 ** (lastRound - round + 1);
    if (list.every((n) => !n.bye))
      return [
        {
          round,
          title: roundName(size),
          opening: false,
          cells: list.map((n) => [n]),
        },
      ];
    const next = order.get(rounds[i + 1]) ?? [];
    const cells = next.map((t) => feeders(t).filter((f) => !f.bye));
    return cells.some((c) => c.length)
      ? [{ round, title: "Babak awal", opening: true, cells }]
      : [];
  });

  return (
    <section className="rules-block">
      <h4>Bagan babak gugur</h4>
      <p className="rules-swipe">Geser ke kanan untuk melihat sampai final.</p>
      <div className="rules-bracket" role="list">
        {columns.map((c) => (
          <div
            className={
              c.opening ? "rules-bracket-round is-opening" : "rules-bracket-round"
            }
            role="listitem"
            key={c.round}
          >
            <h5>{c.title}</h5>
            <div className="rules-bracket-cells">
              {c.cells.map((cell, ci) => (
                <div
                  className={`rules-cell rules-cell-${cell.length}`}
                  key={ci}
                >
                  {cell.map((n) => (
                    <div className="rules-sub" key={n.number}>
                      <div
                        className={
                          hasFeed(n)
                            ? "rules-bracket-match has-feed"
                            : "rules-bracket-match"
                        }
                      >
                        <span className="rules-bracket-label">
                          {label.get(n.number)}
                        </span>
                        {(["a", "b"] as const).map((side) => {
                          const text = slot(n, side);
                          return (
                            <span
                              key={side}
                              className={
                                /^P\d+$/.test(text)
                                  ? "rules-slot is-seed"
                                  : "rules-slot"
                              }
                            >
                              {text}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function matchText(m: MatchKind) {
  if (m.kind === "RACE")
    return {
      name: `Race to ${m.games}`,
      how: `Siapa duluan ${m.games} game menang. Tidak perlu unggul dua game.`,
      examples: [
        `${m.games}–0`,
        `${m.games}–${m.games - 2}`,
        `${m.games}–${m.games - 1}`,
      ],
    };
  if (m.kind === "TOTAL_GAMES")
    return {
      name: `Total ${m.games} game`,
      how:
        m.games % 2 === 0
          ? `Selalu dimainkan ${m.games} game. Jika ${m.games / 2}–${m.games / 2}, satu game penentu.`
          : `Selalu dimainkan ${m.games} game.`,
      examples: m.games === 4 ? ["4–0", "3–1", `2–2 → 3–2`] : [`${m.games}–0`],
    };
  if (m.kind === "POINTS")
    return {
      name: `${m.games} poin`,
      how: "Poin langsung dijumlahkan.",
      examples: [],
    };
  if (m.kind === "TIMED")
    return {
      name: "Berbatas waktu",
      how: "Game terbanyak saat waktu habis.",
      examples: [],
    };
  return {
    name: m.setsToWin > 1 ? `Menang ${m.setsToWin} set` : "Satu set",
    how: `Set sampai ${m.games} game, unggul dua game, tie-break di ${m.games}–${m.games}.`,
    examples: [`${m.games}–${m.games - 2}`, `${m.games + 1}–${m.games}`],
  };
}

const tieBreakerText: Record<string, string> = {
  POINTS: "Poin klasemen",
  WINS: "Jumlah kemenangan",
  HEAD_TO_HEAD: "Hasil pertemuan langsung",
  SET_DIFFERENCE: "Selisih set",
  GAME_DIFFERENCE: "Selisih game",
  SETS_WON: "Jumlah set menang",
  GAMES_WON: "Jumlah game menang",
  PLAYOFF: "Laga playoff atau keputusan panitia",
};

function Scoring({ info }: { info: RulesInfo }) {
  const phases = [
    { title: "Laga grup", m: info.groupMatch },
    ...(info.format === "GROUP_KNOCKOUT"
      ? [
          { title: "Babak gugur", m: info.knockoutMatch },
          { title: "Final", m: info.finalMatch },
        ]
      : []),
  ];
  // With one set per match, set difference always equals wins minus losses.
  const order = info.tieBreakers.filter(
    (t) =>
      t !== "POINTS" &&
      !(t === "SET_DIFFERENCE" && info.groupMatch.setsToWin === 1),
  );
  const points = info.groupMatch.kind === "POINTS";
  return (
    <section className="rules-block">
      <h4>Hitungan poin</h4>
      {!points && (
        <div className="rules-game">
          <p>Satu game</p>
          <ol className="rules-points" aria-label="Urutan poin dalam satu game">
            {["0", "15", "30", "40", "Game"].map((p, i) => (
              <li key={p}>
                {i > 0 && (
                  <span className="rules-points-step" aria-hidden="true">
                    →
                  </span>
                )}
                <span className="rules-points-value">{p}</span>
              </li>
            ))}
          </ol>
          <p className="rules-note">
            {info.deuce === "GOLDEN_POINT"
              ? "Golden point: saat 40–40, poin berikutnya langsung menentukan game. Pasangan penerima memilih sisi menerima servis."
              : info.deuce === "STAR_POINT"
                ? "Star point: saat 40–40 berlaku advantage dua kali, lalu satu poin penentu."
                : "Advantage: saat 40–40, harus memenangi dua poin berturut-turut."}
          </p>
        </div>
      )}
      <div className="rules-phases">
        {phases.map(({ title, m }) => {
          const t = matchText(m);
          return (
            <article key={title}>
              <span>{title}</span>
              <strong>{t.name}</strong>
              <p>{t.how}</p>
              {t.examples.length > 0 && (
                <p className="rules-examples">
                  Contoh skor akhir:{" "}
                  {t.examples.map((e) => (
                    <b key={e}>{e}</b>
                  ))}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {info.format !== "SINGLE_ELIMINATION" && (
        <div className="rules-standings">
          <p>
            <strong>Klasemen grup:</strong> menang {info.winPoints} poin, kalah
            0 poin.
          </p>
          {order.length > 0 && (
            <p>
              Jika poin sama, peringkat ditentukan berurutan oleh:{" "}
              {order.map((t, i) => (
                <span key={t}>
                  {i ? " → " : ""}
                  {tieBreakerText[t] ?? t}
                </span>
              ))}
              .
            </p>
          )}
        </div>
      )}
    </section>
  );
}
