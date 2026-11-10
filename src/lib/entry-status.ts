export type RegistrationEntry = {
  id: string;
  status?: string;
  createdAt?: string | Date;
};
export const isMainEntry = (entry: RegistrationEntry) =>
  entry.status === "REGISTERED" || entry.status === "CONFIRMED";
export function waitingEntries<T extends RegistrationEntry>(entries: T[]): T[] {
  return entries
    .filter((e) => e.status === "WAITLISTED")
    .sort(
      (a, b) =>
        new Date(a.createdAt ?? 0).getTime() -
          new Date(b.createdAt ?? 0).getTime() || a.id.localeCompare(b.id),
    );
}
export function entryStatusLabel(
  entry: RegistrationEntry,
  entries: RegistrationEntry[],
) {
  if (entry.status === "WAITLISTED")
    return `Cadangan nomor ${waitingEntries(entries).findIndex((e) => e.id === entry.id) + 1}`;
  if (entry.status === "WITHDRAWN") return "Batal mengikuti";
  if (entry.status === "DISQUALIFIED") return "Didiskualifikasi";
  return "Peserta utama";
}
