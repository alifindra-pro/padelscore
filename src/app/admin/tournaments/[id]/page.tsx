"use client";
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
  entryA?: { name: string };
  entryB?: { name: string };
  court?: { name: string };
  status: string;
  approvalStatus: string;
  engineVersion: number;
  scheduledAt?: string;
  stage: { categoryId: string; category: { name: string } };
}
const statusLabels: Record<string, string> = {
  DRAFT: "Draf",
  REGISTRATION: "Persiapan peserta",
  PUBLISHED: "Dipublikasikan",
  IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Arsip",
};
const formats: Record<string, string> = {
  SINGLE_ELIMINATION: "Sistem gugur",
  ROUND_ROBIN: "Semua saling bertemu",
  GROUP_KNOCKOUT: "Grup + sistem gugur",
  DOUBLE_ELIMINATION: "Dua kali kalah gugur",
};
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
  async function advanceStatus() {
    if (!t) return;
    const next =
      t.status === "DRAFT"
        ? "REGISTRATION"
        : t.status === "REGISTRATION"
          ? "PUBLISHED"
          : t.status === "PUBLISHED"
            ? "IN_PROGRESS"
            : "COMPLETED";
    await run(
      () =>
        apiFetch(`/api/v1/tournaments/${id}/status`, {
          method: "POST",
          body: JSON.stringify({ status: next }),
        }),
      `Acara: ${statusLabels[next]}`,
    );
  }
  if (!t)
    return (
      <div className="panel empty-state">
        {error || "Menyiapkan ruang turnamen…"}
      </div>
    );
  const visibleMatches = matches.filter((m) => m.stage.categoryId === selected);
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
              {statusLabels[t.status]}
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
                    {formats[c.format] ?? c.format}
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
                  Admin bisa mengisi slot di bawah. Buka pendaftaran publik agar
                  peserta juga bisa mendaftarkan pasangan sendiri.
                </p>
                <div className="action-row">
                  {["DRAFT", "PUBLISHED", "REGISTRATION"].includes(t.status) &&
                    !stages.length && (
                      <button
                        className="btn-primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              apiFetch(`/api/v1/tournaments/${id}/status`, {
                                method: "POST",
                                body: JSON.stringify({
                                  status:
                                    t.status === "REGISTRATION"
                                      ? "PUBLISHED"
                                      : "REGISTRATION",
                                }),
                              }),
                            t.status === "REGISTRATION"
                              ? "Pendaftaran ditutup. Bagan siap dibuat setelah peserta lengkap."
                              : "Pendaftaran publik dibuka.",
                          )
                        }
                      >
                        {t.status === "REGISTRATION"
                          ? "Tutup pendaftaran"
                          : "Buka pendaftaran publik"}
                      </button>
                    )}
                  {["REGISTRATION", "PUBLISHED"].includes(t.status) && (
                    <Link
                      className="btn-secondary"
                      href={`/tournament/${t.slug}#registration`}
                      target="_blank"
                    >
                      Buka halaman pendaftaran ↗
                    </Link>
                  )}
                </div>
              </section>
              <div className="grid xl:grid-cols-[1fr_1.2fr] gap-5">
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
                    <button
                      className="btn-primary w-full"
                      disabled={busy || !!stages.length}
                    >
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
                    konfirmasi admin sesuai urutan antrean.{" "}
                    {stages.length > 0
                      ? "Bagan sudah dibuat; perubahan peserta dikunci."
                      : ""}
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
                {mainEntries.length < 2
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
                  disabled={busy || mainEntries.length < 2}
                  onClick={() => setStep(2)}
                >
                  Lanjut: atur pertandingan
                  <Icon name="arrow" size={18} />
                </button>
              </div>
            </>
          ) : step === 2 ? (
            <>
              <section className="panel space-y-5">
                <div>
                  <h2 className="panel-title">Pilih aturan skor</h2>
                  <p className="text-sm text-secondary mt-2">
                    Pilih cara hitung skor secara terpisah dari sistem turnamen.
                    Sistem gugur dapat memakai game/set maupun poin langsung.
                  </p>
                </div>
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
                  Perubahan berlaku untuk pertandingan yang belum dimulai. Untuk
                  nilai game atau set kustom, buka pengaturan rinci di bawah.
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
              </section>
              <section className="panel space-y-5">
                <div>
                  <h2 className="panel-title">Susun bagan pertandingan</h2>
                  <p className="text-sm text-secondary mt-2">
                    {mainEntries.length} pasangan utama · {formats[category.format]}.
                    Undian yang disimpan menjadi bagan pertandingan.
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
                    : "Jalankan turnamen"}
                </h2>
                <p className="page-intro">
                  Tugaskan wasit, buka pencatatan skor, lalu sahkan hasil.
                  Penonton dapat melihat hasil di halaman publik.
                </p>
                <div className="action-row mt-5">
                  {!["COMPLETED", "ARCHIVED"].includes(t.status) && (
                    <button
                      className={
                        t.status === "IN_PROGRESS"
                          ? "btn-secondary"
                          : "btn-kinetic"
                      }
                      disabled={busy}
                      onClick={advanceStatus}
                    >
                      {t.status === "DRAFT"
                        ? "Buka pendaftaran publik"
                        : t.status === "REGISTRATION"
                          ? "Tutup pendaftaran & lanjutkan"
                          : t.status === "PUBLISHED"
                            ? "Mulai turnamen"
                            : "Selesaikan turnamen"}
                    </button>
                  )}
                  {["PUBLISHED", "IN_PROGRESS", "COMPLETED"].includes(
                    t.status,
                  ) && (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(`${location.origin}/tournament/${t.slug}`)
                          .then(() => setNotice("Tautan publik disalin"))
                          .catch(() => setError("Tautan tidak dapat disalin"))
                      }
                    >
                      Salin tautan publik
                    </button>
                  )}
                </div>
              </section>
              <div className="grid lg:grid-cols-2 gap-4">
                {visibleMatches.map((m) => (
                  <section className="panel space-y-4" key={m.id}>
                    <div className="flex justify-between gap-3">
                      <span className="text-xs text-secondary">
                        PERTANDINGAN {m.matchNumber} · BABAK {m.round}
                      </span>
                      <span
                        className={
                          m.status === "IN_PROGRESS"
                            ? "status-live"
                            : "status-pill"
                        }
                      >
                        {m.approvalStatus === "APPROVED"
                          ? "Disahkan"
                          : m.status === "SCHEDULED"
                            ? "Terjadwal"
                            : m.status}
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
                    <label className="field text-xs">
                      Tugaskan wasit
                      <select
                        defaultValue=""
                        disabled={busy}
                        onChange={(e) => {
                          if (e.target.value)
                            void run(
                              () =>
                                apiFetch(`/api/v2/matches/${m.id}/officials`, {
                                  method: "POST",
                                  body: JSON.stringify({
                                    userId: e.target.value,
                                  }),
                                }),
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
                    <div className="action-row">
                      <Link
                        className="btn-primary text-xs"
                        href={
                          m.engineVersion === 1 && m.status !== "SCHEDULED"
                            ? `/referee/scoring/${m.id}`
                            : `/referee/v2/${m.id}`
                        }
                      >
                        Catat skor pertandingan
                      </Link>
                      {[
                        "PUBLISHED",
                        "IN_PROGRESS",
                        "COMPLETED",
                        "ARCHIVED",
                      ].includes(t.status) && (
                        <Link
                          className="btn-secondary text-xs"
                          href={`/tv/${m.id}`}
                        >
                          Buka layar TV
                        </Link>
                      )}
                      {(m.approvalStatus === "APPROVED" ||
                        m.status === "APPROVED") &&
                        m.entryA &&
                        m.entryB && (
                          <a
                            className="btn-secondary text-xs"
                            href={`/api/v2/matches/${m.id}/result.pdf`}
                          >
                            Unduh PDF hasil
                          </a>
                        )}
                      {m.status === "FINISHED" &&
                        m.approvalStatus !== "APPROVED" && (
                          <button
                            className="btn-kinetic text-xs"
                            disabled={busy}
                            onClick={() =>
                              run(() =>
                                apiFetch(
                                  m.engineVersion === 2
                                    ? `/api/v2/matches/${m.id}/approve`
                                    : `/api/v1/matches/${m.id}/approve-result`,
                                  { method: "POST", body: "{}" },
                                ),
                              )
                            }
                          >
                            Sahkan hasil
                          </button>
                        )}
                    </div>
                  </section>
                ))}
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
