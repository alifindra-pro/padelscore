export interface Reservation {
  id: string;
  courtId: string;
  playerIds: string[];
  start: number;
  end: number;
}
export function validateReservation(
  candidate: Reservation,
  existing: Reservation[],
  restMinutes: number,
) {
  if (
    !Number.isFinite(candidate.start) ||
    !Number.isFinite(candidate.end) ||
    candidate.end <= candidate.start ||
    !Number.isFinite(restMinutes) ||
    restMinutes < 0
  )
    throw new Error("Waktu pertandingan tidak valid");
  for (const r of existing) {
    if (r.id === candidate.id) continue;
    const overlaps = candidate.start < r.end && candidate.end > r.start;
    if (overlaps && candidate.courtId === r.courtId)
      throw new Error("Lapangan telah digunakan pada waktu tersebut");
    const share = candidate.playerIds.some((id) => r.playerIds.includes(id));
    if (
      share &&
      candidate.start < r.end + restMinutes * 60000 &&
      candidate.end + restMinutes * 60000 > r.start
    )
      throw new Error("Pemain bentrok atau waktu istirahat belum cukup");
  }
}
