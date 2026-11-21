"use client";
import { Suspense, use, useEffect, useState } from "react";
import { AppBrand } from "@/components/ui/AppBrand";

/** Court referee sign-in: the link names the court, the token is from the desk. */
function Content({ params }: { params: Promise<{ link: string }> }) {
  const { link } = use(params);
  const [info, setInfo] = useState<{ court: string; tournament: string }>();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/v2/referee-access?link=${encodeURIComponent(link)}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}));
        if (!r.ok)
          throw new Error(json?.error?.message || "Link tidak berlaku");
        setInfo(json.data);
      })
      .catch((e) => setError(e.message));
  }, [link]);

  return (
    <main className="checkin-page referee-access">
      <header className="checkin-page-head">
        <AppBrand />
      </header>
      <section className="checkin-pick">
        {info && <p className="checkin-kicker">{info.tournament}</p>}
        <h1>{info ? `Wasit ${info.court}` : "Masuk wasit"}</h1>
        {info ? (
          <form
            className="start-code"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                const r = await fetch("/api/v2/referee-access", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ link, token }),
                });
                const json = await r.json().catch(() => ({}));
                if (!r.ok)
                  throw new Error(json?.error?.message || "Gagal masuk");
                // Full reload so the signed-in session is picked up everywhere.
                window.location.assign(
                  new URL(
                    json.data?.matchId
                      ? `/referee/v2/${json.data.matchId}`
                      : "/referee",
                    window.location.origin,
                  ).href,
                );
              } catch (err) {
                setError((err as Error).message);
                setToken("");
                setBusy(false);
              }
            }}
          >
            <p className="checkin-lead">
              Masukkan token pertandingan (4 angka) dari meja panitia. Laga
              langsung terbuka.
            </p>
            <label className="field">
              <span className="sr-only">Token pertandingan</span>
              <input
                className="start-code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="0000"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value.replace(/\D/g, "").slice(0, 6));
                  setError("");
                }}
                autoFocus
              />
            </label>
            {error && (
              <p role="alert" className="start-code-error">
                {error}
              </p>
            )}
            <button
              className="btn-kinetic w-full"
              disabled={busy || ![4, 6].includes(token.length)}
            >
              {busy ? "Memeriksa…" : "Buka laga"}
            </button>
          </form>
        ) : (
          <p
            className={error ? "checkin-error" : "checkin-lead"}
            role={error ? "alert" : undefined}
          >
            {error || "Memeriksa link…"}
          </p>
        )}
      </section>
    </main>
  );
}

export default function Page(props: { params: Promise<{ link: string }> }) {
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
