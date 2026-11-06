"use client";
import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { StageView, MatchView } from "@/types/match";
const statuses: Record<string, string> = {
  SCHEDULED: "Terjadwal",
  IN_PROGRESS: "Berlangsung",
  FINISHED: "Menunggu pengesahan",
  APPROVED: "Disahkan",
  CANCELLED: "Dibatalkan",
  SUSPENDED: "Ditunda",
};
function MatchCard({ match: m }: { match: MatchView }) {
  const snap = m.scoreSnapshot;
  const approved = m.approvalStatus === "APPROVED" || m.status === "APPROVED";
  return (
    <article
      className={`bracket-match ${m.status === "IN_PROGRESS" ? "is-live" : ""}`}
    >
      <header>
        <span>Laga {m.matchNumber}</span>
        <span>{approved ? "Disahkan" : (statuses[m.status] ?? m.status)}</span>
      </header>
      {[m.entryA, m.entryB].map((entry, i) => {
        const winner = !!entry && m.winnerId === entry.id;
        const score = snap
          ? snap.gamesA.length
            ? i === 0
              ? snap.setsA
              : snap.setsB
            : i === 0
              ? snap.pointsA
              : snap.pointsB
          : "–";
        return (
          <div
            key={i}
            className={`bracket-player ${winner ? "is-winner" : ""}`}
          >
            <span>
              {winner && <Icon name="check" size={13} />}
              <span title={entry?.name}>
                {entry?.name ??
                  (approved && m.winnerId ? "Bye" : "Menunggu pasangan")}
              </span>
            </span>
            <strong>{score}</strong>
          </div>
        );
      })}
      <Link
        href={`/match/${m.id}`}
        aria-label={`Lihat hasil laga ${m.matchNumber}`}
      >
        Lihat skor & detail <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
function GroupStage({ stage }: { stage: StageView }) {
  return (
    <div className="bracket-groups">
      {stage.groups?.map((group) => {
        const matches = (stage.matches ?? []).filter(
          (m) => m.groupId === group.id,
        );
        const entries = Array.from(
          new Map(
            matches
              .flatMap((m) => [m.entryA, m.entryB])
              .filter((e) => !!e)
              .map((e) => [e!.id, e!]),
          ).values(),
        );
        const rows = group.standings?.length
          ? [...group.standings].sort(
              (a, b) =>
                (a.rank || 999) - (b.rank || 999) || b.points - a.points,
            )
          : entries.map((entry) => ({
              id: entry.id,
              entry,
              won: 0,
              lost: 0,
              points: 0,
              played: 0,
              drawn: 0,
              rank: 0,
            }));
        const completed = matches.filter(
          (m) => m.approvalStatus === "APPROVED" || m.status === "APPROVED",
        ).length;
        return (
          <section className="group-card" key={group.id}>
            <header>
              <div>
                <span className="page-eyebrow">FASE GRUP</span>
                <h4>{group.name}</h4>
              </div>
              <span>
                {completed}/{matches.length} laga disahkan
              </span>
            </header>
            <div className="group-progress" aria-hidden="true">
              <span
                style={{
                  width: `${matches.length ? (completed / matches.length) * 100 : 0}%`,
                }}
              />
            </div>
            <div
              className="group-table-scroll"
              tabIndex={0}
              role="region"
              aria-label={`Klasemen ${group.name}`}
            >
              <table>
                <caption>
                  Klasemen berdasarkan hasil yang disahkan admin
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Pos</th>
                    <th scope="col">Pasangan</th>
                    <th scope="col" title="Main">
                      Main
                    </th>
                    <th scope="col" title="Menang">
                      M
                    </th>
                    <th scope="col" title="Seri">
                      S
                    </th>
                    <th scope="col" title="Kalah">
                      K
                    </th>
                    <th scope="col">Poin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={row.id}>
                      <td>
                        <span
                          className={`rank-number ${i === 0 && row.played ? "rank-first" : ""}`}
                        >
                          {row.rank || i + 1}
                        </span>
                      </td>
                      <th scope="row">
                        {row.entry?.name ?? "Menunggu pasangan"}
                      </th>
                      <td>
                        {row.played ?? row.won + row.lost + (row.drawn ?? 0)}
                      </td>
                      <td>{row.won}</td>
                      <td>{row.drawn ?? 0}</td>
                      <td>{row.lost}</td>
                      <td>
                        <strong>{row.points}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <p className="p-4 text-secondary text-sm">
                Peserta grup belum ditentukan.
              </p>
            )}
            <details className="group-fixtures">
              <summary>
                Jadwal & hasil grup <span>{matches.length} laga</span>
              </summary>
              <div>
                {matches.map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
              </div>
            </details>
          </section>
        );
      })}
    </div>
  );
}
function Knockout({ stage }: { stage: StageView }) {
  const matches = stage.matches ?? [];
  const sides = ["WINNERS", "LOSERS", "FINAL", "THIRD"].filter((side) =>
    matches.some((m) => (m.bracketSide ?? "WINNERS") === side),
  );
  return (
    <div className="space-y-6">
      {sides.map((side) => {
        const list = matches.filter(
          (m) => (m.bracketSide ?? "WINNERS") === side,
        );
        const rounds = [...new Set(list.map((m) => m.round))].sort(
          (a, b) => a - b,
        );
        const columns = rounds.map((round) =>
          list
            .filter((m) => m.round === round)
            .sort((a, b) => a.matchNumber - b.matchNumber),
        );
        const tree =
          side === "WINNERS" &&
          columns.every((c, i) => !i || columns[i - 1].length === c.length * 2);
        const rowHeight = 168;
        const height = Math.max(...columns.map((c) => c.length), 1) * rowHeight;
        return (
          <section key={side} className="space-y-3">
            {sides.length > 1 && (
              <h4 className="font-bold">
                {
                  (
                    {
                      WINNERS: "Jalur menang",
                      LOSERS: "Jalur kesempatan kedua",
                      FINAL: "Grand final",
                      THIRD: "Perebutan tempat ketiga",
                    } as Record<string, string>
                  )[side]
                }
              </h4>
            )}
            <div
              className="bracket-scroll"
              tabIndex={0}
              role="region"
              aria-label={`Bagan ${stage.name}`}
            >
              <div className="bracket-tree">
                {columns.map((column, i) => (
                  <section className="bracket-round" key={rounds[i]}>
                    <h4>
                      {side === "FINAL"
                        ? i
                          ? "Final ulang"
                          : "Grand final"
                        : side === "THIRD"
                          ? "Tempat ketiga"
                          : side === "WINNERS" &&
                              i === columns.length - 1 &&
                              column.length === 1
                            ? sides.length > 1
                              ? "Final jalur menang"
                              : "Final"
                            : side === "WINNERS" && column.length === 2
                              ? "Semifinal"
                              : `Babak ${rounds[i]}`}
                    </h4>
                    <div
                      className="bracket-round-matches"
                      style={{ height: tree ? height : undefined }}
                    >
                      {column.map((m, j) => (
                        <div
                          key={m.id}
                          className="bracket-node"
                          style={
                            tree
                              ? {
                                  position: "absolute",
                                  top:
                                    ((j + 0.5) * height) / column.length - 72,
                                  left: 0,
                                  right: 0,
                                }
                              : undefined
                          }
                        >
                          {tree && i < columns.length - 1 && (
                            <span
                              aria-hidden="true"
                              className={`bracket-connector ${j % 2 ? "connector-bottom" : "connector-top"}`}
                              style={{ height: height / column.length / 2 }}
                            />
                          )}
                          <MatchCard match={m} />
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
export function BracketViewer({
  stages,
  view = "ALL",
}: {
  stages: StageView[];
  view?: "ALL" | "GROUP" | "KNOCKOUT";
}) {
  const selected = (stages ?? []).filter(
    (stage) =>
      view === "ALL" ||
      (view === "GROUP" ? stage.type === "GROUP" : stage.type !== "GROUP"),
  );
  if (!selected.length)
    return (
      <div className="panel empty-state">
        <Icon name="trophy" size={30} />
        <p>
          {view === "GROUP"
            ? "Fase grup belum tersedia untuk kategori ini."
            : view === "KNOCKOUT"
              ? "Bagan knockout belum tersedia untuk kategori ini."
              : "Bagan pertandingan belum diundi."}
        </p>
      </div>
    );
  return (
    <div className="tournament-brackets space-y-8">
      {selected.map((stage) => (
        <section className="space-y-5" key={stage.id}>
          <header className="bracket-stage-heading">
            <div>
              <p className="page-eyebrow">
                {stage.type === "GROUP"
                  ? "PEREBUTAN PERINGKAT"
                  : "PERJALANAN MENUJU JUARA"}
              </p>
              <h3>{stage.name}</h3>
            </div>
            <span>
              {stage.type === "GROUP"
                ? `${stage.groups?.length ?? 0} grup`
                : "Geser untuk melihat babak berikutnya →"}
            </span>
          </header>
          {stage.type === "GROUP" ? (
            <GroupStage stage={stage} />
          ) : (
            <Knockout stage={stage} />
          )}
        </section>
      ))}
    </div>
  );
}
