export interface Eligibility {
  minAge?: number;
  maxAge?: number;
  gender?: "ANY" | "MALE" | "FEMALE" | "MIXED";
  levels?: string[];
}
export interface EligiblePlayer {
  fullName: string;
  birthDate?: Date | string | null;
  gender?: string | null;
  level?: string | null;
}
/** Age is evaluated on the event's local calendar date, not server time. */
export function validateEligibility(
  players: EligiblePlayer[],
  policy: Eligibility,
  eventDate: Date,
  timezone: string,
) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(eventDate);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)!.value);
  for (const player of players) {
    if (policy.minAge !== undefined || policy.maxAge !== undefined) {
      if (!player.birthDate)
        throw new Error(
          `Tanggal lahir ${player.fullName} diperlukan untuk kategori usia`,
        );
      const birth = new Date(player.birthDate);
      if (!Number.isFinite(birth.getTime()))
        throw new Error("Tanggal lahir tidak valid");
      const age =
        get("year") -
        birth.getUTCFullYear() -
        (get("month") < birth.getUTCMonth() + 1 ||
        (get("month") === birth.getUTCMonth() + 1 &&
          get("day") < birth.getUTCDate())
          ? 1
          : 0);
      if (
        (policy.minAge !== undefined && age < policy.minAge) ||
        (policy.maxAge !== undefined && age > policy.maxAge)
      )
        throw new Error(
          `${player.fullName} tidak memenuhi batas usia kategori`,
        );
    }
    if (
      policy.gender &&
      ["MALE", "FEMALE"].includes(policy.gender) &&
      player.gender !== policy.gender
    )
      throw new Error(
        `${player.fullName} tidak memenuhi persyaratan jenis kelamin kategori`,
      );
    if (
      policy.levels?.length &&
      (!player.level || !policy.levels.includes(player.level))
    )
      throw new Error(`${player.fullName} tidak memenuhi level kategori`);
  }
  if (
    policy.gender === "MIXED" &&
    (players.length !== 2 ||
      !players.some((p) => p.gender === "MALE") ||
      !players.some((p) => p.gender === "FEMALE"))
  )
    throw new Error(
      "Ganda campuran memerlukan satu pemain putra dan satu pemain putri",
    );
}
