import type { Card, SeatId } from "../shared/contracts";

const ranks = "23456789TJQKA";
const categories = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

/** Compare all 21 five-card hands; lexicographic ranks include every kicker. */
export function rankHand(cards: Card[]) {
  if (cards.length !== 7) throw new Error("Showdown requires seven cards.");
  let best = -1;
  for (let i = 0; i < 7; i++)
    for (let j = i + 1; j < 7; j++) {
      const five = cards.filter((_, k) => k !== i && k !== j);
      const values = five
        .map((c) => ranks.indexOf(c.rank) + 2)
        .sort((a, b) => b - a);
      const groups = [...new Set(values)]
        .map((v) => ({ v, n: values.filter((x) => x === v).length }))
        .sort((a, b) => b.n - a.n || b.v - a.v);
      const flush = five.every((c) => c.suit === five[0].suit);
      const straight =
        groups.length === 5
          ? values[0] - values[4] === 4
            ? values[0]
            : values.join(",") === "14,5,4,3,2"
              ? 5
              : 0
          : 0;
      let parts: number[];
      if (flush && straight) parts = [8, straight];
      else if (groups[0].n === 4) parts = [7, ...groups.map((g) => g.v)];
      else if (groups[0].n === 3 && groups[1].n === 2)
        parts = [6, ...groups.map((g) => g.v)];
      else if (flush) parts = [5, ...values];
      else if (straight) parts = [4, straight];
      else if (groups[0].n === 3) parts = [3, ...groups.map((g) => g.v)];
      else if (groups[0].n === 2 && groups[1].n === 2)
        parts = [2, ...groups.map((g) => g.v)];
      else if (groups[0].n === 2) parts = [1, ...groups.map((g) => g.v)];
      else parts = [0, ...values];
      while (parts.length < 6) parts.push(0);
      best = Math.max(
        best,
        parts.reduce((n, v) => n * 15 + v, 0),
      );
    }
  const category = Math.floor(best / 15 ** 5);
  return {
    score: best,
    name:
      category === 8 && Math.floor(best / 15 ** 4) % 15 === 14
        ? "Royal flush"
        : categories[category],
  };
}

export function settleHand(
  order: SeatId[],
  button: number,
  starts: Record<SeatId, number>,
  contributions: Record<SeatId, number>,
  folded: Set<SeatId>,
  holes: Partial<Record<SeatId, Card[]>>,
  board: Card[],
) {
  const stacks = { ...starts };
  for (const id of order) stacks[id] -= contributions[id];
  const payouts = Object.fromEntries(order.map((id) => [id, 0])) as Record<
    SeatId,
    number
  >;
  const winners = new Set<SeatId>();
  const live = order.filter((id) => !folded.has(id));
  const ranked = Object.fromEntries(
    live.map((id) => [
      id,
      live.length > 1
        ? rankHand([...(holes[id] ?? []), ...board])
        : { score: 0, name: "Last player standing" },
    ]),
  );
  const levels = [
    ...new Set(order.map((id) => contributions[id]).filter((n) => n > 0)),
  ].sort((a, b) => a - b);
  let previous = 0,
    contestedPot = 0;
  for (const level of levels) {
    const contributors = order.filter((id) => contributions[id] >= level);
    const amount = (level - previous) * contributors.length;
    previous = level;
    if (contributors.length === 1) {
      stacks[contributors[0]] += amount;
      continue;
    } // uncalled chips return
    contestedPot += amount;
    const eligible = contributors.filter((id) => !folded.has(id));
    if (!eligible.length) throw new Error("Pot has no eligible player.");
    const best = Math.max(...eligible.map((id) => ranked[id].score));
    const winning = eligible.filter((id) => ranked[id].score === best);
    const each = Math.floor(amount / winning.length);
    let odd = amount % winning.length;
    const clockwise = [
      ...order.slice(button + 1),
      ...order.slice(0, button + 1),
    ].filter((id) => winning.includes(id));
    for (const id of clockwise) {
      const paid = each + (odd-- > 0 ? 1 : 0);
      stacks[id] += paid;
      payouts[id] += paid;
      winners.add(id);
    }
  }
  if (order.some((id) => !Number.isInteger(stacks[id]) || stacks[id] < 0))
    throw new Error("Invalid final stack.");
  const winningHandNames = new Set([...winners].map((id) => ranked[id].name));
  return {
    stacks,
    payouts,
    winningSeatIds: [...winners],
    finalPot: contestedPot,
    winningHandName:
      winningHandNames.size > 1
        ? "Multiple winning hands"
        : (ranked[[...winners][0]]?.name ?? "Last player standing"),
  };
}
