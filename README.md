# CodexPoker

A local play-chip poker table for you and the Codex in your chat, against four local bots. Open the table in Codex's built-in browser. Your cards and controls live in the browser; Codex chooses its own moves through native WebMCP and talks in chat.

```sh
npm ci
npm run dev
```

Open the preview URL printed by the launcher (normally http://127.0.0.1:5173) and ask Codex to play. The launcher verifies the API identity before opening the preview; it selects another available port when necessary and records it in `data/runtime.json`. Say **turn**, **your move**, or **go** when you want Codex to continue. Codex never plays your seat. When you fold, Codex continues its own hand. There is no fallback strategy impersonating Codex.

## Page tools

`get_table` returns a public table view without your cards. `get_my_turn` adds only Codex's private cards and its legal moves. `act` submits only Codex's move, with a turn token and idempotent request ID. `next_hand` requires a completed hand ID. `get_hand_history` provides public review evidence. `wait_for_event` waits up to 15 seconds for a state change during an active agent turn; it cannot wake a chat that has finished responding.

Tools register with `document.modelContext` (or the compatible navigator surface). They require a host that supports WebMCP. The browser UI remains usable when tools are unavailable. Verify native tool availability in the actual Codex browser; registration tests alone are insufficient.

This is casual local hidden-information play. The agent view excludes opponents' cards, and public state never includes Codex's hole cards before a legitimate showdown. A person inspecting browser tools or local server data can still see private information. Use only public table information for banter; don't inspect Ali's visible browser cards while playing Codex.

## Engine and storage

`poker-ts` handles the deck, betting order, legal moves and street transitions. The server owns each turn. Settlement uses recorded contributions and best-five-of-seven hand evaluation, including side pots, folded-player exclusion, uncalled bet returns, split pots and clockwise odd chips. No arbitrary balance correction is applied. Completed hands and the profile commit together in SQLite. Existing historical bankroll and rating data are preserved; new hands do not calculate a synthetic Elo score.

The active hand survives browser refresh/reconnection, but is in server memory. Restarting the server starts a fresh hand from the last completed profile. A new hand cannot interrupt an active one. Low stacks refill with play chips between hands and the table discloses the refill.

## Development and verification

- `npm run typecheck`
- `npm test`: perspective, idempotency, legal-turn, event-wait and settlement regressions; 100 varied hands.
- `npm run build`
- Browser acceptance and blinded evaluation tasks: [docs/evals/PROTOCOL.md](docs/evals/PROTOCOL.md).

Use `CODEX_POKER_DATA_DIR=/tmp/codexpoker-eval-<run-id> npm run dev` for disposable evaluation sessions. Do not run game mutations against a personal saved profile during QA. The server binds only to loopback.

See [docs/REBUILD.md](docs/REBUILD.md) for the completion gates and current evidence.
