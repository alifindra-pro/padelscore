// One vocabulary for every status and format shown to people.
// Unknown codes are humanized, so a raw CODE_WITH_UNDERSCORES never reaches the screen.

const humanize = (code?: string | null) => {
  const words = (code ?? "").replaceAll("_", " ").trim().toLowerCase();
  return words ? words[0].toUpperCase() + words.slice(1) : "";
};
const labeler =
  (labels: Record<string, string>) =>
  (code?: string | null): string =>
    labels[code ?? ""] ?? humanize(code);

export const TOURNAMENT_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Draf",
  REGISTRATION: "Pendaftaran dibuka",
  PUBLISHED: "Terbit",
  IN_PROGRESS: "Berlangsung",
  COMPLETED: "Selesai",
  ARCHIVED: "Arsip",
};
export const tournamentStatusLabel = labeler(TOURNAMENT_STATUS_LABELS);

const matchStatus = labeler({
  SCHEDULED: "Terjadwal",
  WARMUP: "Pemanasan",
  IN_PROGRESS: "Berlangsung",
  SUSPENDED: "Ditunda",
  FINISHED: "Menunggu pengesahan",
  APPROVED: "Disahkan",
  CANCELLED: "Dibatalkan",
});
/** Label for a match row. An approved result always reads "Disahkan". */
export const matchStatusLabel = (
  status?: string | null,
  approvalStatus?: string | null,
) => (approvalStatus === "APPROVED" ? "Disahkan" : matchStatus(status));

/** Status of the live score state kept by the scoring engine. */
export const scoreStatusLabel = labeler({
  NOT_STARTED: "Belum dimulai",
  WARMUP: "Pemanasan",
  IN_PROGRESS: "Berlangsung",
  SUSPENDED: "Ditunda",
  COMPLETED: "Selesai",
  FINISHED: "Selesai",
  RETIRED: "Selesai karena mundur",
  WALKOVER: "Menang tanpa bertanding",
  DISQUALIFIED: "Diskualifikasi",
  CANCELLED: "Dibatalkan",
});

export const formatLabel = labeler({
  SINGLE_ELIMINATION: "Sistem gugur",
  DOUBLE_ELIMINATION: "Dua kali kalah gugur",
  ROUND_ROBIN: "Semua saling bertemu",
  GROUP_KNOCKOUT: "Grup + sistem gugur",
  LEAGUE: "Liga",
  AMERICANO: "Americano",
  MEXICANO: "Mexicano",
});

export const deuceLabel = labeler({
  ADVANTAGE: "Advantage",
  GOLDEN_POINT: "Golden Point",
  STAR_POINT: "Star Point",
  NO_AD: "Tanpa advantage",
});
