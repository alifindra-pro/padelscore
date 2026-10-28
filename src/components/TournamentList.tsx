import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

const statuses: Record<string, string> = {
  DRAFT: "Draf",
  REGISTRATION: "Pendaftaran",
  PUBLISHED: "Dipublikasikan",
  IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Arsip",
};

export function TournamentList({
  events,
}: {
  events: {
    id: string;
    name: string;
    status: string;
    location: string;
    startDate: string;
    timezone?: string;
  }[];
}) {
  return (
    <ul className="tournament-list" aria-label="Daftar turnamen">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            href={`/admin/tournaments/${event.id}`}
            className="tournament-row"
          >
            <div className="min-w-0">
              <h3 className="font-bold text-base break-words">{event.name}</h3>
              <p className="text-sm text-secondary mt-1">
                {event.location || "Lokasi belum diatur"}
              </p>
            </div>
            <time className="text-sm text-secondary" dateTime={event.startDate}>
              {new Date(event.startDate).toLocaleDateString("id-ID", {
                timeZone: event.timezone ?? "Asia/Jakarta",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </time>
            <span
              className={
                event.status === "IN_PROGRESS"
                  ? "status-live"
                  : "text-sm text-secondary"
              }
            >
              {statuses[event.status] ?? event.status}
            </span>
            <span className="inline-flex items-center gap-2 text-brand font-semibold text-sm">
              Kelola <Icon name="arrow" size={16} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
