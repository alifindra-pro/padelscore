"use client";
import { useCallback, use, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import { BracketViewer } from "@/components/BracketViewer";
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
  const [rules, setRules] = useState<Rules>(PRESETS.STANDARD);
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
    // State changes in load occur only after awaited API responses.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch((e) => setError(e.message));
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
    <div className="space-y-6">
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
          <p className="page-eyebrow">TOURNAMENT CONTROL</p>
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
            aria-current={step === i ? "step" : undefined}
            onClick={() => {
              setStep(i);
              setError("");
            }}
          >
            <span className="step-number">{i + 1}</span>
            {label}
          </button>
        ))}
      </nav>
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
                <label className="field">
                  Cara menentukan lawan
                  <select name="format">
                    {Object.entries(formats).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
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
                        const ids: string[] = [];
                        const names: string[] = [];
                        for (const key of ["one", "two"]) {
                          if (addExisting) {
                            const pid = String(f.get(key));
                            ids.push(pid);
                            names.push(
                              players.find((p) => p.id === pid)?.fullName ?? "",
                            );
                          } else {
                            const p = await apiFetch<Player>(
                              "/api/v1/players",
                              {
                                method: "POST",
                                body: JSON.stringify({
                                  fullName: f.get(key),
                                  organizationId: t.organizationId,
                                }),
                              },
                            );
                            ids.push(p.id);
                            names.push(p.fullName);
                          }
                        }
                        await apiFetch(
                          `/api/v1/categories/${selected}/entries`,
                          {
                            method: "POST",
                            body: JSON.stringify({
                              name: names.join(" / "),
                              playerIds: ids,
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
                      {busy ? "Menambahkan…" : "Tambah pasangan"}
                      <Icon name="plus" size={16} />
                    </button>
                  </form>
                </section>
                <section className="panel">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="panel-title">Peserta {category.name}</h2>
                    <span className="status-pill">
                      {entries.length} pasangan
                    </span>
                  </div>
                  {entries.length ? (
                    entries.map((e, i) => (
                      <div
                        key={e.id}
                        className="py-4 flex gap-3 items-center border-t border-line"
                      >
                        <span className="profile-initial">{i + 1}</span>
                        <strong className="text-sm flex-1">{e.name}</strong>
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
                {entries.length < 2
                  ? `Tambahkan ${2 - entries.length} pasangan lagi agar dapat membuat bagan pertandingan.`
                  : `${entries.length} pasangan sudah terdaftar. Lanjutkan untuk membuat bagan dan jadwal.`}
              </p>
              <div className="step-actions justify-between">
                <button className="btn-secondary" onClick={() => setStep(0)}>
                  Kembali ke persiapan
                </button>
                <button
                  className="btn-primary"
                  aria-describedby="draw-help"
                  disabled={busy || entries.length < 2}
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
                    Skor tenis: 0–15–30–40, lalu game dan set. Pilih jumlah set
                    dan cara menentukan pemenang saat 40–40.
                  </p>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="field">
                    Jumlah set dan durasi
                    <select
                      value={
                        Object.keys(PRESETS).find(
                          (k) => PRESETS[k].name === rules.name,
                        ) ?? "CUSTOM"
                      }
                      onChange={(e) => setRules({ ...PRESETS[e.target.value] })}
                    >
                      {Object.entries(PRESETS).map(([key, p]) => (
                        <option value={key} key={key}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Jika skor 40–40 (deuce)
                    <select
                      value={rules.deuce}
                      onChange={(e) =>
                        setRules({
                          ...rules,
                          deuce: e.target.value as Rules["deuce"],
                        })
                      }
                    >
                      <option value="ADVANTAGE">
                        Harus unggul dua poin (Advantage)
                      </option>
                      <option value="GOLDEN_POINT">
                        Satu poin penentu (Golden Point)
                      </option>
                      <option value="STAR_POINT">
                        Dua kali advantage, lalu poin penentu (Star Point)
                      </option>
                    </select>
                  </label>
                </div>
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
                    {entries.length} pasangan · {formats[category.format]}.
                    Undian yang disimpan menjadi bagan pertandingan.
                  </p>
                </div>
                <div className="action-row">
                  <button
                    className="btn-primary"
                    disabled={busy || entries.length < 2}
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
                                groups: Math.max(
                                  1,
                                  Math.min(2, Math.floor(entries.length / 2)),
                                ),
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
                        ? "Buka persiapan peserta"
                        : t.status === "REGISTRATION"
                          ? "Publikasikan acara"
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
