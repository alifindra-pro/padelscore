"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

/** Asks the referee for the 4-digit start code read out by the control desk. */
export function StartCodeGate({
  matchId,
  onUnlocked,
}: {
  matchId: string;
  onUnlocked: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel start-code"
      aria-labelledby="start-code-title"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          await apiFetch(`/api/v2/matches/${matchId}/unlock`, {
            method: "POST",
            body: JSON.stringify({ code }),
          });
          onUnlocked();
        } catch (err) {
          setError((err as Error).message);
          setCode("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2 id="start-code-title" className="panel-title">
        Kode mulai laga
      </h2>
      <p className="text-sm text-secondary">
        Minta kode 4 angka laga ini ke meja panitia, lalu masukkan di sini.
      </p>
      <label className="field">
        <span className="sr-only">Kode mulai</span>
        <input
          className="start-code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{4}"
          maxLength={4}
          placeholder="0000"
          value={code}
          onChange={(e) =>
            setCode(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
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
        disabled={busy || code.length !== 4}
      >
        {busy ? "Memeriksa…" : "Buka laga"}
      </button>
    </form>
  );
}
