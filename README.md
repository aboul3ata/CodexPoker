# CodexPoker

CodexPoker is a local-first Texas Hold'em table designed to run in the Codex preview. You play as the human seat, Uplift is the Codex-controlled seat, and local bots keep the table moving.

The app keeps a local SQLite profile with bankroll, Elo rating, recent hand results, and a compact stack trail in the preview.

The preview is the poker table. Uplift's table talk, hidden-hand reasoning, and hand-review conversation happen in the Codex chat that is running the repo.

## Quickstart

```bash
npm install
npm run dev
```

Open the preview at `http://127.0.0.1:5173`.

## Codex Bridge

Codex can inspect the live preview at any time with:

```bash
npm run game:state
```

That prints the current hand, recent public action trail, a `codexChat` guide for how Uplift should speak in this chat, and the safest next Codex command for the current phase. On Uplift's active turn it also includes the matching sanitized `codexTurn` packet with Uplift's hole cards. Those cards are private to Codex/Uplift and should not be revealed in chat before showdown.

The intended loop is:

1. Run `npm run --silent game:state`.
2. Use `codexChat.tableTalkCue` and `codexChat.publicTableStory` to banter in this Codex chat.
3. If `codexTurn` is present, use its hole cards privately to choose an Uplift action.
4. Submit only Uplift's move with `npm run --silent game:act -- ...`.

When Uplift is to act, the server writes:

- `data/bridge/current-turn.json`

Codex can act with:

```bash
npm run game:act -- --seat uplift --turn-token <token> --action <fold|check|call|bet|raise> --amount <chips>
```

Use `npm run --silent game:act -- ...` if you want only the JSON response without npm's script header.

After each hand, the server writes:

- `data/bridge/latest-hand.json`

That packet includes the public action history, showdown cards, bankroll/Elo deltas, and ending bankroll/Elo values for Codex hand review.

Codex can prepare the hand review with:

```bash
npm run game:review
```

Use that packet to ask in the Codex chat whether the player wants the review, then discuss the hand there.

## Scripts

- `npm run dev`: start Fastify and Vite together.
- `npm run game:state`: inspect the live preview and get the next Codex command.
- `npm run game:act`: submit an Uplift action from Codex.
- `npm run game:say`: low-level compatibility helper for app messages; normal table talk belongs in the Codex chat.
- `npm run game:review`: read the latest completed hand for a Codex chat review.
- `npm test`: run unit and integration tests.
- `npm run test:e2e`: run Playwright browser tests.
- `npm run build`: typecheck and build the Vite app.

The dev script chooses an available local API port starting at `8797` and writes it to `data/server.json` for the CLI commands.
