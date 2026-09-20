import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { actionRequestSchema } from "../shared/contracts";
import { DomainError, MalformedCommandError } from "./errors";
import { GameService } from "./game-service";
import { ensureDataDirs, getDataDir, pathFromRoot } from "./paths";

export function createServer(
  game = new GameService(),
  runtimeId = process.env.CODEX_POKER_RUNTIME_ID ?? randomUUID(),
): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((error, request, reply) => {
    const domainError = error instanceof DomainError ? error : undefined;
    const message =
      error instanceof Error ? error.message : "Unexpected server error";
    const statusCode = domainError?.statusCode ?? 500;
    const code = domainError?.code ?? "internal_error";
    reply.status(statusCode).send({ ok: false, code, message });
  });

  app.get("/api/health", async () => ({
    ok: true,
    app: "codex-poker",
    schemaVersion: 1,
    runtimeId,
    pid: process.pid,
    repoRoot: pathFromRoot(),
    ready: true,
  }));
  const receipts = new Map<string, { fingerprint: string; result: unknown }>();
  const agentActionSchema = actionRequestSchema
    .omit({ seat: true })
    .extend({ requestId: z.string().min(1).max(120) })
    .strict()
    .refine(
      (value) =>
        ["bet", "raise"].includes(value.action) || value.amount === undefined,
      { message: "Only bets and raises accept an amount." },
    );
  app.get("/api/agent/table", async () => ({
    ok: true,
    state: game.getAgentSnapshot(),
  }));
  app.get("/api/agent/history", async () => ({
    ok: true,
    hands: game.getHandHistory(),
  }));
  app.get("/api/agent/turn", async () => ({
    ok: true,
    state: game.getCodexTurn(),
  }));
  app.post("/api/agent/action", async (request) => {
    const parsed = agentActionSchema.safeParse(request.body);
    if (!parsed.success)
      throw new MalformedCommandError(parsed.error.issues[0]?.message);
    const { requestId, ...action } = parsed.data;
    const fingerprint = JSON.stringify(action);
    const previous = receipts.get(requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new MalformedCommandError(
          "Request ID already used for a different move.",
        );
      return previous.result;
    }
    const after = game.submitAction({ ...action, seat: "uplift" });
    const played = after.publicActions
      .filter((item) => item.seatId === "uplift")
      .at(-1)!;
    const result = structuredClone({
      ok: true,
      requestId,
      played,
      state: game.getAgentSnapshot(),
    });
    receipts.set(requestId, { fingerprint, result });
    if (receipts.size > 256) receipts.delete(receipts.keys().next().value!);
    return result;
  });
  app.post("/api/agent/next", async (request) => {
    const parsed = z
      .object({ handId: z.string().min(1) })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      throw new MalformedCommandError("Completed handId required.");
    const state = game.getAgentSnapshot();
    if (parsed.data.handId !== state.handId) return { ok: true, state };
    if (state.phase !== "hand-complete")
      throw new MalformedCommandError("Finish this hand first.");
    game.startNewHand();
    return { ok: true, state: game.getAgentSnapshot() };
  });
  app.get("/api/agent/wait", async (request, reply) => {
    const parsed = z
      .object({ cursor: z.string().min(1).max(200) })
      .safeParse(request.query);
    if (!parsed.success)
      throw new MalformedCommandError("A table cursor is required.");
    const current = game.getAgentSnapshot();
    if (current.cursor !== parsed.data.cursor)
      return { ok: true, changed: true, state: current };
    const stopWatching = game.watchCodex();
    return new Promise((resolve) => {
      let unsubscribe: (() => void) | undefined;
      const finish = (changed: boolean) => {
        clearTimeout(timer);
        unsubscribe?.();
        stopWatching();
        reply.raw.removeListener("close", closed);
        resolve({ ok: true, changed, state: game.getAgentSnapshot() });
      };
      const closed = () => {
        clearTimeout(timer);
        unsubscribe?.();
        stopWatching();
        resolve(undefined);
      };
      const timer = setTimeout(() => finish(false), 15000);
      reply.raw.once("close", closed);
      unsubscribe = game.subscribe(() => {
        if (game.getAgentSnapshot().cursor !== parsed.data.cursor) finish(true);
      });
    });
  });

  app.get("/api/state", async () => ({ ok: true, state: game.getSnapshot() }));

  app.post("/api/action", async (request) => {
    const parsed = actionRequestSchema
      .extend({ seat: z.literal("user") })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      throw new MalformedCommandError(parsed.error.issues[0]?.message);
    return { ok: true, state: game.submitAction(parsed.data) };
  });

  app.post("/api/new-hand", async (request) => {
    const parsed = z
      .object({ handId: z.string().min(1) })
      .strict()
      .safeParse(request.body);
    if (!parsed.success)
      throw new MalformedCommandError("Completed handId required.");
    if (parsed.data.handId !== game.getSnapshot().handId)
      return { ok: true, state: game.getSnapshot() };
    return { ok: true, state: game.startNewHand() };
  });

  app.get("/events", (request, reply) => {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const send = (state: unknown) => {
      reply.raw.write(`event: state\n`);
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);
    };
    const unsubscribe = game.subscribe(send);
    const heartbeat = setInterval(
      () => reply.raw.write(`: heartbeat\n\n`),
      15000,
    );
    request.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  const clientDist = pathFromRoot("dist/client");
  if (fs.existsSync(clientDist)) {
    app.register(fastifyStatic, {
      root: clientDist,
      prefix: "/",
    });
    app.setNotFoundHandler((request, reply) => {
      if (request.method === "GET" && !request.url.startsWith("/api")) {
        reply.sendFile("index.html");
        return;
      }
      reply.status(404).send({ ok: false, message: "Not found" });
    });
  }

  app.addHook("onClose", async () => {
    game.close();
  });

  return app;
}

export async function startServer(port = Number(process.env.PORT ?? 8797)) {
  ensureDataDirs();
  const delay = Number(process.env.CODEX_POKER_API_START_DELAY_MS ?? 0);
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  const app = createServer();
  await app.listen({ host: "127.0.0.1", port });
  fs.writeFileSync(
    path.join(getDataDir(), "server.json"),
    `${JSON.stringify({ port, url: `http://127.0.0.1:${port}` }, null, 2)}\n`,
  );
  console.log(`CodexPoker server listening on http://127.0.0.1:${port}`);
  return app;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  startServer().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
