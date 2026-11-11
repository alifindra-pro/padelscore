"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { Icon } from "@/components/ui/Icon";
import {
  OptionCards,
  SCORING_OPTIONS,
  DirectPointsSettings,
  SocialSettings,
  FORMAT_OPTIONS,
  PRESET_OPTIONS,
  DEUCE_OPTIONS,
} from "@/components/admin/TournamentChoices";
import type { SocialConfig } from "../../../../../packages/core/src";

function NewTournament() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef("");
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [data, setData] = useState({
    name: "",
    location: "",
    start: "",
    timezone: "Asia/Jakarta",
    category: "Ganda terbuka",
    courts: 1,
    preset: "SINGLE",
    totalPoints: 24,
    pointsFormat: "TOTAL" as "TOTAL" | "TARGET",
    pointsWinBy: 1 as 1 | 2,
    pointsSetsToWin: 1,
    format: ["AMERICANO", "MEXICANO"].includes(searchParams.get("format") || "")
      ? searchParams.get("format")!
      : "SINGLE_ELIMINATION",
    deuce: "ADVANTAGE",
    duration: 60,
    rest: 30,
    slotCount: 8,
    groups: 2,
    advancePerGroup: 2,
  });
  const [social, setSocial] = useState<
    Pick<SocialConfig, "target" | "rounds" | "ranking" | "pairing">
  >({ target: 32, rounds: 7, ranking: "TOTAL", pairing: "BALANCED" });
  const [savedPlayers, setSavedPlayers] = useState<
    { id: string; fullName: string }[]
  >([]);
  const [selectedPlayers, setSelectedPlayers] = useState<
    Record<string, string>
  >({});
  const [chosenA, setChosenA] = useState("");
  const [chosenB, setChosenB] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      apiFetch<{ items: typeof savedPlayers }>("/api/v1/players", {
        params: { search: playerSearch, limit: 100 },
      })
        .then((r) => {
          if (active) setSavedPlayers(r.items);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [playerSearch]);
  const [registrationLater, setRegistrationLater] = useState(true);
  const [pairText, setPairText] = useState("");
  const [playerText, setPlayerText] = useState("");
  const isSocial = ["AMERICANO", "MEXICANO"].includes(data.format);
  const directPoints = data.preset === "POINTS";
  const scoreDescription = directPoints
    ? `Poin langsung · ${data.pointsFormat === "TARGET" ? "target" : "total bersama"} ${data.totalPoints} poin/set · menang ${data.pointsSetsToWin} set`
    : PRESET_OPTIONS.find((option) => option.value === data.preset)!.label;
  const players = playerText
    .split("\n")
    .map((name) => name.trim())
    .filter(Boolean);
  const pairs = pairText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split("/").map((name) => name.trim()));
  const format = FORMAT_OPTIONS.find((option) => option.value === data.format)!;
  const steps = [
    "Acara & aturan",
    isSocial ? "Pemain peserta" : "Slot peserta",
    "Periksa & buat",
  ];
  const count = isSocial ? players.length : pairs.length;
  const names = isSocial ? players : pairs.flat();
  function checkParticipants() {
    if (!isSocial && registrationLater) {
      if (
        !Number.isInteger(data.slotCount) ||
        data.slotCount < 2 ||
        data.slotCount > 64
      )
        throw Error("Pilih 2 sampai 64 slot pasangan.");
      if (
        data.format === "GROUP_KNOCKOUT" &&
        (data.slotCount < data.groups * 2 ||
          data.advancePerGroup > Math.floor(data.slotCount / data.groups) ||
          data.groups * data.advancePerGroup < 2)
      )
        throw Error(
          "Jumlah slot belum cukup untuk jumlah grup dan kuota lolos ini.",
        );
      return;
    }

    if (isSocial) {
      if (players.length < 4 || players.length > 128)
        throw Error("Masukkan 4 sampai 128 pemain, satu nama per baris.");
    } else {
      if (pairs.length < 2 || pairs.length > 64)
        throw Error("Masukkan 2 sampai 64 pasangan.");
      if (
        data.format === "GROUP_KNOCKOUT" &&
        (pairs.length < data.groups * 2 ||
          data.advancePerGroup > Math.floor(pairs.length / data.groups) ||
          data.groups * data.advancePerGroup < 2)
      )
        throw Error(
          "Periksa jumlah grup dan kuota lolos. Setiap grup minimal dua pasangan; knockout minimal dua pasangan.",
        );
      if (pairs.some((pair) => pair.length !== 2))
        throw Error(
          "Gunakan satu pasangan per baris: Nama pemain 1 / Nama pemain 2.",
        );
    }
    if (names.some((name) => name.length < 2 || name.length > 100))
      throw Error("Nama setiap pemain harus 2 sampai 100 karakter.");
    if (
      new Set(names.map((name) => name.toLocaleLowerCase("id"))).size !==
      names.length
    )
      throw Error(
        "Ada nama pemain berulang. Gunakan nama lengkap yang berbeda.",
      );
  }
  function goTo(next: number) {
    setStep(next);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView({ block: "start" });
    });
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    try {
      checkParticipants();
      setBusy(true);
      const key = requestId.current || crypto.randomUUID();
      requestId.current = key;
      const offset =
        data.timezone === "Asia/Jayapura"
          ? "+09:00"
          : data.timezone === "Asia/Makassar"
            ? "+08:00"
            : "+07:00";
      const result = await apiFetch<{ id: string; kind?: string }>(
        "/api/v2/tournaments/setup",
        {
          method: "POST",
          body: JSON.stringify({
            ...data,
            start: new Date(`${data.start}:00${offset}`).toISOString(),
            ...(isSocial
              ? { players, ...social }
              : {
                  registrationLater,
                  slotCount: registrationLater
                    ? data.slotCount
                    : Math.max(data.slotCount, pairs.length),
                  pairs: registrationLater ? [] : pairs,
                  playerIds: (registrationLater ? [] : pairs).map((pair) =>
                    pair.map((name) => selectedPlayers[name] ?? null),
                  ),
                }),
            requestId: key,
          }),
        },
      );
      router.push(
        result.kind === "SOCIAL"
          ? `/admin/social?id=${result.id}`
          : `/admin/tournaments/${result.id}?step=${registrationLater ? 1 : 3}`,
      );
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      submitting.current = false;
    }
  }
  return (
    <div className="tournament-setup space-y-6">
      <Link className="section-link" href="/admin/tournaments">
        ← Daftar turnamen
      </Link>
      <header className="setup-header">
        <div>
          <p className="setup-eyebrow">TURNAMEN BARU</p>
          <h1>
            Atur acaranya.
            <br />
            Siapkan pertandingannya.
          </h1>
          <p>
            Pilih sistem bermain dan siapkan slot. Peserta bisa didaftarkan
            setelah turnamen dibuat.
          </p>
        </div>
        <div className="setup-header-note">
          <Icon name="court" size={44} />
          <span>
            Pasangan tetap
            <br />
            <b>atau rotasi pemain.</b>
          </span>
        </div>
      </header>
      <ol className="setup-steps" aria-label="Langkah pembuatan turnamen">
        {steps.map((label, index) => (
          <li
            key={index}
            aria-current={step === index ? "step" : undefined}
            data-complete={step > index}
          >
            <span>
              {step > index ? <Icon name="check" size={17} /> : index + 1}
            </span>
            <div>
              <strong>{label}</strong>
              <small>
                {
                  [
                    "Pilih cara bermain",
                    "Daftarkan nama pemain",
                    "Simpan sebagai draf",
                  ][index]
                }
              </small>
            </div>
          </li>
        ))}
      </ol>
      <div className="setup-layout">
        <form
          className="setup-form"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            if (step === 2) {
              void submit();
              return;
            }
            try {
              if (step === 1) checkParticipants();
              goTo(step + 1);
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <div className="setup-form-heading">
            <span>LANGKAH {step + 1} / 3</span>
            <h2 ref={heading} tabIndex={-1}>
              {
                [
                  "Acara & aturan main",
                  isSocial
                    ? "Siapa saja yang bermain?"
                    : "Siapa saja pasangannya?",
                  "Sudah sesuai?",
                ][step]
              }
            </h2>
            <p>
              {
                [
                  "Atur informasi dasar dan pilih cara pertandingan dijalankan.",
                  isSocial
                    ? "Masukkan pemain satu per satu. Sistem menyusun pasangan di setiap ronde."
                    : "Masukkan dua nama dalam satu baris untuk setiap pasangan.",
                  "Periksa ringkasan ini sebelum membuat acara.",
                ][step]
              }
            </p>
          </div>
          {error && (
            <p className="account-error" role="alert">
              {error}
            </p>
          )}
          <fieldset disabled={busy} className="setup-fields">
            {step === 0 ? (
              <>
                <section className="setup-section">
                  <div className="setting-section-heading">
                    <span className="setting-section-icon">
                      <Icon name="calendar" />
                    </span>
                    <div>
                      <h3>Informasi acara</h3>
                      <p>
                        Nama dan waktu ini membantu peserta mengenali acara
                        Anda.
                      </p>
                    </div>
                  </div>
                  <label className="field">
                    Nama turnamen
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      placeholder="Contoh: Padel Minggu Pagi"
                      value={data.name}
                      onChange={(e) =>
                        setData({ ...data, name: e.target.value })
                      }
                    />
                  </label>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="field">
                      Mulai pertandingan
                      <input
                        type="datetime-local"
                        required
                        value={data.start}
                        onChange={(e) =>
                          setData({ ...data, start: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      Lokasi
                      <input
                        maxLength={200}
                        placeholder="Nama venue atau klub"
                        value={data.location}
                        onChange={(e) =>
                          setData({ ...data, location: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <label className="field">
                      Jumlah lapangan
                      <input
                        type="number"
                        min={1}
                        max={16}
                        required
                        value={data.courts || ""}
                        onChange={(e) =>
                          setData({ ...data, courts: Number(e.target.value) })
                        }
                      />
                    </label>
                    <div className="setting-field-note">
                      <Icon name="court" />
                      <p>
                        {isSocial
                          ? "Empat pemain bermain di satu lapangan. Sisanya mendapat giliran di ronde berikutnya."
                          : "Jadwal otomatis membagi laga ke lapangan yang tersedia."}
                      </p>
                    </div>
                  </div>
                </section>
                <section className="setup-section">
                  <OptionCards
                    legend="Sistem pertandingan"
                    help="Pilih pasangan tetap atau permainan dengan rotasi pasangan."
                    name="format"
                    value={data.format}
                    options={FORMAT_OPTIONS}
                    onChange={(format) => setData({ ...data, format })}
                  />
                  {data.format === "GROUP_KNOCKOUT" && (
                    <div className="grid sm:grid-cols-2 gap-4 mt-5">
                      <label className="field">
                        Jumlah grup
                        <input
                          type="number"
                          min={1}
                          max={16}
                          value={data.groups}
                          onChange={(e) =>
                            setData({ ...data, groups: Number(e.target.value) })
                          }
                          required
                        />
                      </label>
                      <label className="field">
                        Lolos per grup
                        <input
                          type="number"
                          min={1}
                          max={4}
                          value={data.advancePerGroup}
                          onChange={(e) =>
                            setData({
                              ...data,
                              advancePerGroup: Number(e.target.value),
                            })
                          }
                          required
                        />
                      </label>
                      <p className="text-secondary sm:col-span-2">
                        Pasangan dibagi merata secara acak.{" "}
                        {data.advancePerGroup} terbaik tiap grup lolos ke
                        knockout setelah seluruh hasil grup disahkan. Babak
                        knockout dibuat melalui kelola turnamen.
                      </p>
                    </div>
                  )}
                </section>
                <section className="setup-section">
                  {isSocial ? (
                    <SocialSettings
                      format={data.format}
                      value={social}
                      onChange={setSocial}
                    />
                  ) : (
                    <>
                      <OptionCards
                        legend="Cara hitung skor"
                        name="scoringMode"
                        value={directPoints ? "POINTS" : "SETS"}
                        options={SCORING_OPTIONS}
                        onChange={(mode) =>
                          setData({
                            ...data,
                            preset: mode === "POINTS" ? "POINTS" : "SINGLE",
                          })
                        }
                        compact
                      />
                      {directPoints ? (
                        <DirectPointsSettings
                          options={{
                            pointsFormat: data.pointsFormat,
                            pointsWinBy: data.pointsWinBy,
                            setsToWin: data.pointsSetsToWin,
                          }}
                          onOptionsChange={(options) =>
                            setData({
                              ...data,
                              pointsFormat: options.pointsFormat ?? "TOTAL",
                              pointsWinBy: options.pointsWinBy ?? 1,
                              pointsSetsToWin: options.setsToWin,
                            })
                          }
                          value={data.totalPoints}
                          onChange={(totalPoints) =>
                            setData({ ...data, totalPoints })
                          }
                        />
                      ) : (
                        <>
                          <OptionCards
                            legend="Format skor"
                            help="Tentukan jumlah set yang harus dimenangkan oleh satu pasangan."
                            name="preset"
                            value={data.preset}
                            options={PRESET_OPTIONS.slice(0, 3)}
                            onChange={(preset) => setData({ ...data, preset })}
                            compact
                          />
                          <OptionCards
                            legend="Jika skor 40–40 (deuce)"
                            name="deuce"
                            value={data.deuce}
                            options={DEUCE_OPTIONS}
                            onChange={(deuce) => setData({ ...data, deuce })}
                            compact
                          />
                        </>
                      )}
                    </>
                  )}
                </section>
                <details className="setup-details">
                  <summary>
                    <Icon name="settings" size={18} />
                    <span>
                      Aturan dan pengaturan lainnya
                      <small>
                        Zona waktu
                        {!isSocial && ", kategori, durasi & istirahat"}
                      </small>
                    </span>
                    <Icon name="plus" size={18} />
                  </summary>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="field">
                      <label htmlFor="setup-timezone">Zona waktu</label>
                      <select
                        id="setup-timezone"
                        value={data.timezone}
                        onChange={(e) =>
                          setData({ ...data, timezone: e.target.value })
                        }
                      >
                        <option value="Asia/Jakarta">WIB</option>
                        <option value="Asia/Makassar">WITA</option>
                        <option value="Asia/Jayapura">WIT</option>
                      </select>
                    </div>
                    {!isSocial && (
                      <>
                        <label className="field">
                          Nama kategori
                          <input
                            minLength={2}
                            maxLength={100}
                            required
                            value={data.category}
                            onChange={(e) =>
                              setData({ ...data, category: e.target.value })
                            }
                          />
                        </label>
                        <label className="field">
                          Durasi perkiraan setiap laga (menit)
                          <input
                            type="number"
                            min={15}
                            max={180}
                            required
                            value={data.duration || ""}
                            onChange={(e) =>
                              setData({
                                ...data,
                                duration: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="field">
                          Jeda istirahat (menit)
                          <input
                            type="number"
                            min={0}
                            max={180}
                            required
                            value={data.rest}
                            onChange={(e) =>
                              setData({ ...data, rest: Number(e.target.value) })
                            }
                          />
                        </label>
                        <p className="setting-help sm:col-span-2">
                          Durasi dipakai untuk menyusun jadwal, bukan batas
                          waktu pertandingan.
                        </p>
                      </>
                    )}
                  </div>
                </details>
              </>
            ) : step === 1 ? (
              <section className="setup-section">
                {!isSocial && (
                  <div className="space-y-4 mb-5">
                    <label className="field">
                      Jumlah slot pasangan
                      <input
                        type="number"
                        min={2}
                        max={64}
                        value={data.slotCount}
                        required
                        onChange={(e) =>
                          setData({
                            ...data,
                            slotCount: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <p className="setting-help">
                      Satu slot untuk dua pemain. Simpan turnamen dahulu, lalu
                      daftarkan pasangan dari halaman turnamen. Tidak perlu
                      mengisi nama sekarang.
                    </p>
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!registrationLater}
                        onChange={(e) =>
                          setRegistrationLater(!e.target.checked)
                        }
                      />
                      Isi nama peserta sekarang (opsional)
                    </label>
                  </div>
                )}
                {(!registrationLater || isSocial) && (
                  <>
                    <div className="participant-counter">
                      <Icon name="users" />
                      <strong>{count}</strong>
                      <span>{isSocial ? "pemain" : "pasangan"} terisi</span>
                    </div>
                    {!isSocial && (
                      <div className="space-y-3 mb-4">
                        <label className="field">
                          Cari pemain tersimpan
                          <input
                            value={playerSearch}
                            onChange={(e) => {
                              setPlayerSearch(e.target.value);
                              setChosenA("");
                              setChosenB("");
                            }}
                            placeholder="Nama pemain"
                          />
                        </label>
                        <div className="grid sm:grid-cols-2 gap-3">
                          {[
                            {
                              label: "Pemain pertama",
                              value: chosenA,
                              set: setChosenA,
                            },
                            {
                              label: "Pemain kedua",
                              value: chosenB,
                              set: setChosenB,
                            },
                          ].map((field) => (
                            <label className="field" key={field.label}>
                              {field.label}
                              <select
                                aria-label={field.label}
                                value={field.value}
                                onChange={(e) => field.set(e.target.value)}
                              >
                                <option value="">Pilih pemain</option>
                                {savedPlayers.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.fullName} · {p.id.slice(0, 6)}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ))}
                        </div>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={!chosenA || !chosenB || chosenA === chosenB}
                          onClick={() => {
                            const a = savedPlayers.find(
                              (p) => p.id === chosenA,
                            )!;
                            const b = savedPlayers.find(
                              (p) => p.id === chosenB,
                            )!;
                            setPairText((t) =>
                              [t.trim(), `${a.fullName} / ${b.fullName}`]
                                .filter(Boolean)
                                .join("\n"),
                            );
                            setSelectedPlayers((v) => ({
                              ...v,
                              [a.fullName]: a.id,
                              [b.fullName]: b.id,
                            }));
                            setChosenA("");
                            setChosenB("");
                          }}
                        >
                          Tambahkan pasangan dari pemain
                        </button>
                        <Link
                          href="/admin/players"
                          target="_blank"
                          className="block text-primary"
                        >
                          Kelola nama dan foto pemain ↗
                        </Link>
                        <p className="setting-help">
                          Foto dan riwayat mengikuti pemain, meskipun
                          pasangannya berubah. Nama baru yang diketik di bawah
                          disimpan ke direktori setelah turnamen dibuat.
                        </p>
                      </div>
                    )}
                    <div className="field">
                      <label htmlFor="setup-participants">
                        {isSocial
                          ? "Satu pemain per baris"
                          : "Satu pasangan per baris"}
                      </label>
                      <textarea
                        id="setup-participants"
                        name="participants"
                        rows={9}
                        required
                        value={isSocial ? playerText : pairText}
                        onChange={(e) =>
                          isSocial
                            ? setPlayerText(e.target.value)
                            : setPairText(e.target.value)
                        }
                        placeholder={
                          isSocial
                            ? "Andi Pratama\nBudi Santoso\nCitra Dewi\nDeni Putra"
                            : "Andi Pratama / Budi Santoso\nCitra Dewi / Deni Putra"
                        }
                        aria-describedby="participant-help"
                      />
                    </div>
                    <p id="participant-help" className="setting-help">
                      {isSocial
                        ? "Minimal 4 pemain. Pasangan disusun otomatis, jadi cukup tulis nama individu."
                        : "Minimal 2 pasangan. Pisahkan dua nama dengan tanda /."}{" "}
                      Gunakan nama yang berbeda untuk setiap pemain. Nama di
                      kolom hanya contoh.
                    </p>
                    {isSocial && players.length >= 4 && (
                      <div className="setup-callout">
                        <Icon name="court" />
                        <p>
                          <strong>
                            {Math.min(
                              data.courts,
                              Math.floor(players.length / 4),
                            )}{" "}
                            lapangan terpakai per ronde.
                          </strong>{" "}
                          {players.length -
                            Math.min(
                              data.courts,
                              Math.floor(players.length / 4),
                            ) *
                              4}{" "}
                          pemain menunggu giliran.{" "}
                          {social.ranking === "AVERAGE"
                            ? "Peringkat memakai rata-rata poin tiap laga."
                            : "Peringkat memakai total poin; pastikan jatah bermain sesuai kebutuhan acara."}
                        </p>
                      </div>
                    )}
                    <p className="setting-help">
                      Alur ini menambahkan nama sebagai pemain baru dalam
                      organisasi Anda.
                    </p>
                  </>
                )}
              </section>
            ) : (
              <section className="setup-section">
                <div className="setup-review-title">
                  <Icon name={format.icon} size={28} />
                  <div>
                    <h3>{data.name}</h3>
                    <p>
                      {format.label} · {data.location || "Lokasi belum diisi"}
                    </p>
                  </div>
                </div>
                <dl className="setup-review">
                  <div>
                    <dt>Peserta</dt>
                    <dd>
                      {!isSocial && registrationLater
                        ? `${data.slotCount} slot kosong`
                        : `${count} ${isSocial ? "pemain" : "pasangan"}`}
                    </dd>
                  </div>
                  <div>
                    <dt>Lapangan</dt>
                    <dd>{data.courts} lapangan</dd>
                  </div>
                  <div>
                    <dt>Mulai</dt>
                    <dd>
                      {data.start.replace("T", " ")}{" "}
                      {data.timezone === "Asia/Jakarta"
                        ? "WIB"
                        : data.timezone === "Asia/Makassar"
                          ? "WITA"
                          : "WIT"}
                    </dd>
                  </div>
                  <div>
                    <dt>Hitungan skor</dt>
                    <dd>
                      {isSocial
                        ? `${social.target} poin per laga · ${social.rounds} ronde`
                        : scoreDescription}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {isSocial
                        ? "Peringkat"
                        : directPoints
                          ? "Jika seri"
                          : "Deuce"}
                    </dt>
                    <dd>
                      {isSocial
                        ? social.ranking === "TOTAL"
                          ? "Total poin"
                          : "Rata-rata poin"
                        : directPoints
                          ? "Satu poin penentu"
                          : DEUCE_OPTIONS.find(
                              (option) => option.value === data.deuce,
                            )?.label}
                    </dd>
                  </div>
                  {!isSocial && (
                    <div>
                      <dt>Jadwal</dt>
                      <dd>
                        {data.duration} menit / laga · jeda {data.rest} menit
                      </dd>
                    </div>
                  )}
                </dl>
                {(!registrationLater || isSocial) && (
                  <details className="setup-details">
                    <summary>
                      <Icon name="users" size={18} />
                      <span>Periksa daftar peserta</span>
                      <Icon name="plus" size={18} />
                    </summary>
                    <ol className="setup-participant-list">
                      {(isSocial
                        ? players
                        : pairs.map((pair) => pair.join(" / "))
                      ).map((name, index) => (
                        <li key={index}>
                          <span>{index + 1}</span>
                          {name}
                        </li>
                      ))}
                    </ol>
                  </details>
                )}
                <div className="setup-callout">
                  <Icon name="check" />
                  <p>
                    <strong>Disimpan sebagai draf.</strong>{" "}
                    {isSocial
                      ? "Ronde pertama langsung disiapkan. Anda bisa memeriksa pasangan lalu mempublikasikan acara."
                      : registrationLater
                        ? "Slot peserta masih kosong. Berikutnya daftarkan pasangan pada halaman turnamen, lalu buat bagan dan jadwal."
                        : "Bagan dan jadwal dibuat otomatis. Berikutnya, tugaskan wasit dan publikasikan acara."}
                  </p>
                </div>
              </section>
            )}
          </fieldset>
          <footer className="setup-form-actions">
            <button
              type="button"
              className="btn-secondary"
              disabled={busy || step === 0}
              onClick={() => goTo(step - 1)}
            >
              Kembali
            </button>
            <button className="btn-primary" disabled={busy}>
              {busy
                ? "Membuat acara…"
                : step === 2
                  ? isSocial
                    ? `Buat ${format.label} & ronde pertama`
                    : registrationLater
                      ? "Buat turnamen dengan slot kosong"
                      : "Buat turnamen, bagan & jadwal"
                  : "Lanjut"}
              <Icon name="arrow" size={18} />
            </button>
          </footer>
        </form>
        <aside className="setup-summary" aria-label="Ringkasan pengaturan">
          <p className="setup-eyebrow">PILIHAN ANDA</p>
          <Icon name={format.icon} size={30} />
          <h2>{format.label}</h2>
          <p>{format.description}</p>
          <dl>
            <div>
              <dt>Peserta</dt>
              <dd>{isSocial ? "Pemain individu" : "Pasangan tetap"}</dd>
            </div>
            <div>
              <dt>Skor</dt>
              <dd>
                {isSocial ? `${social.target} poin per laga` : scoreDescription}
              </dd>
            </div>
            <div>
              <dt>
                {isSocial ? "Ronde" : directPoints ? "Jika seri" : "Deuce"}
              </dt>
              <dd>
                {isSocial
                  ? social.rounds
                  : directPoints
                    ? "Satu poin penentu"
                    : DEUCE_OPTIONS.find(
                        (option) => option.value === data.deuce,
                      )?.label}
              </dd>
            </div>
            <div>
              <dt>Lapangan</dt>
              <dd>{data.courts}</dd>
            </div>
          </dl>
          <div className="setup-summary-tip">
            <Icon name="settings" size={18} />
            <p>
              {isSocial
                ? "Poin pasangan dicatat untuk kedua pemainnya. Sahkan semua hasil sebelum membuat ronde selanjutnya."
                : "Belum yakin? Satu set standar cukup untuk memulai. Rincian aturan bisa diatur sebelum pertandingan berjalan."}
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={<div className="panel">Menyiapkan formulir turnamen…</div>}
    >
      <NewTournament />
    </Suspense>
  );
}
