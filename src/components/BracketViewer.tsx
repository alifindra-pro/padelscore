'use client';

import React from 'react';
import Link from 'next/link';
import { StageView } from '@/types/match';

interface BracketViewerProps {
  stages: StageView[];
}

export function BracketViewer({ stages }: BracketViewerProps) {
  if (!stages || stages.length === 0) {
    return (
      <div className="py-16 text-center text-muted text-sm bg-card border border-line rounded-2xl p-6">
        Bagan pertandingan belum diundi.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {stages.map((stage) => {
        // Group Stage View
        if (stage.type === 'GROUP') {
          return (
            <div key={stage.id} className="space-y-6">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-base font-extrabold text-ink">{stage.name}</h3>
                <span className="text-xs font-sans tabular-nums text-brand-strong">
                  {stage.groups?.length || 0} grup
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {stage.groups?.map((group) => (
                  <div
                    key={group.id}
                    className="bg-card border border-line rounded-2xl p-5 space-y-4 shadow-card"
                  >
                    <div className="flex justify-between items-center border-b border-line pb-2">
                      <h4 className="font-extrabold text-ink text-sm">{group.name}</h4>
                      <span className="text-[10px] text-secondary uppercase font-sans tabular-nums">
                        Klasemen Sementara
                      </span>
                    </div>

                    {/* Standings Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[10px] text-secondary font-bold uppercase tracking-wider border-b border-line">
                            <th className="pb-2">Pos</th>
                            <th className="pb-2">Pasangan</th>
                            <th className="pb-2 text-center">M</th>
                            <th className="pb-2 text-center">K</th>
                            <th className="pb-2 text-right">Pts</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line">
                          {group.standings?.map((s, idx) => (
                            <tr key={s.id} className="hover:bg-surface-tint">
                              <td className="py-2.5 font-bold text-secondary">
                                {idx + 1}
                              </td>
                              <td className="py-2.5 font-bold text-ink truncate max-w-[140px]">
                                {s.entry?.name || 'TBD'}
                              </td>
                              <td className="py-2.5 text-center text-brand-strong font-sans tabular-nums">
                                {s.won}
                              </td>
                              <td className="py-2.5 text-center text-danger font-sans tabular-nums">
                                {s.lost}
                              </td>
                              <td className="py-2.5 text-right font-extrabold text-warning-ink font-sans tabular-nums text-sm">
                                {s.points}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        }

        // Single Elimination Knockout Tree View
        const matches = stage.matches || [];
        const rounds = Array.from(new Set(matches.map((m) => m.round))).sort(
          (a, b) => a - b
        );

        return (
          <div key={stage.id} className="space-y-6">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="text-base font-extrabold text-ink">{stage.name}</h3>
              <span className="text-xs font-sans tabular-nums text-brand-strong">
                {rounds.length} babak
              </span>
            </div>

            {/* Bracket Horizontal Scrolling Canvas */}
            <div className="overflow-x-auto pb-6 snap-x snap-mandatory">
              <div className="flex items-start gap-4 md:gap-6 xl:gap-8">
                {rounds.map((roundNumber, roundIndex) => {
                  const roundMatches = matches.filter((m) => m.round === roundNumber);
                  const isFinal = roundIndex === rounds.length - 1;

                  return (
                    <div key={roundNumber} className="w-[min(80vw,280px)] flex-shrink-0 snap-start space-y-4">
                      {/* Round Header */}
                      <div className="text-center p-2 rounded-xl bg-card border border-line text-xs font-extrabold uppercase tracking-wider text-secondary">
                        {isFinal
                          ? 'FINAL'
                          : roundIndex === rounds.length - 2
                          ? 'SEMIFINAL'
                          : `BABAK ${roundNumber}`}
                      </div>

                      {/* Matches in Round */}
                      <div className="space-y-6">
                        {roundMatches.map((m) => {
                          const snap = m.scoreSnapshot;
                          const isAWin = m.winnerId && m.winnerId === m.entryAId;
                          const isBWin = m.winnerId && m.winnerId === m.entryBId;

                          return (
                            <div
                              key={m.id}
                              className="bg-card border border-line rounded-2xl overflow-hidden shadow-card hover:border-brand-accent transition"
                            >
                              {/* Match Number Bar */}
                              <div className="px-3 py-1 bg-canvas text-[10px] font-sans tabular-nums text-muted flex justify-between items-center">
                                <span>Laga #{m.matchNumber}</span>
                                <span
                                  className={`font-bold ${
                                    m.status === 'IN_PROGRESS'
                                      ? 'status-live'
                                      : m.status === 'FINISHED'
                                      ? 'text-muted'
                                      : 'text-secondary'
                                  }`}
                                >
                                  {({SCHEDULED:'Terjadwal',IN_PROGRESS:'Berlangsung',FINISHED:'Selesai',APPROVED:'Disahkan',CANCELLED:'Dibatalkan'} as Record<string,string>)[m.status] ?? m.status}
                                </span>
                              </div>

                              {/* Entry A */}
                              <div
                                className={`px-3 py-2.5 flex justify-between items-center text-xs border-b border-line ${
                                  isAWin ? 'bg-surface-tint font-bold text-ink' : m.winnerId ? 'text-muted' : 'text-ink'
                                }`}
                              >
                                <span className="truncate pr-2">
                                  {m.entryA?.name || 'TBD'}
                                </span>
                                {snap && (
                                  <span className="font-sans tabular-nums font-bold text-xs min-w-16 text-right shrink-0">
                                    {snap.setsA} ({snap.pointsA})
                                  </span>
                                )}
                              </div>

                              {/* Entry B */}
                              <div
                                className={`px-3 py-2.5 flex justify-between items-center text-xs ${
                                  isBWin ? 'bg-surface-tint font-bold text-ink' : m.winnerId ? 'text-muted' : 'text-ink'
                                }`}
                              >
                                <span className="truncate pr-2">
                                  {m.entryB?.name || 'TBD'}
                                </span>
                                {snap && (
                                  <span className="font-sans tabular-nums font-bold text-xs min-w-16 text-right shrink-0">
                                    {snap.setsB} ({snap.pointsB})
                                  </span>
                                )}
                              </div>

                              {/* Action shortcut */}
                              <Link
                                href={`/match/${m.id}`}
                                className="block py-1.5 text-center text-[10px] font-bold text-brand-strong bg-canvas hover:bg-canvas transition border-t border-line"
                              >
                                Buka Papan Skor ↗
                              </Link>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
