import { expect, it } from "vitest";
import { rankHand, settleHand } from "../src/server/settlement";
import type { Card, SeatId } from "../src/shared/contracts";
const cards = (text: string) =>
  text.split(" ").map(
    (c) =>
      ({
        rank: c[0],
        suit: (
          { c: "clubs", d: "diamonds", h: "hearts", s: "spades" } as const
        )[c[1] as "c"],
      }) as Card,
  );
it("ranks quads kickers, two trips, wheel and straight flush correctly", () => {
  expect(rankHand(cards("Ac Ad Ah As Kc 2d 3h")).score).toBeGreaterThan(
    rankHand(cards("Ac Ad Ah As Qc 2d 3h")).score,
  );
  expect(rankHand(cards("Ac Ad Ah Kc Kd Kh 2s")).name).toBe("Full house");
  expect(rankHand(cards("Ac 2d 3h 4s 5c Kd Qh")).name).toBe("Straight");
  expect(rankHand(cards("Ah Kh Qh Jh Th 2d 3s")).name).toBe("Royal flush");
});
it("pays different main/side-pot winners and returns uncalled chips", () => {
  const order: SeatId[] = ["user", "uplift", "pip"];
  const starts = { user: 100, uplift: 300, pip: 500 } as Record<SeatId, number>;
  const board = cards("2c 3d 7h 9s Jc");
  const result = settleHand(
    order,
    0,
    starts,
    starts,
    new Set(),
    { user: cards("Ah Ad"), uplift: cards("Kh Kd"), pip: cards("Qh Qd") },
    board,
  );
  expect(result.stacks).toEqual({ user: 300, uplift: 400, pip: 200 });
  expect(result.finalPot).toBe(700);
  expect(result.winningSeatIds.sort()).toEqual(["uplift", "user"]);
});
it("awards odd chips clockwise and excludes folded hands from eligibility", () => {
  const order: SeatId[] = ["user", "uplift", "pip"];
  const starts = { user: 100, uplift: 100, pip: 100 } as Record<SeatId, number>;
  const contributions = { user: 5, uplift: 5, pip: 5 } as Record<
    SeatId,
    number
  >;
  const result = settleHand(
    order,
    0,
    starts,
    contributions,
    new Set<SeatId>(["pip"]),
    { user: cards("2c 3c"), uplift: cards("4d 5d") },
    cards("Ah Kh Qh Jh Th"),
  );
  expect(result.stacks).toEqual({ user: 102, uplift: 103, pip: 95 });
});

it("does not attribute the main-pot hand to a different side-pot winner", () => {
  const order: SeatId[] = ["user", "uplift", "pip"];
  const contributions = { user: 100, uplift: 300, pip: 500 } as Record<
    SeatId,
    number
  >;
  const result = settleHand(
    order,
    0,
    contributions,
    contributions,
    new Set(),
    {
      user: cards("Ac Kc"),
      uplift: cards("Qh Qd"),
      pip: cards("Th Td"),
    },
    cards("2c 3c 7h 9s Jc"),
  );
  expect(result.stacks).toEqual({ user: 300, uplift: 400, pip: 200 });
  expect(result.winningHandName).toBe("Multiple winning hands");
});
