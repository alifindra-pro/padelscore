"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface Placement {
  entryId: string;
  name: string;
  group: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Reel ticks slow down toward the stop so the landing reads as a moment.
const TICKS = [55, 55, 60, 60, 65, 70, 80, 90, 105, 125, 150, 185, 230, 290];

/**
 * Reveals a draw that the server has already made and saved, one pair at a
 * time. The reel only decorates the wait: every stop lands on the real pair in
 * the real group, in the order the draw placed them.
 */
export function GroupDrawCeremony({
  title,
  groups,
  placements,
  onClose,
}: {
  title: string;
  groups: string[];
  placements: Placement[];
  onClose: () => void;
}) {
  const [shown, setShown] = useState(0);
  const [reel, setReel] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [auto, setAuto] = useState(false);
  const busy = useRef(false);
  const autoRef = useRef(false);
  const shownRef = useRef(0);
  const done = shown >= placements.length;
  const current = shown > 0 ? placements[shown - 1] : null;
  const perGroup = Math.max(
    ...groups.map((g) => placements.filter((p) => p.group === g).length),
    1,
  );

  const reveal = useCallback(async () => {
    if (busy.current) return;
    const index = shownRef.current;
    if (index >= placements.length) return;
    busy.current = true;
    const pool = placements.slice(index).map((p) => p.name);
    const still =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!still && pool.length > 1) {
      setSpinning(true);
      let last = -1;
      for (const delay of TICKS) {
        let next = Math.floor(Math.random() * pool.length);
        if (next === last) next = (next + 1) % pool.length;
        last = next;
        setReel(pool[next]);
        await wait(delay);
      }
    }
    setReel(placements[index].name);
    setSpinning(false);
    shownRef.current = index + 1;
    setShown(index + 1);
    busy.current = false;
  }, [placements]);

  // Auto play: reveal, pause on the result, then continue until stopped.
  useEffect(() => {
    autoRef.current = auto;
    if (!auto) return;
    let cancelled = false;
    (async () => {
      while (
        !cancelled &&
        autoRef.current &&
        shownRef.current < placements.length
      ) {
        await reveal();
        await wait(1100);
      }
      if (!cancelled) setAuto(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [auto, placements.length, reveal]);

  // The stage covers the page; keep the page behind it from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if ((e.key === " " || e.key === "Enter") && !autoRef.current) {
        const target = e.target as HTMLElement | null;
        if (target?.closest("button")) return; // the focused button handles it
        e.preventDefault();
        void reveal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, reveal]);

  const showAll = () => {
    setAuto(false);
    shownRef.current = placements.length;
    setShown(placements.length);
    setReel(placements.at(-1)?.name ?? "");
    setSpinning(false);
  };

  // Rendered on <body> so no page layout can clip or show through the stage.
  return createPortal(
    <div
      className="draw-stage"
      role="dialog"
      aria-modal="true"
      aria-labelledby="draw-stage-title"
    >
      <header className="draw-stage-header">
        <div>
          <p>Undian grup</p>
          <h2 id="draw-stage-title">{title}</h2>
        </div>
        <span className="draw-stage-count">
          {shown} dari {placements.length} pasangan
        </span>
      </header>

      <section className="draw-reel" aria-hidden={spinning}>
        <span className={`draw-reel-name ${spinning ? "is-spinning" : ""}`}>
          {reel || "Siap mengundi"}
        </span>
        <span className="draw-reel-target">
          {spinning
            ? "Mengundi…"
            : current
              ? `masuk ${current.group}`
              : `${placements.length} pasangan · ${groups.length} grup`}
        </span>
      </section>
      <p className="sr-only" role="status">
        {!spinning && current ? `${current.name} masuk ${current.group}` : ""}
      </p>

      <div
        className={groups.length > 5 ? "draw-groups is-many" : "draw-groups"}
        style={
          {
            "--n": groups.length,
            "--half": Math.ceil(groups.length / 2),
          } as React.CSSProperties
        }
      >
        {groups.map((g) => {
          const members = placements
            .slice(0, shown)
            .filter((p) => p.group === g);
          return (
            <section key={g} className="draw-group">
              <h3>{g}</h3>
              <ol>
                {Array.from({ length: perGroup }, (_, i) => {
                  const p = members[i];
                  const fresh =
                    p && p.entryId === current?.entryId && !spinning;
                  return (
                    <li
                      key={i}
                      className={fresh ? "is-new" : p ? "" : "is-empty"}
                    >
                      {p ? p.name : ""}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>

      <footer className="draw-stage-actions">
        {done ? (
          <button className="btn-kinetic" onClick={onClose} autoFocus>
            Selesai, lihat bagan
          </button>
        ) : (
          <>
            <button
              className="btn-kinetic"
              onClick={() => void reveal()}
              disabled={spinning || auto}
              autoFocus
            >
              Undi nama berikutnya
            </button>
            <button
              className="draw-stage-secondary"
              onClick={() => setAuto(!auto)}
            >
              {auto ? "Jeda" : "Putar otomatis"}
            </button>
            <button className="draw-stage-secondary" onClick={showAll}>
              Tampilkan semua
            </button>
            <button className="draw-stage-secondary" onClick={onClose}>
              Tutup
            </button>
          </>
        )}
      </footer>
      <p className="draw-stage-note">
        Hasil sudah diundi dan disimpan oleh sistem sebelum ditampilkan. Tekan
        spasi untuk nama berikutnya.
      </p>
    </div>,
    document.body,
  );
}
