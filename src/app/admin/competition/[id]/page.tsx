"use client";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  PRESETS,
  Rules,
  DEFAULT_STANDINGS,
} from "../../../../../packages/core/src";
interface Category {
  id: string;
  name: string;
  format: string;
  rulesV2: Rules | null;
  stages: { id: string; name: string }[];
}
interface Match {
  id: string;
  matchNumber: number;
  status: string;
  approvalStatus: string;
  entryA?: { name: string };
  entryB?: { name: string };
  stageId: string;
  round: number;
}
async function fetchCompetition(id: string) {
  const tournament = await apiFetch<{ categories: Category[] }>(
    `/api/v1/tournaments/${id}`,
  );
  const [categories, matches] = await Promise.all([
    Promise.all(
      tournament.categories.map((c) =>
        apiFetch<Category>(`/api/v2/categories/${c.id}`),
      ),
    ),
    apiFetch<Match[]>(`/api/v1/tournaments/${id}/schedule`),
  ]);
  return { categories, matches };
}
function Competition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState("");
  const [rules, setRules] = useState<Rules>(PRESETS.STANDARD);
  const [matches, setMatches] = useState<Match[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [stageId, setStageId] = useState("");
  const [round, setRound] = useState("");
  const [standings, setStandings] = useState<
    {
      id: string;
      name: string;
      standings: {
        id: string;
        rank: number;
        played: number;
        points: number;
        needsPlayoff: boolean;
      }[];
    }[]
  >([]);
  const [rulesFor, setRulesFor] = useState("");
  const category = categories.find((c) => c.id === selected);
  // Reset the rules form only when another category is chosen, so reloading
  // after an unrelated save does not discard unsaved edits.
  if (category && rulesFor !== selected) {
    setRulesFor(selected);
    setRules(category.rulesV2 ?? PRESETS.STANDARD);
    setStageId("");
    setRound("");
  }
  const apply = useCallback(
    (data: Awaited<ReturnType<typeof fetchCompetition>>) => {
      setCategories(data.categories);
      setMatches(data.matches);
      setSelected((s) => s || data.categories[0]?.id || "");
    },
    [],
  );
  const load = () => fetchCompetition(id).then(apply);
  useEffect(() => {
    fetchCompetition(id)
      .then(apply)
      .catch((e) => setMessage((e as Error).message));
  }, [id, apply]);
  const run = async (
    work: () => Promise<unknown>,
    success = "Perubahan disimpan",
  ) => {
    setBusy(true);
    try {
      await work();
      await load();
      setMessage(success);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6">
      <Link href={`/admin/tournaments/${id}`} className="text-brand">
        ← Kelola turnamen
      </Link>
      <div className="app-page-heading">
        <p className="page-eyebrow">SET THE RULES. START THE GAME.</p>
        <h1 className="page-heading">Aturan & operasional kompetisi</h1>
      </div>
      <p className="text-secondary">
        Konfigurasi lokal ditentukan penyelenggara. Aturan pertandingan yang
        telah dimulai tidak berubah.
      </p>
      <p role="status" className="text-brand">
        {message}
      </p>
      <label className="field max-w-xl">
        Kategori
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.format}
            </option>
          ))}
        </select>
      </label>
      {category && (
        <>
          <form
            className="panel grid md:grid-cols-3 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                stageId
                  ? apiFetch(`/api/v2/stages/${stageId}`, {
                      method: "PATCH",
                      body: JSON.stringify(
                        round ? { roundRules: { [round]: rules } } : { rules },
                      ),
                    })
                  : apiFetch(`/api/v2/categories/${selected}`, {
                      method: "PATCH",
                      body: JSON.stringify({ rules }),
                    }),
              );
            }}
          >
            <h2 className="text-xl font-bold md:col-span-3">
              Format pertandingan
            </h2>
            <label className="field">
              Preset
              <select
                onChange={(e) => setRules({ ...PRESETS[e.target.value] })}
                defaultValue="STANDARD"
              >
                {Object.entries(PRESETS).map(([key, p]) => (
                  <option key={key} value={key}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Berlaku pada
              <select
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                <option value="">Seluruh kategori</option>
                {category.stages.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Babak tertentu (opsional)
              <input
                type="number"
                min={1}
                value={round}
                disabled={!stageId}
                onChange={(e) => setRound(e.target.value)}
              />
            </label>
            <label className="field">
              Aturan deuce
              <select
                value={rules.deuce}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    deuce: e.target.value as Rules["deuce"],
                  })
                }
              >
                <option value="ADVANTAGE">Advantage</option>
                <option value="GOLDEN_POINT">Golden Point</option>
                <option value="STAR_POINT">Star Point</option>
              </select>
            </label>
            {(
              [
                ["setsToWin", "Set untuk menang"],
                ["gamesPerSet", "Target game per set"],
                ["tiebreakAt", "Tie-break pada game"],
                ["tiebreakPoints", "Target tie-break"],
                ["matchTiebreakPoints", "Target match tie-break"],
                ["durationMinutes", "Durasi (menit)"],
              ] as const
            ).map(([key, label]) => (
              <label className="field" key={key}>
                {label}
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={rules[key]}
                  onChange={(e) =>
                    setRules({
                      ...rules,
                      [key]: Number(e.target.value),
                      source: "LOCAL",
                    })
                  }
                />
              </label>
            ))}
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={rules.decidingMatchTiebreak}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    decidingMatchTiebreak: e.target.checked,
                  })
                }
              />
              Match tie-break set penentu
            </label>
            <label className="flex gap-2 items-center">
              <input
                type="checkbox"
                checked={rules.allowDraw}
                onChange={(e) =>
                  setRules({ ...rules, allowDraw: e.target.checked })
                }
              />
              Izinkan seri (timed grup)
            </label>
            <button className="btn-primary" disabled={busy}>
              Simpan aturan
            </button>
          </form>
          <form
            className="panel grid md:grid-cols-3 gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void run(() =>
                apiFetch(`/api/v2/categories/${selected}`, {
                  method: "PATCH",
                  body: JSON.stringify({
                    eligibility: {
                      gender: f.get("gender"),
                      minAge: f.get("minAge")
                        ? Number(f.get("minAge"))
                        : undefined,
                      maxAge: f.get("maxAge")
                        ? Number(f.get("maxAge"))
                        : undefined,
                      levels: String(f.get("levels"))
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      notes: f.get("notes"),
                    },
                    standingsPolicy: {
                      ...DEFAULT_STANDINGS,
                      winPoints: Number(f.get("win")),
                      tieBreakers: String(f.get("tieBreakers")).split(","),
                    },
                    qualificationPolicy: {
                      perGroup: Number(f.get("perGroup")),
                      bestRunnersUp: Number(f.get("runners")),
                      normalization: f.get("normalization"),
                    },
                  }),
                }),
              );
            }}
          >
            <h2 className="text-xl font-bold md:col-span-3">
              Kelayakan, klasemen & kelolosan
            </h2>
            <label className="field">
              Gender
              <select name="gender">
                <option value="ANY">Terbuka</option>
                <option value="MALE">Putra</option>
                <option value="FEMALE">Putri</option>
                <option value="MIXED">Campuran</option>
              </select>
            </label>
            <label className="field">
              Usia minimum
              <input type="number" name="minAge" min={0} />
            </label>
            <label className="field">
              Usia maksimum
              <input type="number" name="maxAge" max={120} />
            </label>
            <label className="field">
              Level (pisahkan koma)
              <input name="levels" placeholder="Beginner, Intermediate" />
            </label>
            <label className="field">
              Persyaratan lain
              <input name="notes" />
            </label>
            <label className="field">
              Poin kemenangan
              <select name="win">
                <option value="2">2 poin</option>
                <option value="3">3 poin</option>
              </select>
            </label>
            <label className="field">
              Urutan pemecah seri
              <select name="tieBreakers">
                <option value="POINTS,HEAD_TO_HEAD,SET_DIFFERENCE,GAME_DIFFERENCE,PLAYOFF">
                  Poin → pertemuan → selisih set → game → playoff
                </option>
                <option value="WINS,SET_DIFFERENCE,GAME_DIFFERENCE,HEAD_TO_HEAD,PLAYOFF">
                  Kemenangan → selisih set → game → pertemuan → playoff
                </option>
                <option value="POINTS,SET_DIFFERENCE,GAME_DIFFERENCE,SETS_WON,GAMES_WON,PLAYOFF">
                  Poin → selisih set → game → set/game menang → playoff
                </option>
              </select>
            </label>
            <label className="field">
              Lolos per grup
              <input
                type="number"
                name="perGroup"
                min={1}
                max={4}
                defaultValue={2}
              />
            </label>
            <label className="field">
              Best runners-up
              <input type="number" name="runners" min={0} defaultValue={0} />
            </label>
            <label className="field">
              Grup tidak seimbang
              <select name="normalization">
                <option value="NONE">Tolak perbandingan langsung</option>
                <option value="PER_MATCH">Rata-rata per pertandingan</option>
              </select>
            </label>
            <button className="btn-primary" disabled={busy}>
              Simpan kebijakan
            </button>
          </form>
          <section className="panel space-y-4">
            <h2 className="text-xl font-bold">Drawing & hasil</h2>
            <div className="flex flex-wrap gap-3">
              {(["SEEDED", "RANDOM"] as const).map((mode) => (
                <button
                  className="btn-primary"
                  disabled={busy}
                  key={mode}
                  onClick={() => {
                    if (
                      confirm(
                        "Buat bagan dan ganti bagan yang belum digunakan?",
                      )
                    )
                      void run(
                        () =>
                          apiFetch(`/api/v2/categories/${selected}/draw`, {
                            method: "POST",
                            body: JSON.stringify({
                              mode,
                              thirdPlace: true,
                              groups: 2,
                            }),
                          }),
                        "Bagan yang ditampilkan telah disimpan",
                      );
                  }}
                >
                  {mode === "SEEDED" ? "Undi berdasarkan seed" : "Undi acak"}
                </button>
              ))}
              <button
                className="btn-secondary"
                onClick={() =>
                  apiFetch<typeof standings>(
                    `/api/v2/categories/${selected}/standings`,
                  )
                    .then(setStandings)
                    .catch((e) => setMessage(e.message))
                }
              >
                Lihat klasemen disahkan
              </button>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() =>
                  run(() =>
                    apiFetch(`/api/v2/categories/${selected}/qualify`, {
                      method: "POST",
                      body: "{}",
                    }),
                  )
                }
              >
                Bentuk babak kelolosan
              </button>
            </div>
            {standings.map((g) => (
              <div key={g.id}>
                <h3 className="font-bold">{g.name}</h3>
                {g.standings.map((r) => (
                  <p key={r.id}>
                    #{r.rank} · {r.id} · {r.points} poin{" "}
                    {r.needsPlayoff ? "— perlu playoff/keputusan admin" : ""}
                  </p>
                ))}
              </div>
            ))}
          </section>
          <section className="panel space-y-4">
            <h2 className="text-xl font-bold">Pertandingan & wasit</h2>
            {matches
              .filter((m) => category.stages.some((s) => s.id === m.stageId))
              .map((m) => (
                <div
                  key={m.id}
                  className="border-t border-line py-4 flex flex-wrap gap-3 items-center"
                >
                  <span className="flex-1">
                    #{m.matchNumber} · {m.entryA?.name ?? "Menunggu"} vs{" "}
                    {m.entryB?.name ?? "Menunggu"}
                    <br />
                    <small>
                      {m.status} · {m.approvalStatus}
                    </small>
                  </span>
                  <Link className="btn-secondary" href={`/referee/v2/${m.id}`}>
                    Konsol wasit
                  </Link>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => {
                      const userId = prompt(
                        "ID akun wasit dari daftar tim organisasi",
                      );
                      if (userId)
                        void run(() =>
                          apiFetch(`/api/v2/matches/${m.id}/officials`, {
                            method: "POST",
                            body: JSON.stringify({ userId }),
                          }),
                        );
                    }}
                  >
                    Tugaskan wasit
                  </button>
                  <button
                    className="btn-kinetic"
                    disabled={busy || m.approvalStatus === "APPROVED"}
                    onClick={() =>
                      run(() =>
                        apiFetch(`/api/v2/matches/${m.id}/approve`, {
                          method: "POST",
                          body: "{}",
                        }),
                      )
                    }
                  >
                    Sahkan hasil
                  </button>
                </div>
              ))}
          </section>
        </>
      )}
      <form
        className="panel grid md:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(() =>
            apiFetch(`/api/v2/tournaments/${id}`, {
              method: "PATCH",
              body: JSON.stringify({
                responsibleName: f.get("responsible"),
                handbookUrl: f.get("handbook") || undefined,
                approvalNote: f.get("note"),
              }),
            }),
          );
        }}
      >
        <h2 className="text-xl font-bold md:col-span-2">Dokumen kompetisi</h2>
        <label className="field">
          Penanggung jawab
          <input name="responsible" />
        </label>
        <label className="field">
          Tautan technical handbook
          <input name="handbook" type="url" />
        </label>
        <label className="field">
          Catatan persetujuan penyelenggara
          <textarea name="note" />
        </label>
        <button className="btn-primary" disabled={busy}>
          Simpan dokumen
        </button>
      </form>
    </div>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense
      fallback={<main className="page-shell py-16">Memuat halaman…</main>}
    >
      <Competition {...props} />
    </Suspense>
  );
}
