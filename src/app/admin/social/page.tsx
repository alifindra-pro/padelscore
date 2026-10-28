"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
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
  const [target, setTarget] = useState(32);
  const [busy, setBusy] = useState(false);
  const apply = useCallback(
    ([e, p]: Awaited<ReturnType<typeof fetchSocial>>) => {
      setEvents(e);
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
    <div className="space-y-6">
      <div className="app-page-heading">
        <p className="page-eyebrow">GOOD GAMES. GREAT COMPANY.</p>
        <h1 className="page-heading">Americano / Mexicano</h1>
      </div>
      <p className="text-secondary">
        Skor bertambah satu poin: 0, 1, 2, 3. Pasangan berganti tiap ronde; poin
        dihitung untuk setiap pemain.
      </p>
      <p role="status">{message}</p>
      <div className="flex flex-wrap gap-3">
        {events.map((e) => (
          <button
            className="btn-secondary"
            key={e.id}
            onClick={() => setCurrent(e)}
          >
            {e.name}
          </button>
        ))}
      </div>
      <details className="panel" open={!current}>
        <summary className="font-bold cursor-pointer">
          Buat Americano / Mexicano
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
                    rounds: Number(f.get("rounds")),
                    target: Number(f.get("target")),
                    ranking: f.get("ranking"),
                    pairing: f.get("pairing") || "BALANCED",
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
            Format
            <select
              name="format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="AMERICANO">
                Americano — pasangan berganti sesuai rotasi
              </option>
              <option value="MEXICANO">
                Mexicano — pasangan mengikuti peringkat
              </option>
            </select>
          </label>
          {[
            ["courts", "Jumlah lapangan", 4],
            ["rounds", "Jumlah ronde", 7],
          ].map(([name, label, value]) => (
            <label className="field" key={name}>
              {label}
              <input
                type="number"
                name={String(name)}
                min={1}
                max={100}
                defaultValue={value}
                required
              />
            </label>
          ))}
          <label className="field">
            Total poin kedua pasangan per pertandingan
            <input
              name="target"
              type="number"
              min={1}
              max={100}
              required
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
              aria-describedby="points-example"
            />
            <span id="points-example" className="action-help">
              {target > 0
                ? `Jumlah skor A + B harus ${target}. Contoh hasil: ${Math.ceil(target / 2)}–${Math.floor(target / 2)}. Setiap pemain memperoleh poin pasangannya.`
                : "Masukkan total poin, misalnya 24 atau 32."}
            </span>
          </label>
          <label className="field">
            Peringkat berdasarkan
            <select name="ranking">
              <option value="AVERAGE">Rata-rata poin per pertandingan</option>
              <option value="TOTAL">Total poin</option>
            </select>
          </label>
          {format === "MEXICANO" && (
            <label className="field">
              Susunan pasangan berdasarkan peringkat
              <select name="pairing">
                <option value="BALANCED">Peringkat 1 & 4 melawan 2 & 3</option>
                <option value="ADJACENT">Peringkat 1 & 2 melawan 3 & 4</option>
              </select>
            </label>
          )}
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
                  {current.format} · {current.config.target} poin
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
              <h3 className="text-xl font-bold">Ronde {round.number}</h3>
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
