import { describe, expect, it } from "vitest";
import {
  bracketHalves,
  knockoutReveal,
  randomKnockout,
  type Qualifier,
} from "@/lib/knockout-draw";

const field = (groups: number, perGroup = 2): Qualifier[] =>
  Array.from({ length: groups * perGroup }, (_, i) => ({
    id: `p${i}`,
    group: `Grup ${String.fromCharCode(65 + (i % groups))}`,
  }));

describe("random knockout", () => {
  for (const [label, groups] of [
    ["Rookie Men: 14 pairs from 7 groups", 7],
    ["Rookie Women: 10 pairs from 5 groups", 5],
    ["8 pairs from 4 groups", 4],
  ] as const)
    it(`${label} keeps each group's pairs in opposite halves`, () => {
      const qualified = field(groups);
      const firstOrders = new Set<string>();
      for (let run = 0; run < 60; run++) {
        const { order, nodes } = randomKnockout(qualified);
        expect(new Set(order.map((q) => q.id)).size).toBe(qualified.length);
        const half = bracketHalves(nodes);
        expect(half.size).toBe(qualified.length);
        for (let g = 0; g < groups; g++) {
          const ids = qualified
            .filter((q) => q.group === qualified[g].group)
            .map((q) => q.id);
          expect(half.get(ids[0])).not.toBe(half.get(ids[1]));
        }
        firstOrders.add(order.map((q) => q.id).join());
      }
      // It is actually random, not one fixed arrangement.
      expect(firstOrders.size).toBeGreaterThan(50);
    });

  it("lists every pair once in the match it plays first", () => {
    const qualified = field(7);
    const { order, nodes } = randomKnockout(qualified);
    const names = new Map(qualified.map((q) => [q.id, q.id.toUpperCase()]));
    const reveal = knockoutReveal(nodes, order, names);
    expect(reveal.placements.map((p) => p.entryId)).toEqual(
      order.map((q) => q.id),
    );
    // 14 pairs in a 16 bracket: 6 opening matches, and the two byes go
    // straight into quarter-finals.
    const per = new Map<string, number>();
    for (const p of reveal.placements)
      per.set(p.group, (per.get(p.group) ?? 0) + 1);
    expect([...per.values()].every((n) => n === 1 || n === 2)).toBe(true);
    expect(
      reveal.placements.filter((p) => p.group.startsWith("Laga")),
    ).toHaveLength(12);
    expect(
      reveal.placements.filter((p) => p.group.startsWith("QF")),
    ).toHaveLength(2);
    expect(reveal.groups.every((g) => per.has(g))).toBe(true);
  });
});
