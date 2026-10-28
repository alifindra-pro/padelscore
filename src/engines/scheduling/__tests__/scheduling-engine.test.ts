import { describe, it, expect } from "vitest";
import { scheduleMatches } from "../scheduling-engine";
import { ScheduleMatchInput, CourtResource, SchedulingOptions } from "../types";

describe("Scheduling Engine (Pure Logic)", () => {
  const courts: CourtResource[] = [
    { id: "c1", name: "Center Court", priority: 10 },
    { id: "c2", name: "Court 2", priority: 5 },
  ];

  const options: SchedulingOptions = {
    startTime: new Date("2026-11-01T09:00:00Z"),
    matchDurationMinutes: 60,
    minRestMinutes: 30,
  };

  it("1. Schedules round 1 matches across available courts prioritizing higher priority court", () => {
    const matches: ScheduleMatchInput[] = [
      { id: "m1", round: 1, matchNumber: 1, entryAId: "t1", entryBId: "t2" },
      { id: "m2", round: 1, matchNumber: 2, entryAId: "t3", entryBId: "t4" },
      { id: "m3", round: 1, matchNumber: 3, entryAId: "t5", entryBId: "t6" },
    ];

    const result = scheduleMatches(matches, courts, options);

    expect(result.scheduledMatches).toHaveLength(3);
    expect(result.totalCourtsUsed).toBe(2);

    // M1 and M2 start at 09:00:00Z simultaneously on Center Court and Court 2
    expect(result.scheduledMatches[0].scheduledAt.toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
    expect(result.scheduledMatches[0].courtName).toBe("Center Court");

    expect(result.scheduledMatches[1].scheduledAt.toISOString()).toBe(
      "2026-11-01T09:00:00.000Z",
    );
    expect(result.scheduledMatches[1].courtName).toBe("Court 2");

    // M3 starts on the first court that frees up at 10:00:00Z (Center Court)
    expect(result.scheduledMatches[2].scheduledAt.toISOString()).toBe(
      "2026-11-01T10:00:00.000Z",
    );
    expect(result.scheduledMatches[2].courtName).toBe("Center Court");
  });

  it("2. Enforces minimum rest time between matches for participating players", () => {
    // M1 has team 1 playing. M2 has team 1 playing again in round 2.
    const matches: ScheduleMatchInput[] = [
      { id: "m1", round: 1, matchNumber: 1, entryAId: "t1", entryBId: "t2" },
      { id: "m2", round: 2, matchNumber: 2, entryAId: "t1", entryBId: "t3" },
    ];

    const result = scheduleMatches(matches, courts, options);

    // M1 finishes at 10:00:00Z. With 30 min rest, T1 cannot play until 10:30:00Z.
    const m1 = result.scheduledMatches.find((m) => m.matchId === "m1")!;
    const m2 = result.scheduledMatches.find((m) => m.matchId === "m2")!;

    expect(m1.estimatedEndAt.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(m2.scheduledAt.getTime()).toBeGreaterThanOrEqual(
      new Date("2026-11-01T10:30:00.000Z").getTime(),
    );
  });
});

it("waits for both semifinal results and rest even when finalists are unknown", () => {
  const start = new Date("2026-11-01T00:00:00Z");
  const result = scheduleMatches(
    [
      { id: "a", round: 1, matchNumber: 1 },
      { id: "b", round: 1, matchNumber: 2 },
      { id: "final", round: 2, matchNumber: 3, dependencyIds: ["a", "b"] },
    ],
    [
      { id: "a", name: "A", priority: 1 },
      { id: "b", name: "B", priority: 1 },
      { id: "c", name: "C", priority: 1 },
    ],
    { startTime: start, matchDurationMinutes: 60, minRestMinutes: 30 },
  );
  expect(
    result.scheduledMatches
      .find((m) => m.matchId === "final")!
      .scheduledAt.getTime(),
  ).toBe(start.getTime() + 90 * 60000);
});

describe("External reservations", () => {
  const at = (hour: number, minute = 0) => Date.UTC(2026, 10, 1, hour, minute);
  const courts = [
    { id: "c1", name: "A", priority: 10, venueCourtId: "venue-1" },
    { id: "c2", name: "B", priority: 5 },
  ];
  const matches = [{ id: "m1", round: 1, matchNumber: 1, playerIds: ["p1"] }];
  const options = {
    startTime: new Date(at(9)),
    matchDurationMinutes: 60,
    minRestMinutes: 30,
  };

  it("selects an available court using the shared venue identity", () => {
    const result = scheduleMatches(matches, courts, {
      ...options,
      reservations: [
        {
          id: "external",
          courtId: "venue-1",
          playerIds: [],
          start: at(9),
          end: at(11),
        },
      ],
    });
    expect(result.scheduledMatches[0].courtId).toBe("c2");
    expect(result.scheduledMatches[0].scheduledAt.getTime()).toBe(at(9));
  });

  it("rechecks unsorted reservations after shifting past a conflict", () => {
    const result = scheduleMatches(matches, [courts[0]], {
      ...options,
      reservations: [
        {
          id: "later",
          courtId: "venue-1",
          playerIds: [],
          start: at(10),
          end: at(11),
        },
        {
          id: "earlier",
          courtId: "venue-1",
          playerIds: [],
          start: at(9),
          end: at(10),
        },
      ],
    });
    expect(result.scheduledMatches[0].scheduledAt.getTime()).toBe(at(11));
  });

  it("preserves player rest before a future reservation on another court", () => {
    const result = scheduleMatches(matches, courts, {
      ...options,
      reservations: [
        {
          id: "external",
          courtId: "other",
          playerIds: ["p1"],
          start: at(10, 15),
          end: at(11, 15),
        },
      ],
    });
    expect(result.scheduledMatches[0].scheduledAt.getTime()).toBe(at(11, 45));
  });

  it("uses a gap with exactly enough rest before a future reservation", () => {
    const result = scheduleMatches(matches, courts, {
      ...options,
      reservations: [
        {
          id: "external",
          courtId: "other",
          playerIds: ["p1"],
          start: at(10, 30),
          end: at(12),
        },
      ],
    });
    expect(result.scheduledMatches[0].scheduledAt.getTime()).toBe(at(9));
  });

  it("keeps downstream matches after a delayed parent and its rest period", () => {
    const result = scheduleMatches(
      [
        ...matches,
        { id: "final", round: 2, matchNumber: 2, dependencyIds: ["m1"] },
      ],
      [courts[0]],
      {
        ...options,
        reservations: [
          {
            id: "external",
            courtId: "venue-1",
            playerIds: [],
            start: at(9),
            end: at(11),
          },
        ],
      },
    );
    expect(result.scheduledMatches[1].scheduledAt.getTime()).toBe(at(12, 30));
  });
});
