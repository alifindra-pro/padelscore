import { describe, it, expect } from "vitest";
import { validateEligibility } from "../src";
describe("category eligibility", () => {
  const player = {
    fullName: "Ayu",
    birthDate: "2008-10-13",
    gender: "FEMALE",
    level: "BEGINNER",
  };
  it("uses event local date on birthday boundary", () => {
    expect(() =>
      validateEligibility(
        [player],
        { minAge: 18 },
        new Date("2026-10-12T17:00:00Z"),
        "Asia/Jakarta",
      ),
    ).not.toThrow();
    expect(() =>
      validateEligibility(
        [player],
        { minAge: 18 },
        new Date("2026-10-12T16:00:00Z"),
        "Asia/Jakarta",
      ),
    ).toThrow("usia");
  });
  it("does not infer eligibility from category names or omit required data", () => {
    expect(() =>
      validateEligibility(
        [{ fullName: "Unknown" }],
        {},
        new Date(),
        "Asia/Jakarta",
      ),
    ).not.toThrow();
    expect(() =>
      validateEligibility(
        [{ fullName: "Unknown" }],
        { maxAge: 18 },
        new Date(),
        "Asia/Jakarta",
      ),
    ).toThrow("Tanggal lahir");
  });
  it("checks mixed teams and level separately", () => {
    expect(() =>
      validateEligibility(
        [player, player],
        { gender: "MIXED" },
        new Date(),
        "Asia/Jakarta",
      ),
    ).toThrow("campuran");
    expect(() =>
      validateEligibility(
        [player],
        { levels: ["ADVANCED"] },
        new Date(),
        "Asia/Jakarta",
      ),
    ).toThrow("level");
  });
});
