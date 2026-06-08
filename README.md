# CodexPoker

CodexPoker is a local-first Texas Hold'em table designed to run in the Codex preview. You play as the human seat, Codexxyyy is the Codex-controlled seat in this chat, and model-flavored local bots keep the table moving.

The app keeps a local SQLite profile with bankroll, Elo rating, recent hand results, a compact stack trail, and a table lineup drawer in the preview.

The preview is the poker table. Codexxyyy's table talk, hidden-hand reasoning, and hand-review conversation happen in the Codex chat that is running the repo.

## Quickstart

```bash
npm install
npm run dev
```

Open the preview at `http://127.0.0.1:5173`.

## Codex Bridge

Codex can inspect the live preview at any time with:

```bash
npm run game:codex
npm run game:loop
npm run game:state
npm run game:banter
```

`game:loop` is the normal play loop for Codex: it submits Codexxyyy's private recommendation when Codexxyyy is to act, fast-forwards after Ali folds, and stops safely when Ali needs to act in the preview or a hand review is ready. It never prints hidden cards.
`game:codex` is the non-mutating loop guide: it returns the safe chat line, the current mode, and the next command Codex should run without printing hidden cards or submitting an action.
`game:state` prints the current hand, recent public action trail, a `codexChat` guide for how Codexxyyy should speak in this chat, and the safest next Codex command for the current phase. On Codexxyyy's active turn it includes a `privateTurn` reference to `data/bridge/current-turn.json`, but the default state output does not print Codexxyyy's hole cards.
`game:state` intentionally does not suggest a ready `game:act` command for Codexxyyy turns; run `game:turn` first so the decision uses the private hand context.
`game:banter` prints one public-safe Codexxyyy table line for this chat. It never reads private turn files and never submits actions.

The intended loop is:

1. Run `npm run --silent game:loop`.
2. Use `suggestedMessage`, or run `npm run --silent game:banter`, to banter in this Codex chat.
3. If the output says Ali is to act, wait for Ali to move in the preview, then run `npm run --silent game:loop` again.
4. If the output says review is ready, ask Ali whether they want review or next hand.

For manual Codexxyyy debugging, run `npm run --silent game:turn` for the private Codexxyyy decision context, or `npm run --silent game:play` to submit one private recommendation. If you inspected with `game:turn`, submit only Codexxyyy's move with `npm run --silent game:act -- ...`.

When Codexxyyy is to act, the server writes:

- `data/bridge/current-turn.json`

Codex can act with:

```bash
npm run game:turn
npm run game:play
npm run game:loop
npm run game:act -- --seat uplift --turn-token <token> --action <fold|check|call|bet|raise> --amount <chips>
```

`game:turn` intentionally prints Codexxyyy's private decision packet. Use it for action selection only; table talk before showdown must come from the `chatSafe` section.
`game:play` reads that same private packet, submits the recommended Codexxyyy action, and prints safe post-action state for chat.
`game:loop` is preferred during normal play because it also handles folded-hand fast-forward and stops at the next player-facing decision.
Use `npm run --silent game:act -- ...` if you want only the JSON response without npm's script header.
`game:act` intentionally rejects non-Codexxyyy seats; Ali's actions happen through the preview controls.

After each hand, the server writes:

- `data/bridge/latest-hand.json`

That packet includes the public action history, showdown cards, bankroll/Elo deltas, and ending bankroll/Elo values for Codex hand review.

Codex can prepare the hand review with:

```bash
npm run game:review
npm run game:review -- --mode accepted
```

Use the default `game:review` output to ask in this Codex chat whether the player wants the review. If Ali says yes, run `npm run game:review -- --mode accepted` for a ready Codexxyyy review with what went right, what to revisit, and the next-hand adjustment. Keep that discussion in chat; the preview stays the poker table.

If Ali wants to skip the review and keep playing, Codex can start the next hand after a completed hand with:

```bash
npm run game:next
```

`game:next` refuses to interrupt an active hand; live decisions stay in the preview and Codexxyyy bridge commands.

## Scripts

- `npm run dev`: start Fastify and Vite together.
- `npm run game:loop`: run the safe Codex play loop; act for Codexxyyy, fast-forward after Ali folds, or stop at Ali/review.
- `npm run game:codex`: get the current safe Codex chat line and next command without mutating the table.
- `npm run game:state`: inspect the live preview and get the next Codex command.
- `npm run game:banter`: generate one public-safe Codexxyyy table-talk line for Codex chat.
- `npm run game:turn`: inspect Codexxyyy's private decision packet only when Codex is to act.
- `npm run game:play`: submit Codexxyyy's private recommended action and return safe post-action state.
- `npm run game:act`: submit a Codexxyyy action from Codex.
- `npm run game:next`: start the next hand after the completed-hand review offer.
- `npm run game:review`: read the latest completed hand for a Codex chat review.
- `npm test`: run unit and integration tests.
- `npm run test:e2e`: run Playwright browser tests.
- `npm run build`: typecheck and build the Vite app.

The dev script chooses an available local API port starting at `8797` and writes it to `data/server.json` for the CLI commands.
