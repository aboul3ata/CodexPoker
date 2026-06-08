# CodexPoker

CodexPoker is a local-first Texas Hold'em table designed to run in the Codex preview. You play as the human seat, Uplift is the Codex-controlled seat, and local bots keep the table moving.

The app keeps a local SQLite profile with bankroll, progress rating, recent hand results, and a compact stack trail in the preview.

## Quickstart

```bash
npm install
npm run dev
```

Open the preview at `http://127.0.0.1:5173`.

## Codex Bridge

When Uplift is to act, the server writes:

- `data/bridge/current-turn.json`

Codex can act with:

```bash
npm run game:act -- --seat uplift --turn-token <token> --action <fold|check|call|bet|raise> --amount <chips>
```

Use `npm run --silent game:act -- ...` if you want only the JSON response without npm's script header.

Codex can banter with:

```bash
npm run game:say -- --seat uplift --turn-token <token> --message "I think you're light here."
```

After each hand, the server writes:

- `data/bridge/latest-hand.json`

That packet includes the public action history, showdown cards, bankroll/progress deltas, and ending bankroll/progress values for Codex hand review.

Codex can prepare or post the hand review with:

```bash
npm run game:review
npm run game:review -- --post
```

`--post` adds Uplift's review note to the visible table-talk lane in the running preview.

## Scripts

- `npm run dev`: start Fastify and Vite together.
- `npm run game:act`: submit an Uplift action from Codex/chat.
- `npm run game:say`: add Uplift table talk.
- `npm run game:review`: read the latest completed hand and optionally post Uplift's review.
- `npm test`: run unit and integration tests.
- `npm run test:e2e`: run Playwright browser tests.
- `npm run build`: typecheck and build the Vite app.

The dev script chooses an available local API port starting at `8797` and writes it to `data/server.json` for the CLI commands.
