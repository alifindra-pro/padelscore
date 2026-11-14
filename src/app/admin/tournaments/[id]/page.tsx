"use client";
import {
  deuceLabel,
  formatLabel,
  matchStatusLabel,
  tournamentStatusLabel,
} from "@/lib/labels";
import { useCallback, use, useEffect, useState } from "react";
import Link from "next/link";
import {
  isMainEntry,
  waitingEntries,
  entryStatusLabel,
} from "@/lib/entry-status";
import { apiFetch } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { BracketViewer } from "@/components/BracketViewer";
import {
  OptionCards,
  SCORING_OPTIONS,
  DirectPointsSettings,
  FORMAT_OPTIONS,
  EXTRA_FORMAT_OPTIONS,
  PRESET_OPTIONS,
  DEUCE_OPTIONS,
} from "@/components/admin/TournamentChoices";
import {
  PRESETS,
  CATEGORY_NAMES,
  Rules,
  directPointsSummary,
} from "../../../../../packages/core/src";
interface Category {
  id: string;
  name: string;
  format: string;
  rulesV2?: Rules;
  maxEntries?: number | null;
}
interface Tournament {
  id: string;
  name: string;
  slug: string;
  status: string;
  organizationId: string;
  timezone: string;
  startDate: string;
  location: string;
  categories: Category[];
  courts: { id: string; name: string }[];
}
interface Player {
  id: string;
  fullName: string;
}
interface Entry {
  status: string;
  createdAt: string;
  id: string;
  name: string;
  seed: number | null;
}
interface Match {
  id: string;
  matchNumber: number;
  round: number;
  entryA?: { id: string; name: string };
  entryB?: { id: string; name: string };
  winnerId?: string | null;
  court?: { name: string };
  status: string;
  approvalStatus: string;
  engineVersion: number;
  scheduledAt?: string;
  officials?: { userId: string; user: { fullName: string } }[];
  scoreSnapshot?: {
    setsA: number;
    setsB: number;
    pointsA: string;
    pointsB: string;
    gamesA: number[];
    gamesB: number[];
  } | null;
  stage: { categoryId: string; category: { name: string } };
}
export default function Workspace({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [t, setT] = useState<Tournament>();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stages, setStages] = useState<
    Parameters<typeof BracketViewer>[0]["stages"]
  >([]);
  const [staff, setStaff] = useState<{ id: string; fullName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [addExisting, setAddExisting] = useState(false);
  const [newCategoryFormat, setNewCategoryFormat] =
    useState("SINGLE_ELIMINATION");
  const [rules, setRules] = useState<Rules>(PRESETS.STANDARD);
  // null = follow the default (open until a bracket exists); a click makes it explicit.
  const [rulesOpen, setRulesOpen] = useState<boolean | null>(null);
  const [loadedCategory, setLoadedCategory] = useState("");
  const mainEntries = entries.filter(isMainEntry);
  const queue = waitingEntries(entries);
  const category = t?.categories.find((c) => c.id === selected);
  const load = useCallback(async () => {
    const data = await apiFetch<Tournament>(`/api/v1/tournaments/${id}`);
    setT(data);
    setSelected((s) =>
      data.categories.some((c) => c.id === s)
        ? s
        : (data.categories[0]?.id ?? ""),
    );
    const [p, m, orgs] = await Promise.all([
      apiFetch<{ items: Player[] }>("/api/v1/players", {
        params: { organizationId: data.organizationId, limit: 100 },
      }),
      apiFetch<Match[]>(`/api/v1/tournaments/${id}/schedule`),
      apiFetch<
        { id: string; members: { user: { id: string; fullName: string } }[] }[]
      >("/api/v2/organizations"),
    ]);
    setPlayers(p.items);
    setMatches(m);
    setStaff(
      orgs
        .find((o) => o.id === data.organizationId)
        ?.members.map((x) => x.user) ?? [],
    );
  }, [id]);
  const loadCategory = useCallback(async () => {
    if (!selected) return;
    const [e, c, b] = await Promise.all([
      apiFetch<Entry[]>(`/api/v1/categories/${selected}/entries`),
      apiFetch<Category>(`/api/v2/categories/${selected}`),
      apiFetch<
        | { stages?: Parameters<typeof BracketViewer>[0]["stages"] }
        | Parameters<typeof BracketViewer>[0]["stages"]
      >(`/api/v1/categories/${selected}/brackets`),
    ]);
    setEntries(e);
    setRules(c.rulesV2 ?? PRESETS.STANDARD);
    setStages(Array.isArray(b) ? b : (b.stages ?? []));
    setLoadedCategory(selected);
  }, [selected]);
  useEffect(() => {
    const requestedStep = new URLSearchParams(window.location.search).get(
      "step",
    );
    // State changes in load occur only after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
      .then(() => {
        if (requestedStep && /^[0-3]$/.test(requestedStep))
          setStep(Number(requestedStep));
      })
      .catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    // State changes occur after the category requests resolve, never synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCategory().catch((e) => setError(e.message));
  }, [loadCategory]);
  async function run(
    work: () => Promise<unknown>,
    success = "Perubahan disimpan",
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
      await loadCategory();
      setNotice(success);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const changeStatus = (next: string, success: string) =>
    run(
      () =>
        apiFetch(`/api/v1/tournaments/${id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: next }),
        }),
      success,
    );
  if (!t)
    return (
      <div className="panel empty-state">
        {error || "Menyiapkan ruang turnamen…"}
      </div>
    );
  const visibleMatches = matches.filter((m) => m.stage.categoryId === selected);
  const approved = (m: Match) =>
    m.approvalStatus === "APPROVED" || m.status === "APPROVED";
  const playable = matches.filter((m) => m.entryA && m.entryB);
  const awaitingApproval = matches.filter(
    (m) => m.status === "FINISHED" && !approved(m),
  );
  const unfinished = matches.filter((m) => !approved(m));
  const unscheduled = playable.filter((m) => !m.scheduledAt && !approved(m));
  const withoutReferee = playable.filter(
    (m) => !m.officials?.length && !approved(m) && m.status !== "FINISHED",
  );
  const isPublic = ["PUBLISHED", "IN_PROGRESS", "COMPLETED"].includes(t.status);
  // The lifecycle button follows what the tournament actually needs next:
  // once a bracket exists entries are locked, so registration is no longer offered.
  const lifecycle: { label: string; next: string; done: string } | null = [
    "COMPLETED",
    "ARCHIVED",
  ].includes(t.status)
    ? null
    : t.status === "IN_PROGRESS"
      ? {
          label: "Selesaikan turnamen",
          next: "COMPLETED",
          done: "Turnamen selesai. Hasil tetap dapat dilihat di halaman publik.",
        }
      : !matches.length
        ? t.status === "REGISTRATION"
          ? {
              label: "Tutup pendaftaran",
              next: "PUBLISHED",
              done: "Pendaftaran ditutup. Bagan siap dibuat setelah peserta lengkap.",
            }
          : {
              label: "Buka pendaftaran publik",
              next: "REGISTRATION",
              done: "Pendaftaran publik dibuka.",
            }
        : t.status === "PUBLISHED"
          ? {
              label: "Mulai turnamen",
              next: "IN_PROGRESS",
              done: "Turnamen dimulai. Wasit dapat mencatat skor.",
            }
          : {
              label: "Terbitkan turnamen",
              next: "PUBLISHED",
              done: "Turnamen terbit. Jadwal dan bagan terlihat di halaman publik.",
            };
  const nextStep: {
    text: string;
    action: string;
    go?: number;
    status?: boolean;
    href?: string;
  } = !t.categories.length
    ? {
        text: "Belum ada kategori pertandingan.",
        action: "Tambah kategori",
        go: 0,
      }
    : !t.courts.length
      ? {
          text: "Belum ada lapangan. Jadwal memerlukan minimal satu lapangan.",
          action: "Tambah lapangan",
          go: 0,
        }
      : !stages.length && mainEntries.length < 2
        ? {
            text: `${category?.name ?? "Kategori ini"} baru punya ${mainEntries.length} pasangan. Bagan memerlukan minimal 2.`,
            action: "Tambah peserta",
            go: 1,
          }
        : !stages.length
          ? {
              text: `${mainEntries.length} pasangan sudah terdaftar di ${category?.name ?? "kategori ini"}. Bagan belum dibuat.`,
              action: "Buat bagan",
              go: 2,
            }
          : unscheduled.length
            ? {
                text: `${unscheduled.length} laga belum punya jadwal.`,
                action: "Susun jadwal",
                go: 2,
              }
            : ["DRAFT", "REGISTRATION"].includes(t.status)
              ? {
                  text: "Bagan dan jadwal siap, tetapi penonton belum bisa melihatnya.",
                  action: "Terbitkan turnamen",
                  status: true,
                }
              : t.status === "PUBLISHED"
                ? {
                    text: withoutReferee.length
                      ? `${withoutReferee.length} laga belum punya wasit. Tugaskan wasit, lalu mulai turnamen.`
                      : "Turnamen sudah terbit. Mulai saat laga pertama siap dimainkan.",
                    action: withoutReferee.length
                      ? "Tugaskan wasit"
                      : "Mulai turnamen",
                    go: withoutReferee.length ? 3 : undefined,
                    status: !withoutReferee.length,
                  }
                : t.status === "IN_PROGRESS"
                  ? awaitingApproval.length
                    ? {
                        text: `${awaitingApproval.length} hasil menunggu disahkan.`,
                        action: "Periksa hasil",
                        go: 3,
                      }
                    : unfinished.length
                      ? {
                          text: `${unfinished.length} laga belum selesai.`,
                          action: "Lihat pertandingan",
                          go: 3,
                        }
                      : {
                          text: "Semua hasil sudah disahkan.",
                          action: "Selesaikan turnamen",
                          status: true,
                        }
                  : t.status === "ARCHIVED"
                    ? {
                        text: "Turnamen diarsipkan dan tidak tampil di halaman publik.",
                        action: "",
                      }
                    : {
                        text: "Turnamen selesai. Hasil dapat dibagikan dari halaman publik.",
                        action: "Lihat halaman publik",
                        href: `/tournament/${t.slug}`,
                      };
  return (
    <div className="tournament-workspace space-y-6">
      <Link href="/admin/tournaments" className="text-xs text-secondary">
        ← Semua turnamen
      </Link>
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div>
          <div className="flex gap-2 items-center mb-3">
            <span
              className={
                t.status === "IN_PROGRESS" ? "status-live" : "status-pill"
              }
            >
              {tournamentStatusLabel(t.status)}
            </span>
            <span className="text-xs text-secondary">
              {new Date(t.startDate).toLocaleDateString("id-ID", {
                timeZone: t.timezone,
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>
          <p className="page-eyebrow">KELOLA TURNAMEN</p>
          <h1 className="page-heading">{t.name}</h1>
          <p className="text-secondary text-sm mt-2 flex gap-2 items-center">
            <Icon name="pin" size={15} />
            {t.location || "Lokasi belum diatur"}
          </p>
        </div>
        {["PUBLISHED", "IN_PROGRESS", "COMPLETED", "ARCHIVED"].includes(
          t.status,
        ) && (
          <Link className="btn-secondary" href={`/tournament/${t.slug}`}>
            Lihat halaman publik
            <Icon name="arrow" size={16} />
          </Link>
        )}
      </div>
      <section className="next-step" aria-labelledby="next-step-title">
        <div>
          <h2 id="next-step-title">Langkah berikutnya</h2>
          <p>{nextStep.text}</p>
        </div>
        {nextStep.href ? (
          <Link className="next-step-action" href={nextStep.href}>
            {nextStep.action}
          </Link>
        ) : nextStep.status && lifecycle ? (
          <button
            className="btn-kinetic"
            disabled={busy}
            onClick={() => changeStatus(lifecycle.next, lifecycle.done)}
          >
            {lifecycle.label}
          </button>
        ) : nextStep.go !== undefined && nextStep.go !== step ? (
          <button
            className="next-step-action"
            onClick={() => {
              setStep(nextStep.go!);
              setError("");
            }}
          >
            {nextStep.action}
          </button>
        ) : null}
      </section>
      <nav className="step-nav" aria-label="Langkah pengelolaan">
        {[
          "Siapkan acara",
          "Tambah peserta",
          "Atur pertandingan",
          "Jalankan & hasil",
        ].map((label, i) => (
          <button
            key={label}
            className="step-tab"
            aria-label={label}
            aria-current={step === i ? "step" : undefined}
            onClick={() => {
              setStep(i);
              setError("");
            }}
          >
            <span className="step-number">{i + 1}</span>
            <span className="step-tab-copy">
              {label}
              <small>
                {
                  [
                    "Kategori & lapangan",
                    "Nama pemain & pasangan",
                    "Skor, bagan & jadwal",
                    "Wasit, publikasi & hasil",
                  ][i]
                }
              </small>
            </span>
          </button>
        ))}
      </nav>
      {step < 3 && (
        <div className="workspace-step-intro">
          <span className="setting-section-icon">
            <Icon name={["settings", "users", "court", "live"][step]} />
          </span>
          <div>
            <h2>
              {
                [
                  "Siapkan dasar acaranya",
                  "Susun daftar peserta",
                  "Tentukan jalannya pertandingan",
                  "Jalankan acara & periksa hasil",
                ][step]
              }
            </h2>
            <p>
              {
                [
                  "Buat kategori untuk tiap kelompok peserta, lalu tambahkan lapangan yang tersedia.",
                  "Daftarkan pasangan baru atau pilih pemain yang sudah ada dalam organisasi.",
                  "Pilih aturan skor, buat bagan, lalu susun waktu bermain dan jeda istirahat.",
                  "Tugaskan wasit, publikasikan acara, dan sahkan hasil sebelum dibagikan.",
                ][step]
              }
            </p>
          </div>
        </div>
      )}
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
      {step === 0 ? (
        <>
          <div className="grid xl:grid-cols-2 gap-5">
            <section className="panel space-y-5">
              <div className="stat-icon">
                <Icon name="trophy" />
              </div>
              <div>
                <h2 className="panel-title">Kategori pertandingan</h2>
                <p className="text-sm text-secondary mt-2">
                  Pisahkan peserta berdasarkan kelompok yang Anda tentukan.
                </p>
              </div>
              {t.categories.map((c) => (
                <div
                  key={c.id}
                  className="flex justify-between gap-3 p-3 rounded-lg bg-surface-tint"
                >
                  <strong className="text-sm">{c.name}</strong>
                  <span className="text-xs text-secondary">
                    {formatLabel(c.format)}
                  </span>
                </div>
              ))}
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void run(async () => {
                    const c = await apiFetch<Category>(
                      `/api/v1/tournaments/${id}/categories`,
                      {
                        method: "POST",
                        body: JSON.stringify({
                          name: f.get("name"),
                          format: f.get("format"),
                        }),
                      },
                    );
                    setSelected(c.id);
                    form.reset();
                  }, "Kategori ditambahkan. Lanjutkan dengan peserta.");
                }}
              >
                <label className="field">
                  Nama kategori
                  <input
                    name="name"
                    list="categories"
                    placeholder="Contoh: Ganda Putra Intermediate"
                    minLength={2}
                    required
                  />
                  <datalist id="categories">
                    {CATEGORY_NAMES.map((name) => (
                      <option key={name} value={name} />
                    ))}
                  </datalist>
                </label>
                <OptionCards
                  legend="Cara menentukan lawan"
                  name="format"
                  value={newCategoryFormat}
                  onChange={setNewCategoryFormat}
                  options={[
                    ...FORMAT_OPTIONS.slice(0, 2),
                    ...EXTRA_FORMAT_OPTIONS,
                  ]}
                  compact
                />
                <button className="btn-secondary w-full" disabled={busy}>
                  <Icon name="plus" size={16} />
                  Tambah kategori
                </button>
              </form>
            </section>
            <section className="panel space-y-5">
              <div className="stat-icon">
                <Icon name="court" />
              </div>
              <div>
                <h2 className="panel-title">Lapangan acara</h2>
                <p className="text-sm text-secondary mt-2">
                  Lapangan ini digunakan untuk menyusun jadwal pertandingan.
                </p>
              </div>
              {t.courts.map((c) => (
                <div
                  key={c.id}
                  className="flex gap-3 items-center p-3 bg-surface-tint rounded-lg text-sm"
                >
                  <Icon name="court" size={18} />
                  {c.name}
                </div>
              ))}
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  const form = e.currentTarget;
                  void run(async () => {
                    await apiFetch(`/api/v1/tournaments/${id}/courts`, {
                      method: "POST",
                      body: JSON.stringify({ name: f.get("name") }),
                    });
                    form.reset();
                  });
                }}
              >
                <label className="field">
                  Nama lapangan
                  <input
                    name="name"
                    placeholder="Contoh: Center Court"
                    required
                  />
                </label>
                <button className="btn-secondary w-full" disabled={busy}>
                  <Icon name="plus" size={16} />
                  Tambah lapangan
                </button>
              </form>
            </section>
          </div>
          <p id="participants-help" className="action-help">
            {t.categories.length
              ? "Kategori sudah tersedia. Lanjutkan untuk mendaftarkan pasangan pemain."
              : "Tambahkan minimal satu kategori agar dapat melanjutkan ke peserta."}
          </p>
          <div className="step-actions justify-end">
            <button
              className="btn-primary"
              aria-describedby="participants-help"
              disabled={busy || !t.categories.length}
              onClick={() => setStep(1)}
            >
              Lanjut: tambah peserta
              <Icon name="arrow" size={18} />
            </button>
          </div>
        </>
      ) : (
        <>
          {t.categories.length > 1 && (
            <label className="field max-w-md">
              Kategori yang dikelola
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                {t.categories.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!category ? (
            <section className="panel empty-state">
              <p>Tambahkan kategori terlebih dahulu.</p>
              <button className="btn-primary" onClick={() => setStep(0)}>
                Siapkan acara
              </button>
            </section>
          ) : step === 1 ? (
            <>
              <section className="panel space-y-3">
                <h2 className="panel-title">Pendaftaran peserta</h2>
                <p>
                  {stages.length
                    ? "Bagan sudah dibuat, jadi daftar peserta dikunci. Untuk mengubah peserta, undi ulang bagan di langkah 3 selama belum ada laga yang dimainkan."
                    : t.status === "REGISTRATION"
                      ? "Pendaftaran publik sedang dibuka. Peserta dapat mendaftar sendiri, dan admin tetap bisa mengisi slot di bawah."
                      : "Admin bisa mengisi slot di bawah. Buka pendaftaran publik agar peserta juga bisa mendaftarkan pasangan sendiri."}
                </p>
                <div className="action-row">
                  {["DRAFT", "PUBLISHED", "REGISTRATION"].includes(t.status) &&
                    !stages.length && (
                      <button
                        className="btn-primary"
                        disabled={busy}
                        onClick={() =>
                          t.status === "REGISTRATION"
                            ? changeStatus(
                                "PUBLISHED",
                                "Pendaftaran ditutup. Bagan siap dibuat setelah peserta lengkap.",
                              )
                            : changeStatus(
                                "REGISTRATION",
                                "Pendaftaran publik dibuka.",
                              )
                        }
                      >
                        {t.status === "REGISTRATION"
                          ? "Tutup pendaftaran"
                          : "Buka pendaftaran publik"}
                      </button>
                    )}
                  {t.status === "REGISTRATION" && (
                    <Link
                      className="btn-secondary"
                      href={`/tournament/${t.slug}#registration`}
                      target="_blank"
                    >
                      Buka halaman pendaftaran
                    </Link>
                  )}
                  {stages.length > 0 && (
                    <button
                      className="btn-secondary"
                      onClick={() => setStep(2)}
                    >
                      Buka bagan di langkah 3
                    </button>
                  )}
                </div>
              </section>
              <div
                className={
                  stages.length
                    ? "grid gap-5"
                    : "grid xl:grid-cols-[1fr_1.2fr] gap-5"
                }
              >
                {!stages.length && (
                  <section className="panel space-y-5">
                    <div>
                      <h2 className="panel-title">Tambahkan pasangan</h2>
                      <p className="text-sm text-secondary mt-2">
                        Cukup nama pemain. Tidak perlu membuat akun member.
                      </p>
                    </div>
                    <div
                      className="choice-group"
                      role="group"
                      aria-label="Sumber pemain"
                    >
                      <button
                        className="choice-button"
                        aria-pressed={!addExisting}
                        onClick={() => setAddExisting(false)}
                      >
                        Ketik pemain baru
                      </button>
                      <button
                        className="choice-button"
                        aria-pressed={addExisting}
                        onClick={() => setAddExisting(true)}
                      >
                        Pilih pemain terdaftar
                      </button>
                    </div>
                    <form
                      className="space-y-4"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        const form = e.currentTarget;
                        void run(async () => {
                          const ids = addExisting
                            ? [String(f.get("one")), String(f.get("two"))]
                            : [];
                          const names = addExisting
                            ? ids.map(
                                (pid) =>
                                  players.find((p) => p.id === pid)?.fullName ??
                                  "",
                              )
                            : [
                                String(f.get("one")).trim(),
                                String(f.get("two")).trim(),
                              ];
                          await apiFetch(
                            `/api/v1/categories/${selected}/entries`,
                            {
                              method: "POST",
                              body: JSON.stringify({
                                name: names.join(" / "),
                                playerIds: ids,
                                playerNames: addExisting ? undefined : names,
                                seed: f.get("seed")
                                  ? Number(f.get("seed"))
                                  : undefined,
                              }),
                            },
                          );
                          form.reset();
                        }, "Pasangan ditambahkan");
                      }}
                    >
                      {["one", "two"].map((key, i) => (
                        <label key={key} className="field">
                          Pemain {i + 1}
                          {addExisting ? (
                            <select name={key} required defaultValue="">
                              <option value="" disabled>
                                Pilih pemain
                              </option>
                              {players.map((p) => (
                                <option value={p.id} key={p.id}>
                                  {p.fullName}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              name={key}
                              minLength={2}
                              placeholder={`Nama lengkap pemain ${i + 1}`}
                              required
                            />
                          )}
                        </label>
                      ))}
                      <details>
                        <summary className="text-sm cursor-pointer text-secondary">
                          Unggulan / seed (opsional)
                        </summary>
                        <label className="field mt-3">
                          Nomor unggulan
                          <input type="number" name="seed" min={1} />
                        </label>
                      </details>
                      <button className="btn-primary w-full" disabled={busy}>
                        {busy
                          ? "Menambahkan…"
                          : queue.length > 0 ||
                              (!!category.maxEntries &&
                                mainEntries.length >= category.maxEntries)
                            ? "Tambah ke cadangan"
                            : "Tambah pasangan"}
                        <Icon name="plus" size={16} />
                      </button>
                    </form>
                  </section>
                )}
                <section className="panel">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="panel-title">Peserta {category.name}</h2>
                    <span className="status-pill">
                      {mainEntries.length}/{category.maxEntries ?? "∞"} slot
                      terisi
                    </span>
                  </div>
                  <p className="text-sm text-secondary mb-4">
                    {queue.length} pasangan cadangan. Slot kosong diisi setelah
                    konfirmasi admin sesuai urutan antrean.
                  </p>
                  {Array.from(
                    {
                      length: Math.max(
                        0,
                        (category.maxEntries ?? 0) - mainEntries.length,
                      ),
                    },
                    (_, i) => (
                      <div
                        key={`empty-${i}`}
                        className="py-3 flex gap-3 items-center border-t border-line text-secondary"
                      >
                        <span className="profile-initial">
                          {mainEntries.length + i + 1}
                        </span>
                        <span>Slot kosong · belum ada pasangan</span>
                      </div>
                    ),
                  )}
                  {entries.length ? (
                    entries.map((e, i) => (
                      <div
                        key={e.id}
                        className="py-4 flex flex-wrap gap-3 items-center border-t border-line"
                      >
                        <span className="profile-initial">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <strong className="text-sm">{e.name}</strong>
                          <p className="text-sm text-secondary">
                            {entryStatusLabel(e, entries)}
                          </p>
                        </div>
                        {!stages.length &&
                          (isMainEntry(e) || e.status === "WAITLISTED") && (
                            <div className="flex flex-wrap gap-2 w-full">
                              {e.status === "WAITLISTED" && (
                                <button
                                  className="btn-secondary"
                                  disabled={
                                    busy ||
                                    queue[0]?.id !== e.id ||
                                    (!!category.maxEntries &&
                                      mainEntries.length >= category.maxEntries)
                                  }
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        `Sudah mengonfirmasi ${e.name}? Masukkan ke daftar utama?`,
                                      )
                                    )
                                      void run(
                                        () =>
                                          apiFetch(`/api/v1/entries/${e.id}`, {
                                            method: "PATCH",
                                            body: JSON.stringify({
                                              status: "CONFIRMED",
                                            }),
                                          }),
                                        "Cadangan masuk daftar utama",
                                      );
                                  }}
                                >
                                  Konfirmasi masuk utama
                                </button>
                              )}
                              <button
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Batalkan keikutsertaan ${e.name}?`,
                                    )
                                  )
                                    void run(
                                      () =>
                                        apiFetch(`/api/v1/entries/${e.id}`, {
                                          method: "PATCH",
                                          body: JSON.stringify({
                                            status: "WITHDRAWN",
                                          }),
                                        }),
                                      "Peserta dibatalkan",
                                    );
                                }}
                              >
                                Batalkan peserta
                              </button>
                              <button
                                className="btn-secondary"
                                disabled={busy}
                                onClick={() => {
                                  if (
                                    window.confirm(`Diskualifikasi ${e.name}?`)
                                  )
                                    void run(
                                      () =>
                                        apiFetch(`/api/v1/entries/${e.id}`, {
                                          method: "PATCH",
                                          body: JSON.stringify({
                                            status: "DISQUALIFIED",
                                          }),
                                        }),
                                      "Peserta didiskualifikasi",
                                    );
                                }}
                              >
                                Diskualifikasi
                              </button>
                            </div>
                          )}
                        {e.seed && (
                          <span className="status-pill">Seed {e.seed}</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="empty-state">
                      <Icon name="users" size={32} />
                      <p>Pasangan yang ditambahkan akan muncul di sini.</p>
                    </div>
                  )}
                </section>
              </div>
              <p id="draw-help" className="action-help">
                {stages.length
                  ? `${mainEntries.length} pasangan utama bermain di bagan ini.`
                  : mainEntries.length < 2
                    ? `Tambahkan ${2 - mainEntries.length} pasangan lagi agar dapat membuat bagan pertandingan.`
                    : `${mainEntries.length} pasangan utama sudah terdaftar. Lanjutkan untuk membuat bagan dan jadwal.`}
              </p>
              <div className="step-actions justify-between">
                <button className="btn-secondary" onClick={() => setStep(0)}>
                  Kembali ke persiapan
                </button>
                <button
                  className="btn-primary"
                  aria-describedby="draw-help"
                  disabled={busy || (mainEntries.length < 2 && !stages.length)}
                  onClick={() => setStep(2)}
                >
                  Lanjut: atur pertandingan
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <details
                className="panel rules-details"
                open={
                  rulesOpen ?? (loadedCategory === selected && !stages.length)
                }
                onToggle={(e) => setRulesOpen(e.currentTarget.open)}
              >
                <summary>
                  <span>
                    <span className="rules-summary-label">Aturan skor</span>
                    <strong>
                      {rules.mode === "POINTS"
                        ? directPointsSummary(rules)
                        : `${rules.name} · ${deuceLabel(rules.deuce)}`}
                    </strong>
                  </span>
                  <span className="rules-summary-action">Ubah</span>
                </summary>
                <div className="space-y-5 mt-5">
                  <p className="text-sm text-secondary">
                    Cara hitung skor terpisah dari sistem turnamen. Sistem gugur
                    dapat memakai game/set maupun poin langsung.
                  </p>
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
                      legend="Jumlah set dan durasi"
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
                  {rules.mode !== "POINTS" && (
                    <OptionCards
                      legend="Jika skor 40–40 (deuce)"
                      name="deuce"
                      value={rules.deuce}
                      options={DEUCE_OPTIONS}
                      onChange={(deuce) =>
                        setRules({ ...rules, deuce: deuce as Rules["deuce"] })
                      }
                      compact
                      disabled={busy}
                    />
                  )}
                  <p className="setting-help">
                    Perubahan berlaku untuk pertandingan yang belum dimulai.
                    Untuk nilai game atau set kustom, buka pengaturan rinci di
                    bawah.
                  </p>
                  <button
                    className="btn-primary"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        apiFetch(`/api/v2/categories/${selected}`, {
                          method: "PATCH",
                          body: JSON.stringify({ rules }),
                        }),
                      )
                    }
                  >
                    {busy ? "Menyimpan…" : "Simpan aturan pertandingan"}
                  </button>
                </div>
              </details>
              <section className="panel space-y-5">
                <div>
                  <h2 className="panel-title">Susun bagan pertandingan</h2>
                  <p className="text-sm text-secondary mt-2">
                    {mainEntries.length} pasangan utama ·{" "}
                    {formatLabel(category.format)}. Undian yang disimpan menjadi
                    bagan pertandingan.
                  </p>
                </div>
                <div className="action-row">
                  <button
                    className="btn-primary"
                    disabled={busy || mainEntries.length < 2}
                    onClick={() => {
                      if (
                        !stages.length ||
                        confirm("Ganti bagan yang belum digunakan?")
                      )
                        void run(
                          () =>
                            apiFetch(`/api/v2/categories/${selected}/draw`, {
                              method: "POST",
                              body: JSON.stringify({
                                mode: entries.some((e) => e.seed)
                                  ? "SEEDED"
                                  : "RANDOM",
                              }),
                            }),
                          "Bagan siap. Selanjutnya atur jadwal.",
                        );
                    }}
                  >
                    <Icon name="trophy" size={18} />
                    {stages.length ? "Undi ulang bagan" : "Buat bagan otomatis"}
                  </button>
                  <Link
                    className="btn-secondary"
                    href={`/admin/competition/${id}`}
                  >
                    Atur bagan secara rinci
                  </Link>
                </div>
                {category.format === "GROUP_KNOCKOUT" && (
                  <div className="space-y-3">
                    <p className="text-secondary">
                      Selesaikan dan sahkan seluruh laga grup, lalu bentuk
                      knockout dari peringkat grup. Jika peringkat masih seri,
                      kelolosan ditahan untuk ditinjau panitia. Jadwalkan laga
                      knockout setelah bagan terbentuk.
                    </p>
                    <button
                      className="btn-primary"
                      disabled={
                        busy ||
                        stages.some((s) => s.type === "SINGLE_ELIMINATION")
                      }
                      onClick={() =>
                        run(
                          () =>
                            apiFetch(`/api/v2/categories/${selected}/qualify`, {
                              method: "POST",
                              body: "{}",
                            }),
                          "Babak knockout dibuat. Atur jadwal laga berikutnya.",
                        )
                      }
                    >
                      {stages.some((s) => s.type === "SINGLE_ELIMINATION")
                        ? "Knockout sudah dibuat"
                        : "Buat knockout dari hasil grup"}
                    </button>
                  </div>
                )}
                {stages.length > 0 && <BracketViewer stages={stages} />}
              </section>
              <section className="panel space-y-4">
                <h2 className="panel-title">Jadwal pertandingan</h2>
                <form
                  className="grid sm:grid-cols-3 gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    const offset =
                      t.timezone === "Asia/Jayapura"
                        ? "+09:00"
                        : t.timezone === "Asia/Makassar"
                          ? "+08:00"
                          : "+07:00";
                    void run(
                      () =>
                        apiFetch(`/api/v1/tournaments/${id}/schedule/auto`, {
                          method: "POST",
                          body: JSON.stringify({
                            startTime: new Date(
                              `${f.get("start")}:00${offset}`,
                            ).toISOString(),
                            matchDurationMinutes: Number(f.get("duration")),
                            minRestMinutes: Number(f.get("rest")),
                          }),
                        }),
                      "Jadwal tersimpan",
                    );
                  }}
                >
                  <label className="field">
                    Mulai ({t.timezone})
                    <input name="start" type="datetime-local" required />
                  </label>
                  <label className="field">
                    Estimasi pertandingan (menit)
                    <input
                      name="duration"
                      type="number"
                      min={10}
                      defaultValue={60}
                    />
                  </label>
                  <label className="field">
                    Istirahat pemain (menit)
                    <input
                      name="rest"
                      type="number"
                      min={0}
                      defaultValue={30}
                    />
                  </label>
                  <button
                    className="btn-primary"
                    aria-describedby="schedule-help"
                    disabled={busy || !t.courts.length || !stages.length}
                  >
                    {busy ? "Menyusun jadwal…" : "Susun jadwal otomatis"}
                  </button>
                </form>
                <p id="schedule-help" className="action-help">
                  {!t.courts.length
                    ? "Tambahkan lapangan di langkah 1 sebelum menyusun jadwal."
                    : !stages.length
                      ? "Buat bagan pertandingan terlebih dahulu sebelum menyusun jadwal."
                      : "Jadwal akan disimpan untuk seluruh kategori turnamen, mengikuti waktu mulai dan jeda istirahat di atas."}
                </p>
              </section>
              <div className="step-actions justify-between">
                <button className="btn-secondary" onClick={() => setStep(1)}>
                  Kembali ke peserta
                </button>
                <button
                  className="btn-primary"
                  disabled={busy || !stages.length}
                  onClick={() => setStep(3)}
                >
                  Lanjut: jalankan acara
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </>
          ) : (
            <>
              <section className="panel">
                <h2 className="panel-title">
                  {t.status === "IN_PROGRESS"
                    ? "Pertandingan sedang berjalan"
                    : t.status === "COMPLETED"
                      ? "Turnamen selesai"
                      : "Jalankan turnamen"}
                </h2>
                <p className="page-intro">
                  {isPublic
                    ? "Tugaskan wasit, catat skor, lalu sahkan hasil. Penonton melihat hasil yang sudah disahkan di halaman publik."
                    : "Turnamen belum terbit. Skor tetap bisa dicatat untuk uji coba, tetapi penonton belum bisa melihat jadwal maupun hasilnya."}
                </p>
                {((lifecycle && !nextStep.status) || isPublic) && (
                  <div className="action-row mt-5">
                    {lifecycle && !nextStep.status && (
                      <button
                        className="btn-secondary"
                        disabled={busy}
                        onClick={() =>
                          changeStatus(lifecycle.next, lifecycle.done)
                        }
                      >
                        {lifecycle.label}
                      </button>
                    )}
                    {isPublic && (
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          navigator.clipboard
                            .writeText(
                              `${location.origin}/tournament/${t.slug}`,
                            )
                            .then(() => setNotice("Tautan publik disalin"))
                            .catch(() => setError("Tautan tidak dapat disalin"))
                        }
                      >
                        Salin tautan publik
                      </button>
                    )}
                  </div>
                )}
              </section>
              <div className="grid lg:grid-cols-2 gap-4">
                {visibleMatches.map((m) => {
                  const ready = !!m.entryA && !!m.entryB;
                  const done = approved(m);
                  const snap = m.scoreSnapshot;
                  const score = snap
                    ? snap.gamesA.length
                      ? `${snap.setsA}–${snap.setsB}`
                      : `${snap.pointsA}–${snap.pointsB}`
                    : "";
                  const winner =
                    m.winnerId === m.entryA?.id
                      ? m.entryA
                      : m.winnerId === m.entryB?.id
                        ? m.entryB
                        : undefined;
                  return (
                    <section className="panel space-y-4" key={m.id}>
                      <div className="flex justify-between gap-3">
                        <span className="text-xs text-secondary">
                          Pertandingan {m.matchNumber} · Babak {m.round}
                        </span>
                        <span
                          className={
                            m.status === "IN_PROGRESS"
                              ? "status-live"
                              : "status-pill"
                          }
                        >
                          {matchStatusLabel(m.status, m.approvalStatus)}
                        </span>
                      </div>
                      <div className="text-base font-bold space-y-2">
                        <p>{m.entryA?.name ?? "Menunggu hasil sebelumnya"}</p>
                        <p className="text-xs text-secondary font-normal">
                          melawan
                        </p>
                        <p>{m.entryB?.name ?? "Menunggu hasil sebelumnya"}</p>
                      </div>
                      <p className="text-xs text-secondary">
                        {m.court?.name ?? "Lapangan belum diatur"} ·{" "}
                        {m.scheduledAt
                          ? new Date(m.scheduledAt).toLocaleString("id-ID", {
                              timeZone: t.timezone,
                              dateStyle: "short",
                              timeStyle: "short",
                            })
                          : "Jadwal belum diatur"}
                      </p>
                      {(done || m.status === "FINISHED") && winner && (
                        <p className="match-result" role="status">
                          <span>
                            {done ? "Pemenang" : "Pemenang (belum disahkan)"}
                          </span>
                          <strong>{winner.name}</strong>
                          {score && (
                            <span className="tabular-nums">{score}</span>
                          )}
                        </p>
                      )}
                      {!ready ? (
                        <p className="text-sm text-secondary">
                          Pasangan terisi setelah hasil laga sebelumnya
                          disahkan.
                        </p>
                      ) : (
                        <>
                          {!done && (
                            <label className="field text-xs">
                              Tugaskan wasit
                              <select
                                value={m.officials?.[0]?.userId ?? ""}
                                disabled={busy}
                                onChange={(e) => {
                                  if (e.target.value)
                                    void run(
                                      () =>
                                        apiFetch(
                                          `/api/v2/matches/${m.id}/officials`,
                                          {
                                            method: "POST",
                                            body: JSON.stringify({
                                              userId: e.target.value,
                                            }),
                                          },
                                        ),
                                      "Wasit ditugaskan",
                                    );
                                }}
                              >
                                <option value="">Pilih nama wasit</option>
                                {staff.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.fullName}
                                  </option>
                                ))}
                              </select>
                            </label>
                          )}
                          <div className="action-row">
                            {m.status === "FINISHED" && !done && (
                              <button
                                className="btn-kinetic text-xs"
                                disabled={busy}
                                onClick={() =>
                                  run(
                                    () =>
                                      apiFetch(
                                        m.engineVersion === 2
                                          ? `/api/v2/matches/${m.id}/approve`
                                          : `/api/v1/matches/${m.id}/approve-result`,
                                        { method: "POST", body: "{}" },
                                      ),
                                    "Hasil disahkan",
                                  )
                                }
                              >
                                Sahkan hasil
                              </button>
                            )}
                            {!done && (
                              <Link
                                className={
                                  m.status === "FINISHED"
                                    ? "btn-secondary text-xs"
                                    : "btn-primary text-xs"
                                }
                                href={
                                  m.engineVersion === 1 &&
                                  m.status !== "SCHEDULED"
                                    ? `/referee/scoring/${m.id}`
                                    : `/referee/v2/${m.id}`
                                }
                              >
                                {m.status === "FINISHED"
                                  ? "Periksa skor"
                                  : m.status === "SCHEDULED"
                                    ? "Catat skor pertandingan"
                                    : "Lanjutkan pencatatan skor"}
                              </Link>
                            )}
                            {isPublic && (
                              <Link
                                className="btn-secondary text-xs"
                                href={done ? `/match/${m.id}` : `/tv/${m.id}`}
                              >
                                {done ? "Lihat hasil publik" : "Buka layar TV"}
                              </Link>
                            )}
                            {done && (
                              <a
                                className="btn-secondary text-xs"
                                href={`/api/v2/matches/${m.id}/result.pdf`}
                              >
                                Unduh PDF hasil
                              </a>
                            )}
                          </div>
                        </>
                      )}
                    </section>
                  );
                })}
              </div>
              {!visibleMatches.length && (
                <div className="panel empty-state">
                  <p>Bagan pertandingan belum dibuat.</p>
                  <button className="btn-primary" onClick={() => setStep(2)}>
                    Atur pertandingan
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
      <Link
        className="btn-secondary"
        href={`/admin/tournaments/${id}/community`}
      >
        Header, sponsor & sanggahan
      </Link>
      <details className="text-sm">
        <summary className="cursor-pointer text-secondary">
          Pengaturan lanjutan acara
        </summary>
        <div className="action-row mt-3">
          <Link className="btn-secondary" href={`/admin/competition/${id}`}>
            Aturan per fase, klasemen & dokumen
          </Link>
          <Link className="btn-secondary" href="/admin/organization">
            Kelola tim & venue
          </Link>
        </div>
      </details>
    </div>
  );
}
