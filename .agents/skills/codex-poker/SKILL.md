---
name: codex-poker
description: Play CodexPoker with Ali in one continuous Codex task while the in-app Browser shows only the poker table.
---

# CodexPoker

Use this skill whenever Ali says “Play CodexPoker,” asks to resume the poker game, or asks Codexxyyy to play.

## Product contract

- The main Codex task is the only conversation, banter, review, and next-hand decision surface.
- The Codex in-app Browser is the table. Never add or use embedded chat, coaching, CLI instructions, or hand review there.
- Keep one Goal active for the whole play session. The goal ends only when Ali says to stop playing.
- Never reveal, summarize, quote, or hint at Codexxyyy’s private cards before showdown.
- Never include turn tokens, private recommendations, or private bridge packets in chat.
- Never act for Ali. Ali uses the preview controls.
- Do not silently start the next hand. At hand completion, ask Ali to choose review or next hand in this task.

## Start or resume

1. If no CodexPoker Goal is active, create one with the objective: `Play CodexPoker with Ali in this task until Ali stops, keeping all chat and hand review here.`
2. Check dependencies. If `node_modules` is missing, tell Ali installation is starting, then run `npm install`.
3. Run:

   ```bash
   npm run --silent game:start -- --json
   ```

4. Parse the verified `previewUrl`. Open that exact URL with the Codex in-app Browser. Never assume port 5173.
5. If startup fails, run:

   ```bash
   npm run --silent game:doctor -- --json
   ```

   Report the failing check and the actionable diagnostic. Do not leave the preview on an unexplained loader.

## Continuous play loop

Run:

```bash
npm run --silent game:loop
```

Use its public-safe `suggestedMessage` for short Codexxyyy table talk in this task.

- If the status is `waiting-for-ali`, immediately begin the watcher:

  ```bash
  npm run --silent game:watch -- --timeout-ms 55000
  ```

  Keep the command alive while Ali acts in the preview. If it returns `still-waiting`, run it again without ending the Goal. When it returns `state-changed` or `actionable`, immediately run `game:loop`, post Codexxyyy’s public-safe action here, and watch again at the next Ali turn.

- If the status is `uplift-still-to-act`, run `game:loop` again. Do not use `/api/uplift/fallback` in normal play.
- If the status is `review-ready`, stop the watcher and ask: “Want the quick Codexxyyy review, or should we shuffle the next one?”
  - Review only after Ali says yes: `npm run --silent game:review -- --mode accepted`
  - Next hand only after Ali chooses it: `npm run --silent game:next`
- If Ali says stop, finish the Goal. The detached local runtime may remain available for a later resume.

## Recovery

- If the watcher drops, run `game:doctor`, then `game:start`. `game:start` reuses a healthy runtime, repairs stale metadata, and retries one crashed startup.
- If the preview is open but says the Codex task is disconnected, reconnect `game:watch`; do not use a browser-side fallback action.
- If the browser tab is missing, reopen the `previewUrl` returned by `game:start`.

## Private decision commands

Normal play should use `game:loop`. For debugging only:

- `game:turn` reads Codexxyyy’s private packet.
- `game:play` submits its recommendation.
- `game:act` submits only a validated Codexxyyy move.

Never paste any private-command output into chat.
