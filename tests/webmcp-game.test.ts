import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GameService } from "../src/server/game-service";
import { Storage } from "../src/server/storage";
import { createServer } from "../src/server";
import type { GameSnapshot } from "../src/shared/contracts";

let game: GameService;
let app: ReturnType<typeof createServer>;
beforeEach(() => {
  game = new GameService(new Storage(":memory:"));
  app = createServer(game);
});
afterEach(async () => {
  await app.close();
});
const passive = (s: GameSnapshot) =>
  s.legalActions.find((a) => a.kind === "check") ??
  s.legalActions.find((a) => a.kind === "call") ??
  s.legalActions[0];
function play(s: GameSnapshot) {
  const a = passive(s);
  return game.submitAction({
    seat: s.actingSeatId!,
    turnToken: s.turnToken,
    action: a.kind,
    amount: a.min,
  });
}
describe("WebMCP game contract", () => {
  it("keeps each player’s cards separate and never substitutes for Codex after Ali folds", async () => {
    const before = game.getSnapshot();
    expect(before.seats.find((s) => s.kind === "human")?.cards).toHaveLength(2);
    const table = (await app.inject("/api/agent/table")).json().state;
    expect(
      table.seats.every((s: { cards?: unknown }) => s.cards === undefined),
    ).toBe(true);
    expect(table.turnToken).toBe("");
    expect((await app.inject("/api/agent/turn")).statusCode).toBe(409);
    game.submitAction({
      seat: "user",
      turnToken: before.turnToken,
      action: "fold",
    });
    expect(game.getSnapshot().actingSeatId).toBe("uplift");
    const turn = (await app.inject("/api/agent/turn")).json().state;
    expect(turn.holeCards).toHaveLength(2);
    expect(
      turn.seats.every((s: { cards?: unknown }) => s.cards === undefined),
    ).toBe(true);
    expect(
      (await app.inject({ method: "POST", url: "/api/fast-forward" }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "POST", url: "/api/uplift/fallback" }))
        .statusCode,
    ).toBe(404);
  });
  it("accepts a Codex action once, rejects changed retries and rejects wrong-seat browser writes", async () => {
    play(game.getSnapshot());
    const s = game.getSnapshot(),
      a = passive(s);
    const payload = {
      requestId: "retry-test",
      turnToken: s.turnToken,
      action: a.kind,
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/agent/action",
      payload,
    });
    expect(first.statusCode).toBe(200);
    const seq = game.getSnapshot().actionSeq;
    const retry = await app.inject({
      method: "POST",
      url: "/api/agent/action",
      payload,
    });
    expect(retry.json()).toEqual(first.json());
    expect(game.getSnapshot().actionSeq).toBe(seq);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/agent/action",
          payload: { ...payload, action: "fold" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/action",
          payload: { seat: "uplift", turnToken: s.turnToken, action: "check" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/agent/action",
          payload: { ...payload, requestId: "stale-test" },
        })
      ).statusCode,
    ).toBeGreaterThanOrEqual(400);
    expect(
      first
        .json()
        .state.seats.every((seat: { cards?: unknown }) => !seat.cards),
    ).toBe(true);
  });
  it("does not deal over a live hand and wakes event waits on a user decision", async () => {
    const s = game.getSnapshot();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/new-hand",
          payload: { handId: s.handId },
        })
      ).statusCode,
    ).toBe(409);
    const waiting = app.inject(
      `/api/agent/wait?cursor=${encodeURIComponent(game.getAgentSnapshot().cursor)}`,
    );
    const response = waiting.then((r) => r.json());
    await new Promise((resolve) => setTimeout(resolve, 10));
    play(s);
    expect((await response).changed).toBe(true);
  });
  it("plays 100 varied hands with exact chip conservation and no leaked folded cards", () => {
    for (let h = 0; h < 100; h++) {
      let s = game.getSnapshot();
      const total = s.seats.reduce((n, p) => n + p.stack + p.bet, 0);
      let steps = 0;
      while (s.phase === "playing" && steps++ < 150) {
        const wager = s.legalActions.find(
          (a) => a.kind === "raise" || a.kind === "bet",
        );
        const fold = s.legalActions.find((a) => a.kind === "fold");
        const a =
          h % 7 === 0 && wager
            ? wager
            : h % 5 === 0 && steps % 4 === 0 && fold
              ? fold
              : passive(s);
        s = game.submitAction({
          seat: s.actingSeatId!,
          turnToken: s.turnToken,
          action: a.kind,
          amount: a.max ?? a.min,
        });
      }
      expect(steps).toBeLessThan(150);
      expect(s.seats.reduce((n, p) => n + p.stack, 0)).toBe(total);
      for (const seat of s.seats) {
        expect(seat.stack).toBeGreaterThanOrEqual(0);
        if (
          s.publicActions.some(
            (a) => a.seatId === seat.seatId && a.action === "fold",
          )
        )
          expect(seat.revealedCards).toBeUndefined();
      }
      expect(s.review?.publicActions.length).toBe(s.actionSeq);
      game.startNewHand();
    }
  });
});
