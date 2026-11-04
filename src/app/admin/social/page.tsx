"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import {
  OptionCards,
  SocialSettings,
  FORMAT_OPTIONS,
} from "@/components/admin/TournamentChoices";
import { Icon } from "@/components/ui/Icon";
import {
  SocialConfig,
  SocialPlayer,
  SocialRound,
  leaderboard,
} from "../../../../packages/core/src";
interface Event {
  id: string;
  name: string;
  format: string;
  config: SocialConfig;
  participants: SocialPlayer[];
  rounds: SocialRound[];
  version: number;
  published: boolean;
}
const org = () => localStorage.getItem("padel-organization") || undefined;
function fetchSocial() {
  return Promise.all([
    apiFetch<Event[]>("/api/v2/social", {
      params: { organizationId: org() },
    }),
    apiFetch<{ items: { id: string; fullName: string }[] }>("/api/v1/players", {
      params: { limit: 100, organizationId: org() },
    }),
  ]);
}
export default function SocialAdmin() {
  const [events, setEvents] = useState<Event[]>([]);
  const [players, setPlayers] = useState<{ id: string; fullName: string }[]>(
    [],
  );
  const [current, setCurrent] = useState<Event>();
  const [message, setMessage] = useState("");
  const [format, setFormat] = useState("AMERICANO");
  const [settings, setSettings] = useState<
    Pick<SocialConfig, "target" | "rounds" | "ranking" | "pairing">
  >({ target: 32, rounds: 7, ranking: "TOTAL", pairing: "BALANCED" });
  const [busy, setBusy] = useState(false);
  const apply = useCallback(
    ([e, p]: Awaited<ReturnType<typeof fetchSocial>>) => {
      setEvents(e);
      setCurrent((previous) => {
        const requested =
          previous?.id || new URLSearchParams(window.location.search).get("id");
        return e.find((event) => event.id === requested) || previous;
      });
      setPlayers(p.items);
    },
    [],
  );
  const load = () => fetchSocial().then(apply);
  useEffect(() => {
    fetchSocial()
      .then(apply)
      .catch((e) => setMessage((e as Error).message));
  }, [apply]);
  async function change(operation: string, body: object) {
    if (!current) return;
    setBusy(true);
    try {
      const next = await apiFetch<Event>(
        `/api/v2/social/${current.id}${operation ? "/" + operation : ""}`,
        {
          method: "POST",
          body: JSON.stringify({ ...body, version: current.version }),
        },
      );
      setCurrent(next);
      await load();
      setMessage("Perubahan disimpan");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-workspace space-y-6">
      <div className="app-page-heading">
        <p className="page-eyebrow">ROTASI PEMAIN & PERINGKAT</p>
        <h1 className="page-heading">Americano / Mexicano</h1>
      </div>
      <p className="text-secondary">
        Skor bertambah satu poin: 0, 1, 2, 3. Pasangan berganti tiap ronde; poin
        dihitung untuk setiap pemain.
      </p>
      <p role="status">{message}</p>
      <div className="social-event-picker">
        {events.map((e) => (
          <button
            className="btn-secondary"
            key={e.id}
            aria-pressed={current?.id === e.id}
            onClick={() => setCurrent(e)}
          >
            {e.name}
          </button>
        ))}
      </div>
      <Link
        className="btn-primary"
        href="/admin/tournaments/new?format=AMERICANO"
      >
        <Icon name="plus" size={18} />
        Buat acara dengan panduan
      </Link>
      <details className="panel" open={!current && events.length === 0}>
        <summary className="font-bold cursor-pointer">
          Buat acara dari pemain terdaftar
        </summary>
        <form
          className="grid md:grid-cols-2 gap-4 mt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            setBusy(true);
            try {
              const selected = f.getAll("players").map(String);
              const event = await apiFetch<Event>("/api/v2/social", {
                method: "POST",
                body: JSON.stringify({
                  organizationId: org(),
                  name: f.get("name"),
                  format: f.get("format"),
                  config: {
                    courts: Number(f.get("courts")),
                    ...settings,
                  },
                  participants: players
                    .filter((p) => selected.includes(p.id))
                    .map((p) => ({ id: p.id, name: p.fullName, active: true })),
                }),
              });
              setCurrent(event);
              await load();
            } catch (e) {
              setMessage((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field">
            Nama acara
            <input name="name" required minLength={2} />
          </label>
          <label className="field">
            Jumlah lapangan
            <input
              name="courts"
              type="number"
              min={1}
              max={32}
              defaultValue={1}
              required
            />
          </label>
          <div className="md:col-span-2">
            <OptionCards
              legend="Sistem pertandingan"
              name="format"
              value={format}
              options={FORMAT_OPTIONS.slice(2)}
              onChange={setFormat}
            />
          </div>
          <div className="md:col-span-2">
            <SocialSettings
              format={format}
              value={settings}
              onChange={setSettings}
              disabled={busy}
            />
          </div>
          <fieldset className="md:col-span-2">
            <legend className="font-bold mb-3">
              Pilih pemain (minimal 4 orang)
            </legend>
            <p className="action-help mb-3">
              Daftarkan pemain satu per satu. Sistem akan menyusun pasangan
              untuk setiap ronde.
            </p>
            {!players.length && (
              <p className="text-sm mb-3">
                Belum ada pemain.{" "}
                <Link href="/admin/players" className="text-brand underline">
                  Tambahkan pemain
                </Link>
                , lalu kembali ke halaman ini.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2 max-h-60 overflow-auto">
              {players.map((p) => (
                <label key={p.id} className="flex gap-2">
                  <input type="checkbox" name="players" value={p.id} />
                  {p.fullName}
                </label>
              ))}
            </div>
          </fieldset>
          <button className="btn-primary" disabled={busy}>
            {busy
              ? "Menyimpan…"
              : `Buat acara ${format === "AMERICANO" ? "Americano" : "Mexicano"}`}
          </button>
        </form>
      </details>
      {current && (
        <>
          <section className="panel space-y-4">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold">{current.name}</h2>
                <p>
                  {current.format === "AMERICANO" ? "Americano" : "Mexicano"} ·{" "}
                  {current.config.target} poin per laga ·{" "}
                  {current.config.rounds} ronde
                </p>
              </div>
              <button
                className="btn-secondary"
                disabled={busy}
                onClick={() => change("", { published: !current.published })}
              >
                {current.published ? "Sembunyikan dari publik" : "Publikasikan"}
              </button>
            </div>
            {(current.config.location || current.config.start) && (
              <p className="setting-help">
                {current.config.location}
                {current.config.start &&
                  ` · ${new Date(current.config.start).toLocaleString("id-ID", { timeZone: current.config.timezone || "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" })}`}
              </p>
            )}
            <div className="setup-callout">
              <Icon name="live" />
              <p>
                <strong>Hitungan poin: A + B = {current.config.target}.</strong>{" "}
                Poin pasangan masuk ke masing-masing pemain. Peringkat memakai{" "}
                {current.config.ranking === "TOTAL"
                  ? "total poin"
                  : "rata-rata poin per laga"}
                . Sahkan semua hasil ronde sebelum melanjutkan.
              </p>
            </div>
            {current.published && (
              <Link
                className="text-brand underline"
                href={`/social/${current.id}`}
              >
                Buka tautan publik ↗
              </Link>
            )}
            <button
              className="btn-kinetic"
              disabled={
                busy ||
                current.rounds.length >= current.config.rounds ||
                current.rounds.some((r) => r.matches.some((m) => !m.approved))
              }
              onClick={() => change("rounds", {})}
            >
              Buat ronde berikutnya
            </button>
            <details>
              <summary>Peserta aktif / menunggu</summary>
              {current.participants.map((p) => (
                <label className="flex gap-2 py-2" key={p.id}>
                  <input
                    type="checkbox"
                    checked={p.active}
                    disabled={busy}
                    onChange={() =>
                      change("", {
                        participants: current.participants.map((x) =>
                          x.id === p.id ? { ...x, active: !x.active } : x,
                        ),
                      })
                    }
                  />
                  {p.name}
                </label>
              ))}
            </details>
          </section>
          {current.rounds.map((round) => (
            <section className="panel space-y-4" key={round.number}>
              <div className="setting-section-heading">
                <span className="setting-section-icon">
                  <Icon name="court" />
                </span>
                <div>
                  <h3>Ronde {round.number}</h3>
                  <p>
                    {round.matches.length} laga · Total skor kedua pasangan
                    harus {current.config.target} poin.
                  </p>
                </div>
              </div>
              {round.waiting.length > 0 && (
                <p>
                  Menunggu:{" "}
                  {round.waiting
                    .map(
                      (id) =>
                        current.participants.find((p) => p.id === id)?.name,
                    )
                    .join(", ")}
                </p>
              )}
              {round.compromises.map((c, i) => (
                <p className="text-secondary text-sm" key={i}>
                  {c}
                </p>
              ))}
              {round.matches.map((m) => (
                <form
                  className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end border-t border-line pt-4"
                  key={m.court}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void change("results", {
                      round: round.number,
                      court: m.court,
                      scoreA: Number(f.get("a")),
                      scoreB: Number(f.get("b")),
                    });
                  }}
                >
                  <p className="col-span-2 md:col-span-2">
                    Lapangan {m.court}
                    <br />
                    <strong>
                      {m.teamA
                        .map(
                          (id) =>
                            current.participants.find((p) => p.id === id)?.name,
                        )
                        .join(" / ")}
                    </strong>
                    <br />
                    melawan{" "}
                    {m.teamB
                      .map(
                        (id) =>
                          current.participants.find((p) => p.id === id)?.name,
                      )
                      .join(" / ")}
                  </p>
                  <label className="field">
                    Poin pasangan A
                    <input
                      name="a"
                      type="number"
                      min={0}
                      max={current.config.target}
                      defaultValue={m.scoreA ?? 0}
                    />
                  </label>
                  <label className="field">
                    Poin pasangan B
                    <input
                      name="b"
                      type="number"
                      min={0}
                      max={current.config.target}
                      defaultValue={m.scoreB ?? 0}
                    />
                  </label>
                  <button
                    className="btn-primary"
                    disabled={busy || round.number !== current.rounds.length}
                  >
                    {m.approved ? "Perbarui hasil" : "Sahkan hasil"}
                  </button>
                </form>
              ))}
            </section>
          ))}
          <section className="panel">
            <h2 className="text-xl font-bold mb-4">Peringkat pemain</h2>
            <div className="overflow-auto">
              <table className="w-full text-left">
                <thead>
                  <tr>
                    <th>Pemain</th>
                    <th>Main</th>
                    <th>Total</th>
                    <th>Rata-rata</th>
                  </tr>
                </thead>
                <tbody>
                  {leaderboard(
                    current.participants,
                    current.rounds,
                    current.config.ranking,
                  ).map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="py-3">{p.name}</td>
                      <td>{p.played}</td>
                      <td>{p.points}</td>
                      <td>{p.average.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
