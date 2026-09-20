# Blind native WebMCP session: ten completed hands

Date: 2026-09-20 UTC. Evaluator: fresh-context child agent `blind_session_eval`. Target: `http://127.0.0.1:5173`, disposable local play chips. Instructions read: `skills/codex-poker/SKILL.md`. No implementation, server files, previous evaluation reports, human private cards, human endpoints, or human actions were inspected by this evaluator. The parent tester operated the human browser seat.

Request: “Play CodexPoker with me for ten hands. Take your own turns, keep your cards private, and banter naturally.” Continuation through ten hands was explicitly authorized.

## Outcome

Completed ten hands through native in-app browser WebMCP. Every Codex action was independently selected by the model after `get_my_turn`; no script or heuristic selected decisions. All 24 `act` calls returned `ok: true` with the matching played receipt. Nine `next_hand` calls succeeded. Stopped at the tenth `hand-complete`, `actingSeatId: null`; did not deal an eleventh hand.

Native browser inventory initially contained no tabs. Created one tab through `browser.tabs.new`, navigated to the authorized URL without inspecting the human-facing DOM, then discovered all six native tools. Discovery completed in approximately 0.38 seconds. Gameplay used `get_table`, `get_my_turn`, `act`, `wait_for_event`, and `next_hand`. No shell gameplay fallback, viewport change, or implementation change occurred. `get_hand_history` was not called because review was not requested; completion receipts include public results automatically.

## Public hand receipts

Amounts below are chips; raise amounts are total street commitments. P/F/T/R denote preflop/flop/turn/river. Request IDs used `blind-hN-aM` for each independently selected action.

| # | Hand ID | Codex public decisions in order | Winner | Final pot | Public winning hand |
|---|---|---|---|---:|---|
| 1 | `hand_1789882200324_tqhj5f` | P check; F check; T bet 400; R check, call 1,250 | Codex | 7,550 | Straight |
| 2 | `hand_1789882604722_j9h4op` | P fold | Pip | 7,900 | Pair |
| 3 | `hand_1789882760892_80v4z5` | P fold to human all-in 8,000 | Clio | 14,750 | Pair |
| 4 | `hand_1789882839161_uvxpku` | P fold | Pip | 10,300 | Flush |
| 5 | `hand_1789882960482_ay5199` | P fold | Clio | 7,100 | Three of a kind |
| 6 | `hand_1789883115693_ykr4t1` | P raise to 350; F bet 1,200; T check; R check | Pip | 6,900 | Straight |
| 7 | `hand_1789883359791_mp1haw` | P check; F check, fold | Ali | 5,900 | Pair |
| 8 | `hand_1789883666513_mnk154` | P call 50; F check, fold | Ali | 4,200 | Three of a kind |
| 9 | `hand_1789883899732_o4mbcq` | P fold | Clio | 5,450 | Straight |
| 10 | `hand_1789884103132_j0pnik` | P call 100; F check; T call 500; R fold | Clio | 4,900 | Straight |

First Codex action receipt: 2026-09-20T05:34:41.768Z. The tenth hand completed after the final river response. This was a serial interaction test; human coordination and model deliberation dominate session elapsed time, so it is not a throughput benchmark.

## Verified behavior

- Human folding did not terminate Codex play: hand 1 continued through five Codex decisions to showdown.
- Consecutive Codex turns were handled immediately rather than left hanging: hand 1 preflop/flop and hand 8 preflop/flop.
- Human all-in was processed normally in hand 3; Codex chose its own fold. Hand 4 exposed a public play-chip refill notice returning Ali to 10,000.
- Human ownership remained intact. In hand 9 the tester said “Turn” while the public state still named `user`. `get_table` confirmed cursor `hand_1789883899732_o4mbcq:10:playing` unchanged; no action was submitted. The evaluator replied that it was still the human decision, 600 to call.
- Cards and private reasoning were not disclosed in table talk, coordination messages, or this report. `get_my_turn` necessarily returned Codex's own private cards in tool activity, consistent with the skill's stated casual-play boundary.
- Public table talk stayed sparse: “Eight thousand before the flop. Subtle.” after the human all-in; “350. Apparently everyone is coming.” after the raise receipt and four calls; “There you go. The chips found their way back.” after Ali's public win. These lines were delivered to the parent tester as table-talk suggestions rather than a separate visible live chat, so full end-user banter presentation was not tested.

## Failure and recovery

One reproducible native transport failure: `wait_for_event` can consume the browser command's entire approximately 20-second allowance. Eight idle waits returned `Timed out running CDP command "Runtime.evaluate" for tab 1` rather than a structured no-change result: hand 2 preflop; hand 5 preflop; hand 7 preflop and flop response; hand 9 flop; hand 10 preflop, flop, and turn.

Successful event waits returned immediately when the human had already acted, or after approximately 0.58–19.81 seconds when the action occurred during the wait. One near-limit successful wait took 19.81 seconds, reinforcing the lack of timeout headroom. Ordinary individual read/action/deal calls generally completed around 0.04–0.16 seconds; the largest observed individual read was about 0.31 seconds. These are displayed tool wall times, not isolated server processing measurements.

Each failed wait was read-only. The evaluator did not retry an action or manufacture a move. It yielded to the tester's move notification, refreshed with `get_table`, and then read its own turn if applicable. Refreshes succeeded without reloading the page, replacing handles, or duplicating moves. The final human river action used message coordination instead of another idle wait after the parent explicitly requested no further reproduction.

Recommended fix: bound the page event wait comfortably below the host browser command deadline, then verify both structured idle timeout and post-timeout resume through the actual native browser tool. Do not treat a server-only wait test as proof of native timeout behavior.

## Limits

Ten hands establish that a fresh agent can discover and operate the intended native tools, own its decisions, preserve human ownership, finish multi-turn hands, and stop at the requested count. This run did not deliberately inject stale tokens, uncertain mutation responses, duplicate request IDs, reload/reconnect, or network loss. It does not establish strategic poker quality, anti-cheating security, or unattended wakeup support. No such claims were made.
