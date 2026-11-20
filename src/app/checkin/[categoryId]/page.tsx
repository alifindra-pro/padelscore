"use client";
import { Suspense, use, useEffect, useState } from "react";
import { AppBrand } from "@/components/ui/AppBrand";
import { categoryStyle } from "@/lib/category-color";

interface Session {
  pass: string;
  tournament: string;
  category: string;
  entries: {
    id: string;
    name: string;
    players: { id: string; fullName: string; checkedIn: boolean }[];
  }[];
}
type Pick = {
  entryId: string;
  entryName: string;
  playerId: string;
  name: string;
};

async function call<T>(categoryId: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/v2/check-in/${categoryId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error?.message || "Check-in gagal");
  return json.data as T;
}

function Content({
  params,
  searchParams,
}: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { categoryId } = use(params);
  const { t: token } = use(searchParams);
  const [session, setSession] = useState<Session>();
  const [error, setError] = useState(
    token ? "" : "Pindai QR di layar panitia untuk check-in.",
  );
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{
    name: string;
    at: string;
    already: boolean;
    pair: string;
  }>();

  useEffect(() => {
    if (!token) return;
    call<Session>(categoryId, { action: "open", token })
      .then(setSession)
      .catch((e) => setError(e.message));
  }, [categoryId, token]);

  async function confirm() {
    if (!session || !pick) return;
    setBusy(true);
    setError("");
    try {
      const r = await call<{
        name: string;
        checkedInAt: string;
        already: boolean;
      }>(categoryId, {
        action: "confirm",
        pass: session.pass,
        entryId: pick.entryId,
        playerId: pick.playerId,
      });
      setDone({
        name: r.name,
        at: r.checkedInAt,
        already: r.already,
        pair: pick.entryName,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const entries = (session?.entries ?? []).filter(
    (e) =>
      !q ||
      e.name.toLowerCase().includes(q) ||
      e.players.some((p) => p.fullName.toLowerCase().includes(q)),
  );

  return (
    <main
      className="checkin-page"
      style={categoryStyle(session?.category ?? "")}
    >
      <header className="checkin-page-head">
        <AppBrand />
      </header>
      {done ? (
        <section className="checkin-done" role="status">
          <svg viewBox="0 0 24 24" width="64" height="64" aria-hidden="true">
            <path
              d="M4 12l5 5L20 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <p className="checkin-done-label">
            {done.already ? "Sudah check-in" : "Hadir"}
          </p>
          <h1>{done.name}</h1>
          <p>{done.pair}</p>
          <p className="checkin-done-meta">
            {session?.category} · pukul{" "}
            {new Date(done.at).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
          <p className="checkin-done-note">
            Tunjukkan layar ini ke panitia. Pasangan Anda juga perlu check-in
            dengan HP-nya sendiri.
          </p>
        </section>
      ) : session ? (
        <section className="checkin-pick">
          <p className="checkin-kicker">{session.tournament}</p>
          <h1>Check-in {session.category}</h1>
          <p className="checkin-lead">Pilih nama Anda.</p>
          <label className="field">
            <span className="sr-only">Cari nama</span>
            <input
              type="search"
              placeholder="Cari nama atau pasangan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </label>
          {error && (
            <p className="checkin-error" role="alert">
              {error}
            </p>
          )}
          <ol className="checkin-pick-list">
            {entries.map((e) => (
              <li key={e.id}>
                <span className="checkin-pick-pair">{e.name}</span>
                <span className="checkin-pick-players">
                  {e.players.map((p) => (
                    <button
                      key={p.id}
                      className={
                        p.checkedIn ? "checkin-chip is-in" : "checkin-chip"
                      }
                      disabled={p.checkedIn}
                      onClick={() =>
                        setPick({
                          entryId: e.id,
                          entryName: e.name,
                          playerId: p.id,
                          name: p.fullName,
                        })
                      }
                    >
                      <span>{p.fullName}</span>
                      <small>{p.checkedIn ? "Sudah hadir" : "Pilih"}</small>
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ol>
          {!entries.length && (
            <p className="checkin-lead">Nama tidak ditemukan.</p>
          )}
        </section>
      ) : (
        <section className="checkin-pick">
          <h1>Check-in</h1>
          <p
            className={error ? "checkin-error" : "checkin-lead"}
            role={error ? "alert" : undefined}
          >
            {error || "Memeriksa QR…"}
          </p>
        </section>
      )}
      {pick && !done && (
        <div
          className="checkin-confirm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div>
            <h2 id="confirm-title">Check-in sebagai {pick.name}?</h2>
            <p>Pasangan: {pick.entryName}</p>
            {error && (
              <p className="checkin-error" role="alert">
                {error}
              </p>
            )}
            <div className="checkin-confirm-actions">
              <button
                className="btn-secondary"
                onClick={() => {
                  setPick(null);
                  setError("");
                }}
                disabled={busy}
              >
                Bukan saya
              </button>
              <button className="btn-kinetic" onClick={confirm} disabled={busy}>
                {busy ? "Menyimpan…" : "Ya, saya hadir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Page(props: {
  params: Promise<{ categoryId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <main className="checkin-page">
          <p>Memuat…</p>
        </main>
      }
    >
      <Content {...props} />
    </Suspense>
  );
}
