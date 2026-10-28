import type { Reservation } from "../../../packages/core/src/scheduling";

export interface ScheduleMatchInput {
  id: string;
  round: number;
  matchNumber: number;
  entryAId?: string | null;
  entryBId?: string | null;
  playerIds?: string[];
  dependencyIds?: string[];
}

export interface CourtResource {
  id: string;
  name: string;
  priority: number;
  venueCourtId?: string | null;
}

export interface SchedulingOptions {
  startTime: Date;
  matchDurationMinutes: number; // e.g. 60 or 90
  minRestMinutes: number; // e.g. 30 or 60
  reservations?: Reservation[];
}

export interface ScheduledMatchResult {
  matchId: string;
  courtId: string;
  courtName: string;
  scheduledAt: Date;
  estimatedEndAt: Date;
  round: number;
}

export interface ScheduleGenerationResult {
  scheduledMatches: ScheduledMatchResult[];
  totalCourtsUsed: number;
  timelineStart: Date;
  timelineEnd: Date;
}
