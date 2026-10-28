"use client";

import { Icon } from "@/components/ui/Icon";

import React, { useState } from "react";
import { apiFetch } from "@/lib/api-client";

type DrawEntry = { id: string; name: string; seed?: number | null };

interface LiveDrawModalProps {
  categoryId: string;
  categoryName: string;
  entries: DrawEntry[];
  onComplete: () => void;
  onClose: () => void;
}

export function LiveDrawModal({
  categoryId,
  categoryName,
  entries,
  onComplete,
  onClose,
}: LiveDrawModalProps) {
  const [step, setStep] = useState<
    "intro" | "drawing" | "revealing" | "finished"
  >("intro");
  const [drawnList, setDrawnList] = useState<DrawEntry[]>([]);
  const [currentDrawn, setCurrentDrawn] = useState<DrawEntry | null>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);

  // Remaining entries to draw
  const [remaining, setRemaining] = useState<DrawEntry[]>([...entries]);

  // Automatic draw sequence
  const startAutoDraw = async () => {
    setStep("drawing");
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    const results: DrawEntry[] = [];

    for (let i = 0; i < shuffled.length; i++) {
      const item = shuffled[i];
      setIsSpinning(true);
      await new Promise((r) => setTimeout(r, 600)); // suspense spin
      setIsSpinning(false);
      setCurrentDrawn(item);
      results.push(item);
      setDrawnList([...results]);
      await new Promise((r) => setTimeout(r, 500)); // pause between draws
    }

    setConfettiActive(true);
    setStep("finished");
  };

  // Draw single ball step by step
  const drawSingleBall = async () => {
    if (remaining.length === 0) return;
    setIsSpinning(true);
    await new Promise((r) => setTimeout(r, 800)); // suspense spin
    setIsSpinning(false);

    // Pick random from remaining
    const randomIndex = Math.floor(Math.random() * remaining.length);
    const picked = remaining[randomIndex];

    const nextRemaining = remaining.filter((_, idx) => idx !== randomIndex);
    setRemaining(nextRemaining);

    setCurrentDrawn(picked);
    const nextList = [...drawnList, picked];
    setDrawnList(nextList);

    if (nextRemaining.length === 0) {
      setConfettiActive(true);
      setStep("finished");
    }
  };

  const handleSaveAndGenerate = async () => {
    try {
      setSaving(true);
      await apiFetch(`/api/v1/categories/${categoryId}/brackets/generate`, {
        method: "POST",
      });
      onComplete();
    } catch (err) {
      alert(
        err instanceof Error && err.message
          ? err.message
          : "Gagal membuat bagan.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4 overflow-y-auto">
      {/* Visual Confetti Effect */}
      {confettiActive && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden flex items-center justify-center z-50">
          <div className="draw-celebration">
            <Icon name="trophy" size={64} />
          </div>
        </div>
      )}

      <div
        className="bg-card border border-brand/30 rounded-2xl max-w-2xl w-full p-6 md:p-8 space-y-6 shadow-overlay relative"
        role="dialog"
        aria-modal="true"
        aria-labelledby="draw-title"
      >
        {/* Glow Effects */}

        {/* Modal Header */}
        <div className="flex justify-between items-start border-b border-line pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-warning-ink text-[10px] font-extrabold uppercase tracking-widest mb-1.5">
              PENGUNDIAN RESMI
            </div>
            <h2
              id="draw-title"
              className="text-xl md:text-2xl font-extrabold text-ink tracking-tight"
            >
              Official Draw Ceremony: {categoryName}
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              Live Bracket Seed &amp; Position Reveal &bull; {entries.length}{" "}
              Pairs Entered
            </p>
          </div>

          <button
            aria-label="Tutup pengundian"
            onClick={onClose}
            className="text-secondary hover:text-ink p-2 rounded-xl bg-surface-tint text-sm"
          >
            ✕
          </button>
        </div>

        {/* Step: Intro */}
        {step === "intro" && (
          <div className="text-center py-8 space-y-6">
            <div className="relative inline-block">
              {/* Spinning 3D Padel Ball Bowl */}
              <div className="w-28 h-28 mx-auto rounded-full bg-gradient-to-tr from-brand via-brand to-kinetic p-1  shadow-card flex items-center justify-center">
                <div className="w-full h-full bg-canvas rounded-full flex items-center justify-center text-5xl">
                  <Icon name="court" size={20} />
                </div>
              </div>
            </div>

            <div className="max-w-md mx-auto space-y-2">
              <h3 className="text-lg font-extrabold text-ink">
                Siap Melakukan Pengundian Bracket?
              </h3>
              <p className="text-xs text-secondary leading-relaxed">
                Setiap bola undian mewakili pasangan atlet. Pengundian akan
                menentukan penempatan unggulan (*seeds*), *byes*, dan bagan
                pertandingan secara adil dan transparan.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-2">
              <button
                onClick={() => {
                  setStep("drawing");
                  drawSingleBall();
                }}
                className="w-full sm:w-auto px-6 py-3.5 bg-brand hover:bg-brand-hover text-inverse font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-card transition active:scale-95 cursor-pointer"
              >
                Ambil bola satu per satu
              </button>
              <button
                onClick={startAutoDraw}
                className="w-full sm:w-auto px-6 py-3.5 bg-surface-tint hover:bg-surface-hover text-warning-ink font-extrabold text-xs uppercase tracking-wider rounded-2xl transition border border-amber-500/30 cursor-pointer"
              >
                Undian otomatis
              </button>
            </div>
          </div>
        )}

        {/* Step: Drawing / Revealing */}
        {(step === "drawing" || step === "revealing") && (
          <div className="space-y-6 py-4">
            {/* Spotlight Card */}
            <div className="p-6 bg-canvas border border-brand/40 rounded-2xl text-center space-y-4 shadow-overlay relative overflow-hidden">
              <div className="text-[11px] font-extrabold uppercase tracking-widest text-brand-strong">
                Bola Undian #{drawnList.length} dari {entries.length}
              </div>

              {/* Suspense Spinner / Ball Shuffle */}
              <div
                className={`w-24 h-24 mx-auto rounded-full border-4 border-dashed border-brand flex items-center justify-center text-4xl transition-all duration-300 ${
                  isSpinning
                    ? "animate-spin scale-110 border-amber-400 bg-amber-500/20"
                    : "scale-100 bg-brand-soft"
                }`}
              >
                <Icon name={isSpinning ? "refresh" : "court"} size={38} />
              </div>

              {/* Reveal Result */}
              {currentDrawn && !isSpinning ? (
                <div className="space-y-1 ">
                  <div className="text-xl md:text-2xl font-extrabold text-ink tracking-tight">
                    {currentDrawn.name}
                  </div>
                  {currentDrawn.seed ? (
                    <span className="inline-block text-xs font-sans tabular-nums font-bold text-warning-ink bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-full">
                      Unggulan #{currentDrawn.seed} (Seed {currentDrawn.seed})
                    </span>
                  ) : (
                    <span className="text-xs text-secondary font-semibold">
                      Non-Seeded Entry
                    </span>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted font-sans tabular-nums">
                  Sedang mengacak bola di dalam mangkuk undian...
                </div>
              )}
            </div>

            {/* Controls */}
            {remaining.length > 0 && (
              <div className="flex justify-center gap-3">
                <button
                  onClick={drawSingleBall}
                  disabled={isSpinning}
                  className="px-6 py-3 bg-brand hover:bg-brand-hover text-inverse font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-card cursor-pointer disabled:opacity-50"
                >
                  {isSpinning ? "Mengacak..." : "▶ Ambil Bola Berikutnya"}
                </button>
                <button
                  onClick={startAutoDraw}
                  className="px-4 py-3 bg-surface-tint hover:bg-surface-hover text-secondary font-bold text-xs rounded-xl"
                >
                  Selesaikan Otomatis
                </button>
              </div>
            )}

            {/* Live Drawn Roster */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-secondary font-semibold">
                <span>Hasil Undian Tersusun:</span>
                <span>{drawnList.length} terundi</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1">
                {drawnList.map((item, idx) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-card border border-line rounded-xl text-xs flex items-center justify-between"
                  >
                    <span className="font-bold text-ink truncate pr-1">
                      {idx + 1}. {item.name}
                    </span>
                    {item.seed && (
                      <span className="text-[9px] font-sans tabular-nums font-bold text-warning-ink bg-amber-500/10 px-1 rounded">
                        #{item.seed}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step: Finished / Confetti */}
        {step === "finished" && (
          <div className="text-center py-6 space-y-6">
            <div className="stat-icon mx-auto">
              <Icon name="trophy" size={32} />
            </div>
            <div className="space-y-1">
              <h3 className="text-2xl font-extrabold text-ink">
                Pengundian Selesai!
              </h3>
              <p className="text-xs text-secondary">
                Semua pasangan telah berhasil diundi dan ditempatkan ke bagan
                turnamen.
              </p>
            </div>

            <div className="flex justify-center gap-4 pt-2">
              <button
                onClick={handleSaveAndGenerate}
                disabled={saving}
                className="px-8 py-3.5 bg-brand hover:bg-brand-hover text-inverse font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-card transition cursor-pointer disabled:opacity-50"
              >
                {saving
                  ? "Menyimpan Bagan..."
                  : "Buka & kunci bagan pertandingan"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
