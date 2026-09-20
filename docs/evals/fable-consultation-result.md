# Fable consultation result: CodexPoker

Consultation, not a blind result. Fable (Claude app) read `docs/evals/fable-consultation.md`, `src/client/main.tsx`, `src/client/styles.css`, `src/client/webmcp.ts` and `docs/evals/PROTOCOL.md`. Fable did **not** render, navigate or mutate the game, and no screenshots exist in the repo. Every layout claim below is inferred from CSS and needs a render to confirm. No implementation files were edited.

## Headline

The table is well built and the visual system is coherent. The three things that will hurt you in a blind run are not aesthetic: Codex's identity is explained only in 7–8px caps that vanish at narrow widths, the waiting state is one unconditional sentence that is wrong half the time, and the raise presets can silently produce a different number than the label promises. Fix those before Round A.

## 1. Two lead characters: alive and linked, without copy

What the source does today: both hero seats share a paper card, portrait scale and the vertical axis (Codex top, You bottom). That geometry is already the strongest link on the page. The copy that tries to reinforce it is doing almost nothing: `CHAT RIVAL` and `THE INSTIGATOR` are 7px, `YOU + CODEX / FOUR BOTS` is 8px and hidden below 740px, and the felt signature and footer line are decoration.

Opinion: the link should be **behaviour and geometry, not labels**.

- **Same sentence in both panes.** The cheapest, strongest link needs no pixels: when Codex acts, its chat message should contain the exact string the table shows ("Raise to 300"). The user reads it in chat, sees it in the seat pill, and the two characters become one. This belongs in the tool description / system prompt for the Codex seat, not the UI.
- **Render `status: 'thinking'`.** The contract has it; the UI never uses it. That is the one state that makes Codex feel alive (deliberating) and it is invisible. Show it in the seat pill ("Thinking in chat…") and let the portrait's eyes drift toward the chat side. Keep the blink you already have for to-act.
- **Cut the tags, keep one functional descriptor.** Drop `THE INSTIGATOR` (does not say "you"). Replace `CHAT RIVAL` with something literal and slightly larger: "plays from chat". The name "You" already carries the human seat.
- **Copy budget:** zero decorative copy on the felt, one line under the table. Right now there are three ("GOOD COMPANY. BAD INTENTIONS.", "A little rivalry between friends.", "YOU + CODEX / FOUR BOTS"). Pick one. The felt signature is the first to go.
- **Facing.** Mirror one portrait so the two heroes face each other across the pot. Free, and it reads as a relationship without a word.

## 2. Action controls: seat on the felt, cards and buttons in the strip

The split is a standard poker-client convention and is not confusing by itself. What is missing is the **bridge**: when it is your move, the seat gets a gold ring (`.to-act.hero-seat`) but the strip, where the decision actually happens, has no to-act styling at all. The eye is pulled to the felt and then has to hunt below the divider.

- **Light the strip on your turn.** Apply the same gold accent (border or left rule) to `.table-bottom` when `actingSeatId === 'user'`. One colour, two places, same meaning. This is the single highest-value change in this section.
- **Fix the presets.** For a raise, `wager.kind === 'raise'` means "raise to", but `½ pot` and `Pot` are computed from the pot alone and clamped to `min`. Preflop against a 100 big blind with a 150 pot, ½ pot is 75, clamped to the 200 minimum, so two differently labelled buttons produce the identical number. That is a "wrong action amount" failure under the protocol. Use raise-to sizes: Min, 2.5×, Pot (call + pot), All-in.
- Two-tap commit (Raise ↗ then "Raise to N") is right. Keep it. The × cancel is fine.
- Fold as transparent grey text is a good de-emphasis. Do not make it louder.
- Disabled state is only opacity. After you tap Call there is no "sent" beat before the strip flips to waiting. Fine for v1, but if the server is slow the user will double-check the tap.
- The decorative strip copy ("Make it interesting.", "Until next time.") is harmless but is the first thing to remove if you need width at 390.

## 3. Chat proactivity: honest without transport talk or babysitting

The truth today: during Codex's active chat turn, `wait_for_event` lets it notice your action within 20 seconds. Once its chat turn ends, nothing wakes it. The UI currently says "Say 'turn' in chat." **every** time it is not your move, which makes the user babysit even when Codex is awake and waiting.

Opinion: model this as a **seat state**, not a transport detail. The server knows whether an agent wait is in flight. Derive one of three states and let the strip say only that:

| Server knows | Strip copy | Eyes |
|---|---|---|
| Codex's turn, or wait in flight | "Codex is thinking…" | open |
| Wait open, not Codex's turn | "Codex is watching. Go ahead." | open |
| No wait for > 20s | "Codex stepped away. Say 'turn' in chat." | closed |

- The user never sees "wait", "cursor" or "tool". They see a character that is present or not.
- Babysitting only happens in the third row, and the UI tells them the moment it is needed rather than always.
- Never fake presence. The `waiting-eyes` blob is constant decoration; make it mean something (open vs closed) or remove it.
- The chat side must agree. When Codex times out it should end with the same handoff line ("Your move. Say 'turn' when you've acted."). One trigger word. The protocol lists "turn, your move, or go"; the UI says "turn". Pick "turn" everywhere.
- Round A has **no chat at all**. In a non-Codex browser `ready` is false and the strip says "Open in the Codex browser to play." That is a dead end with no explanation of what Codex is. Add one sentence: "Codex plays its seat from the chat beside this window."

## 4. Three UX failure cases most likely in a blind run

1. **"Who is Codex?"** At 640 and 390 the only explanation of Codex is a 7px tag. An evaluator will plausibly report both hero seats as AI characters or Codex as a fifth bot. The protocol fails on exactly this. Fix: the "plays from chat" descriptor and the one-line footer, shown at every width.
2. **Hung or mislabelled waiting state.** After the evaluator acts, Codex never moves (no agent in Round A), and the strip says "The ball's in Codex's court." forever. Separately, the masthead status is `actingSeatId === 'user' ? 'Your move' : 'Codex's move'`, so any bot's turn is labelled as Codex's. If bots act synchronously this never shows; if a render ever catches a bot to-act, it is a visible lie. Use the acting seat's name.
3. **Raise amount surprises.** The clamped presets (see §2) let a user press "½ pot" and commit a number that is not half the pot. Blind evaluators check the label against the amount; this fails "wrong action amounts".

Also render-check before Round A (cannot confirm from CSS): overlap of `.result` (below the board) with the user seat's "Your move" pill at hand-complete on short heights; the 260px wager popover clipping at 390 (it is `width: 100%` there, but it is absolutely positioned above the buttons); and the hand-history section, which the top-right button toggles but which renders **below** the footer, so in a narrow browser beside chat the click appears to do nothing.

## Smaller source-level notes

- Empty board slots draw a 30px ♠; at a glance it can read as a dealt card. Lower the opacity or use a dot.
- Bankroll delta is shown "for you" only. Showing Codex's delta on its seat at hand-complete strengthens the rivalry more than any tagline.
- `aria-live` status plus pot is good. Add the acting seat name to it.
- The blink and win-nod are the right amount of motion. Do not add more.
