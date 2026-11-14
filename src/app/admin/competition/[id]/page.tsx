"use client";
import { formatLabel } from "@/lib/labels";
import { Suspense, use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  OptionCards,
  SCORING_OPTIONS,
  DirectPointsSettings,
  PRESET_OPTIONS,
  DEUCE_OPTIONS,
} from "@/components/admin/TournamentChoices";
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
  entries?: { id: string; name: string }[];
  eligibility?: {
    gender?: string;
    minAge?: number;
    maxAge?: number;
    levels?: string[];
    notes?: string;
  } | null;
  standingsPolicy?: { winPoints?: number; tieBreakers?: string[] } | null;
  qualificationPolicy?: {
    perGroup?: number;
    bestRunnersUp?: number;
    normalization?: string;
  } | null;
}
interface Documents {
  responsibleName?: string | null;
  handbookUrl?: string | null;
  approvalNote?: string | null;
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
  const tournament = await apiFetch<{ categories: Category[] } & Documents>(
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
  return { categories, matches, documents: tournament as Documents };
}
function Competition({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selected, setSelected] = useState("");
  const [rules, setRules] = useState<Rules>(PRESETS.STANDARD);
  const [matches, setMatches] = useState<Match[]>([]);
  const [documents, setDocuments] = useState<Documents>();
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
  const usesGroups = category?.format === "GROUP_KNOCKOUT";
  const usesStandings =
    usesGroups || ["ROUND_ROBIN", "LEAGUE"].includes(category?.format ?? "");
  const categoryMatches = matches.filter((m) =>
    category?.stages.some((s) => s.id === m.stageId),
  );
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
      setDocuments(data.documents);
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
    <div className="competition-workspace space-y-6">
      <Link href={`/admin/tournaments/${id}`} className="text-brand">
        ← Kelola turnamen
      </Link>
      <div className="app-page-heading">
        <p className="page-eyebrow">Pengaturan lanjutan</p>
        <h1 className="page-heading">Aturan rinci & dokumen kompetisi</h1>
      </div>
      <p className="text-secondary">
        Halaman ini untuk aturan per fase, kelayakan peserta, undian berdasarkan
        unggulan, dan dokumen. Aturan pertandingan yang telah dimulai tidak
        berubah.
      </p>
      <p role="status" className="text-brand">
        {message}
      </p>
      <label className="field max-w-xl">
        Kategori
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {formatLabel(c.format)}
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
              Aturan skor per fase atau babak
            </h2>
            <div className="md:col-span-3">
              <OptionCards
                legend="Cara hitung skor"
                name="scoringMode"
                value={rules.mode === "POINTS" ? "POINTS" : "SETS"}
                options={SCORING_OPTIONS}
                onChange={(mode) =>
                  setRules({
                    ...PRESETS[mode === "POINTS" ? "POINTS" : "STANDARD"],
                  })
                }
                compact
                disabled={busy}
              />
              {rules.mode === "POINTS" ? (
                <DirectPointsSettings
                  options={rules}
                  onOptionsChange={(options) =>
                    setRules({ ...rules, ...options })
                  }
                  value={rules.totalPoints ?? 24}
                  onChange={(totalPoints) =>
                    setRules({ ...rules, totalPoints })
                  }
                  disabled={busy}
                />
              ) : (
                <OptionCards
                  legend="Pilih dasar aturan"
                  name="preset"
                  value={
                    Object.keys(PRESETS).find(
                      (key) => PRESETS[key].name === rules.name,
                    ) ?? "CUSTOM"
                  }
                  options={PRESET_OPTIONS.filter(
                    (option) => option.value !== "POINTS",
                  )}
                  onChange={(key) => setRules({ ...PRESETS[key] })}
                  compact
                  disabled={busy}
                />
              )}
            </div>
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
            {rules.mode !== "POINTS" && (
              <>
                <div className="md:col-span-3">
                  <OptionCards
                    legend="Aturan deuce"
                    name="deuce"
                    value={rules.deuce}
                    options={DEUCE_OPTIONS}
                    onChange={(deuce) =>
                      setRules({ ...rules, deuce: deuce as Rules["deuce"] })
                    }
                    compact
                    disabled={busy}
                  />
                </div>
                <p className="setting-help md:col-span-3">
                  Pengaturan berikut mengubah rincian pilihan di atas. Set
                  adalah kumpulan game; tie-break menentukan set saat game
                  imbang. Pilih lingkup kategori atau babak sebelum menyimpan.
                </p>
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
                  Set penentu memakai match tie-break
                </label>
                <label className="flex gap-2 items-center">
                  <input
                    type="checkbox"
                    checked={rules.allowDraw}
                    onChange={(e) =>
                      setRules({ ...rules, allowDraw: e.target.checked })
                    }
                  />
                  Izinkan hasil seri (laga grup berbatas waktu)
                </label>
              </>
            )}
            <button className="btn-primary" disabled={busy}>
              Simpan aturan
            </button>
          </form>
          <form
            key={selected}
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
                    ...(usesStandings && {
                      standingsPolicy: {
                        ...DEFAULT_STANDINGS,
                        winPoints: Number(f.get("win")),
                        tieBreakers: String(f.get("tieBreakers")).split(","),
                      },
                    }),
                    ...(usesGroups && {
                      qualificationPolicy: {
                        perGroup: Number(f.get("perGroup")),
                        bestRunnersUp: Number(f.get("runners")),
                        normalization: f.get("normalization"),
                      },
                    }),
                  }),
                }),
              );
            }}
          >
            <h2 className="text-xl font-bold md:col-span-3">
              {usesGroups
                ? "Kelayakan, klasemen & kelolosan"
                : usesStandings
                  ? "Kelayakan & klasemen"
                  : "Kelayakan peserta"}
            </h2>
            <label className="field">
              Kelompok peserta
              <select
                name="gender"
                defaultValue={category.eligibility?.gender ?? "ANY"}
              >
                <option value="ANY">Terbuka</option>
                <option value="MALE">Putra</option>
                <option value="FEMALE">Putri</option>
                <option value="MIXED">Campuran</option>
              </select>
            </label>
            <label className="field">
              Usia minimum
              <input
                type="number"
                name="minAge"
                min={0}
                defaultValue={category.eligibility?.minAge ?? ""}
              />
            </label>
            <label className="field">
              Usia maksimum
              <input
                type="number"
                name="maxAge"
                max={120}
                defaultValue={category.eligibility?.maxAge ?? ""}
              />
            </label>
            <label className="field">
              Tingkat permainan (pisahkan dengan koma)
              <input
                name="levels"
                placeholder="Pemula, Menengah"
                defaultValue={category.eligibility?.levels?.join(", ") ?? ""}
              />
            </label>
            <label className="field">
              Persyaratan lain
              <input
                name="notes"
                defaultValue={category.eligibility?.notes ?? ""}
              />
            </label>
            {usesStandings && (
              <>
                <label className="field">
                  Poin kemenangan
                  <select
                    name="win"
                    defaultValue={String(
                      category.standingsPolicy?.winPoints ?? 2,
                    )}
                  >
                    <option value="2">2 poin</option>
                    <option value="3">3 poin</option>
                  </select>
                </label>
                <label className="field">
                  Urutan pemecah seri
                  <select
                    name="tieBreakers"
                    defaultValue={
                      category.standingsPolicy?.tieBreakers?.join(",") ??
                      "POINTS,HEAD_TO_HEAD,SET_DIFFERENCE,GAME_DIFFERENCE,PLAYOFF"
                    }
                  >
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
              </>
            )}
            {usesGroups && (
              <>
                <label className="field">
                  Lolos per grup
                  <input
                    type="number"
                    name="perGroup"
                    min={1}
                    max={4}
                    defaultValue={category.qualificationPolicy?.perGroup ?? 2}
                  />
                </label>
                <label className="field">
                  Peringkat berikutnya terbaik yang ikut lolos
                  <input
                    type="number"
                    name="runners"
                    min={0}
                    defaultValue={
                      category.qualificationPolicy?.bestRunnersUp ?? 0
                    }
                  />
                </label>
                <label className="field">
                  Jika jumlah laga antargrup berbeda
                  <select
                    name="normalization"
                    defaultValue={
                      category.qualificationPolicy?.normalization ?? "NONE"
                    }
                  >
                    <option value="NONE">Tolak perbandingan langsung</option>
                    <option value="PER_MATCH">
                      Rata-rata per pertandingan
                    </option>
                  </select>
                </label>
              </>
            )}
            <button className="btn-primary" disabled={busy}>
              Simpan kebijakan
            </button>
          </form>
          <section className="panel space-y-4">
            <h2 className="text-xl font-bold">Undian bagan & klasemen</h2>
            <p className="text-secondary">
              Undian mengganti bagan yang belum dimainkan. Pasangan unggulan
              diatur lewat nomor unggulan di daftar peserta.
            </p>
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
                            }),
                          }),
                        "Bagan yang ditampilkan telah disimpan",
                      );
                  }}
                >
                  {mode === "SEEDED"
                    ? "Undi berdasarkan unggulan"
                    : "Undi acak"}
                </button>
              ))}
              {usesStandings && (
                <button
                  className="btn-secondary"
                  onClick={() =>
                    apiFetch<typeof standings>(
                      `/api/v2/categories/${selected}/standings`,
                    )
                      .then((rows) => {
                        setStandings(rows);
                        setMessage(
                          rows.length
                            ? ""
                            : "Belum ada klasemen. Klasemen muncul setelah hasil laga grup disahkan.",
                        );
                      })
                      .catch((e) => setMessage(e.message))
                  }
                >
                  Lihat klasemen disahkan
                </button>
              )}
              {usesGroups && (
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
              )}
            </div>
            {standings.map((g) => (
              <div key={g.id}>
                <h3 className="font-bold">{g.name}</h3>
                {g.standings.map((r) => (
                  <p key={r.id}>
                    {r.rank}.{" "}
                    {category.entries?.find((e) => e.id === r.id)?.name ??
                      "Pasangan"}{" "}
                    · {r.points} poin{" "}
                    {r.needsPlayoff
                      ? "(perlu playoff atau keputusan admin)"
                      : ""}
                  </p>
                ))}
              </div>
            ))}
          </section>
          <section className="panel space-y-3">
            <h2 className="text-xl font-bold">Wasit & pengesahan hasil</h2>
            <p className="text-secondary">
              {categoryMatches.length
                ? `${categoryMatches.length} laga di kategori ini, ${categoryMatches.filter((m) => m.approvalStatus === "APPROVED").length} sudah disahkan. Penugasan wasit dan pengesahan hasil dilakukan di langkah 4 halaman kelola.`
                : "Belum ada laga. Buat bagan terlebih dahulu."}
            </p>
            <Link
              className="btn-secondary"
              href={`/admin/tournaments/${id}?step=3`}
            >
              Buka langkah 4: jalankan & hasil
            </Link>
          </section>
        </>
      )}
      <form
        key={documents ? "loaded" : "loading"}
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
          <input
            name="responsible"
            defaultValue={documents?.responsibleName ?? ""}
          />
        </label>
        <label className="field">
          Tautan buku panduan teknis
          <input
            name="handbook"
            type="url"
            placeholder="https://"
            defaultValue={documents?.handbookUrl ?? ""}
          />
        </label>
        <label className="field">
          Catatan persetujuan penyelenggara
          <textarea name="note" defaultValue={documents?.approvalNote ?? ""} />
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
