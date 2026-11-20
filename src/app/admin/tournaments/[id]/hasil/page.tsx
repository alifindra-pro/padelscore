"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { categoryStyle } from "@/lib/category-color";

interface Row {
  id: string;
  matchNumber: number;
  category: string;
  stage: string;
  court: string | null;
  teamA: string;
  teamB: string;
  winner: "A" | "B" | null;
  sets: [number, number][];
  outcome: string | null;
  state: "APPROVED" | "AWAITING_APPROVAL" | "PLAYING";
  engineVersion: number;
  startedAt: string | null;
  finishedAt: string | null;
  referee: string | null;
  pendingDisputes: number;
}
type Filter = "ALL" | Row["state"];

const outcomeText: Record<string, string> = {
  RETIRED: "Lawan mundur",
  WALKOVER: "Menang WO",
  DISQUALIFIED: "Diskualifikasi",
};
const stateText: Record<Row["state"], string> = {
  AWAITING_APPROVAL: "Menunggu pengesahan",
  APPROVED: "Disahkan",
  PLAYING: "Sedang berlangsung",
};

function Content({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [rows, setRows] = useState<Row[]>();
  const [t, setT] = useState<{ name: string; timezone: string }>();
  const [filter, setFilter] = useState<Filter>("AWAITING_APPROVAL");
  const [category, setCategory] = useState("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");

  const refresh = useCallback(async () => {
    setRows(await apiFetch<Row[]>(`/api/v2/tournaments/${id}/results`));
  }, [id]);
  useEffect(() => {
    apiFetch<{ name: string; timezone: string }>(`/api/v1/tournaments/${id}`)
      .then(setT)
      .catch(() => {});
    // State is only set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 10000);
    return () => clearInterval(timer);
  }, [id, refresh]);

  async function approve(r: Row) {
    setBusy(r.id);
    setError("");
    setNotice("");
    try {
      await apiFetch(
        r.engineVersion === 2
          ? `/api/v2/matches/${r.id}/approve`
          : `/api/v1/matches/${r.id}/approve-result`,
        { method: "POST", body: "{}" },
      );
      await refresh();
      setNotice(`Hasil laga ${r.matchNumber} disahkan`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  if (!rows) return <p>{error || "Memuat…"}</p>;
  const tz = t?.timezone ?? "Asia/Jakarta";
  const clock = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleTimeString("id-ID", {
          timeZone: tz,
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—";
  const minutes = (r: Row) =>
    r.startedAt && r.finishedAt
      ? Math.max(
          1,
          Math.round(
            (new Date(r.finishedAt).getTime() -
              new Date(r.startedAt).getTime()) /
              60000,
          ),
        )
      : null;
  const score = (r: Row) =>
    r.sets.length ? r.sets.map((s) => s.join("–")).join(", ") : "—";
  const categories = [...new Set(rows.map((r) => r.category))];
  const inCategory = rows.filter(
    (r) => category === "ALL" || r.category === category,
  );
  const count = (s: Row["state"]) =>
    inCategory.filter((r) => r.state === s).length;
  const shown = inCategory.filter(
    (r) => filter === "ALL" || r.state === filter,
  );

  function downloadCsv() {
    const head = [
      "Laga",
      "Kategori",
      "Babak/Grup",
      "Lapangan",
      "Pasangan A",
      "Pasangan B",
      "Skor",
      "Pemenang",
      "Keterangan",
      "Mulai",
      "Selesai",
      "Durasi (menit)",
      "Wasit",
      "Status",
    ];
    const lines = inCategory.map((r) =>
      [
        r.matchNumber,
        r.category,
        r.stage,
        r.court ?? "",
        r.teamA,
        r.teamB,
        score(r),
        r.winner === "A" ? r.teamA : r.winner === "B" ? r.teamB : "",
        (r.outcome && outcomeText[r.outcome]) ?? "",
        clock(r.startedAt),
        clock(r.finishedAt),
        minutes(r) ?? "",
        r.referee ?? "",
        stateText[r.state],
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `laporan-hasil-${(t?.name ?? "turnamen").replace(/\W+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-7 results-report">
      <Link className="section-link" href={`/admin/tournaments/${id}`}>
        ← Kelola turnamen
      </Link>
      <header className="results-head">
        <div>
          <p className="page-eyebrow">HARI PERTANDINGAN</p>
          <h1 className="page-heading">Laporan hasil</h1>
          <p className="page-intro">
            Semua laga yang sudah dimainkan: skor, lapangan, wasit, waktu, dan
            status pengesahan. Hasil masuk klasemen dan bagan setelah disahkan.
          </p>
        </div>
        <button
          className="btn-secondary"
          disabled={!inCategory.length}
          onClick={downloadCsv}
        >
          Unduh CSV
        </button>
      </header>
      {error && (
        <p className="panel bg-critical/10 text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p
          className="bg-brand-soft p-3 rounded-lg text-brand text-sm"
          role="status"
        >
          {notice}
        </p>
      )}

      {categories.length > 1 && (
        <div className="checkin-tabs" role="tablist" aria-label="Kategori">
          {["ALL", ...categories].map((c, i) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              style={
                c === "ALL"
                  ? ({ "--cat": "var(--color-ink)" } as React.CSSProperties)
                  : categoryStyle(c, i - 1)
              }
              onClick={() => setCategory(c)}
            >
              {c === "ALL" ? "Semua kategori" : c}
            </button>
          ))}
        </div>
      )}
      <div
        className="checkin-filter results-filter"
        role="tablist"
        aria-label="Status hasil"
      >
        {(
          [
            ["AWAITING_APPROVAL", "Menunggu pengesahan", "out"],
            ["APPROVED", "Disahkan", "in"],
            ["PLAYING", "Sedang berlangsung", "all"],
            ["ALL", "Semua", "all"],
          ] as const
        ).map(([key, label, tone]) => (
          <button
            key={key}
            role="tab"
            aria-selected={filter === key}
            className={`is-${tone}`}
            onClick={() => setFilter(key)}
          >
            {label}
            <strong>{key === "ALL" ? inCategory.length : count(key)}</strong>
          </button>
        ))}
      </div>

      {shown.length ? (
        <ol className="results-list">
          {shown.map((r) => (
            <li
              key={r.id}
              className={`is-${r.state.toLowerCase()}`}
              style={categoryStyle(r.category, categories.indexOf(r.category))}
            >
              <div className="results-meta">
                <span>
                  {r.category} · {r.stage} · Laga {r.matchNumber}
                </span>
                <span>
                  {r.court ?? "Tanpa lapangan"} · {clock(r.startedAt)}–
                  {clock(r.finishedAt)}
                  {minutes(r) ? ` (${minutes(r)} menit)` : ""}
                </span>
              </div>
              <div className="results-score">
                <span className={r.winner === "A" ? "is-winner" : ""}>
                  {r.teamA}
                </span>
                <strong>{score(r)}</strong>
                <span className={r.winner === "B" ? "is-winner" : ""}>
                  {r.teamB}
                </span>
              </div>
              <div className="results-foot">
                <span>
                  Wasit: {r.referee ?? "—"}
                  {r.outcome && outcomeText[r.outcome]
                    ? ` · ${outcomeText[r.outcome]}`
                    : ""}
                  {r.pendingDisputes
                    ? ` · ${r.pendingDisputes} sanggahan menunggu`
                    : ""}
                </span>
                <span className="results-actions">
                  <span className="results-state">{stateText[r.state]}</span>
                  {r.state === "AWAITING_APPROVAL" && (
                    <button
                      className="btn-kinetic text-xs"
                      disabled={!!busy}
                      onClick={() => approve(r)}
                    >
                      {busy === r.id ? "Mengesahkan…" : "Sahkan hasil"}
                    </button>
                  )}
                  {r.state === "APPROVED" && (
                    <a
                      className="btn-secondary text-xs"
                      href={`/api/v2/matches/${r.id}/result.pdf`}
                    >
                      PDF hasil
                    </a>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="panel text-sm text-secondary">
          {filter === "AWAITING_APPROVAL"
            ? "Tidak ada hasil yang menunggu pengesahan."
            : "Belum ada laga di bagian ini."}
        </p>
      )}
    </div>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p>Memuat…</p>}>
      <Content {...props} />
    </Suspense>
  );
}
