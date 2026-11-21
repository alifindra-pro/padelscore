import { randomInt } from "node:crypto";
import { draw } from "../../packages/core/src";

type Node = ReturnType<typeof draw>[number];
export interface Qualifier {
  id: string;
  group: string;
}

const coins = (n: number) =>
  Array.from({ length: n }, () => randomInt(0, 0x1000000) / 0x1000000);

function feeders(nodes: Node[], target: Node) {
  return nodes
    .filter((x) => x.winnerTo?.[0] === target.number)
    .sort((x, y) => x.winnerTo![1].localeCompare(y.winnerTo![1]));
}

/** Pair ids in the top (0) and bottom (1) half of a single-elimination bracket. */
export function bracketHalves(nodes: Node[]) {
  const lastRound = Math.max(...nodes.map((n) => n.round));
  const final = nodes.find((n) => n.round === lastRound)!;
  const half = new Map<string, 0 | 1>();
  const collect = (n: Node, side: 0 | 1) => {
    for (const id of [n.a, n.b]) if (id && !half.has(id)) half.set(id, side);
    for (const f of feeders(nodes, n)) collect(f, side);
  };
  const [top, bottom] = feeders(nodes, final);
  if (top) collect(top, 0);
  if (bottom) collect(bottom, 1);
  return half;
}

/** No half holds more than its share of one group's pairs. */
function separated(nodes: Node[], qualified: Qualifier[]) {
  const half = bracketHalves(nodes);
  const byGroup = new Map<string, string[]>();
  for (const q of qualified)
    byGroup.set(q.group, [...(byGroup.get(q.group) ?? []), q.id]);
  for (const ids of byGroup.values()) {
    if (ids.length < 2) continue;
    const top = ids.filter((id) => half.get(id) === 0).length;
    const limit = Math.ceil(ids.length / 2);
    if (top > limit || ids.length - top > limit) return false;
  }
  return true;
}

/**
 * Knockout positions drawn at random, with pairs from the same group kept in
 * opposite halves so they can meet no earlier than the final. Byes land on
 * whoever the draw puts in those positions.
 */
export function randomKnockout(qualified: Qualifier[]) {
  if (qualified.length === 2)
    return {
      order: [...qualified],
      nodes: draw(
        qualified.map((q, i) => ({ id: q.id, seed: i + 1 })),
        "SINGLE_ELIMINATION",
        "SEEDED",
        coins(2),
      ),
    };
  for (let attempt = 0; attempt < 5000; attempt++) {
    const order = [...qualified];
    for (let i = order.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    const nodes = draw(
      order.map((q, i) => ({ id: q.id, seed: i + 1 })),
      "SINGLE_ELIMINATION",
      "SEEDED",
      coins(order.length),
    );
    if (separated(nodes, qualified)) return { order, nodes };
  }
  throw new Error(
    "Bagan acak tidak menemukan susunan yang memisahkan pasangan satu grup",
  );
}

const roundLabel = (size: number) =>
  size === 2 ? "Final" : size === 4 ? "SF" : size === 8 ? "QF" : "Laga";

/**
 * Columns for the reveal: each first match a pair plays, top to bottom.
 * A pair with a bye appears in the match it goes straight into.
 */
export function knockoutReveal(
  nodes: Node[],
  order: Qualifier[],
  names: Map<string, string>,
) {
  const lastRound = Math.max(...nodes.map((n) => n.round));
  const final = nodes.find((n) => n.round === lastRound)!;
  // Positional order of every match, walked back from the final.
  const byRound = new Map<number, Node[]>();
  let level = [final];
  for (let r = lastRound; level.length; r--) {
    byRound.set(r, level);
    level = level.flatMap((n) => feeders(nodes, n));
  }
  const label = new Map<number, string>();
  for (const [round, list] of byRound) {
    const size = 2 ** (lastRound - round + 1);
    list
      .filter((n) => !n.bye)
      .forEach((n, i) =>
        label.set(
          n.number,
          round === lastRound ? "Final" : `${roundLabel(size)} ${i + 1}`,
        ),
      );
  }
  // The first real match of each pair.
  const firstMatch = new Map<string, Node>();
  const rounds = [...byRound.keys()].sort((a, b) => a - b);
  for (const r of rounds)
    for (const n of byRound.get(r)!)
      if (!n.bye)
        for (const id of [n.a, n.b])
          if (id && !firstMatch.has(id)) firstMatch.set(id, n);
  const columns: string[] = [];
  for (const r of rounds)
    for (const n of byRound.get(r)!)
      if (
        !n.bye &&
        [n.a, n.b].some((id) => id && firstMatch.get(id) === n) &&
        !columns.includes(label.get(n.number)!)
      )
        columns.push(label.get(n.number)!);
  return {
    groups: columns,
    placements: order.map((q) => ({
      entryId: q.id,
      name: names.get(q.id) ?? "",
      group: label.get(firstMatch.get(q.id)!.number)!,
    })),
  };
}
