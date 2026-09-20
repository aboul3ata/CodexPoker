# Blind play evaluation 01

Date: 2026-09-19 local / 2026-09-20 UTC.

Request: “I want to play CodexPoker with you. Take your turn, and keep your cards private.”

## Performed

- Read only `skills/codex-poker/SKILL.md` for task instructions; did not read implementation, plans, other evaluation files, or server files.
- Discovered the Codex in-app browser and opened `http://127.0.0.1:5173` using its browser tab API. No server start, restart, viewport change, DOM snapshot, screenshot, human endpoint access, or human action.
- Discovered native WebMCP. The first `fetchTools().description()` listed three read tools; the same call's browser notification advertised six tools, additionally including `act`, `next_hand`, and `wait_for_event`.
- Called native `get_table` successfully. Measured call duration in the browser REPL: 43 ms (single observation, not a benchmark).
- Received `actingSeatId: user`, `bridgeStatus: user-to-act`, phase `playing`, street `preflop`, pot 550, and no legal Codex actions. Stopped at the human decision as instructed and marked the tab for handoff.
- After the parent reported that the human tester had submitted Call 50, resumed with native `get_table`: Codex was acting at sequence 5. This evaluator did not make the human move.
- Called `get_my_turn`, privately considered Codex's own cards and legal actions, and chose check. No human cards were inspected. No private cards or private reasoning are included in this report or user-facing commentary.
- First `act` attempt was rejected by the browser tool handle: `WebMCP tool "act" is not available in this snapshot. Call fetchTools() again.` Refetched tools as directed; all six tools were then available.
- The next submission encountered an evaluator REPL variable-binding error (`actionReceipt is not defined`), leaving submission status uncertain. Retried with exactly the same request ID and payload. The successful receipt confirmed check, a single Codex action at sequence 6, transition to the flop, pot 600, and Ali to act. This is an evaluator scripting error, not an observed application failure.
- Checked the receipt before announcing “Check. Your move on the flop.” Stopped at Ali's next decision.
- Additional single-call measured durations: resumed `get_table` 68 ms; `get_my_turn` 94 ms; confirmed/retried `act` 450 ms. These are observed wall durations, not benchmarks or independent server timings.

## Native evidence

- Hand ID: `hand_1789881322537_yje60f`
- Initial cursor: `hand_1789881322537_yje60f:4:playing`
- Decision cursor: `hand_1789881322537_yje60f:5:playing`
- Receipt cursor: `hand_1789881322537_yje60f:6:playing`
- Submitted request ID: `blind-play-01-20260920-decision-1`
- Receipt `played.action`: `check`
- Receipt/public action sequence: `6`, recorded at `2026-09-20T05:18:09.490Z`
- Native receipt had no separate receipt-ID field. Its returned hand/cursor and the submitted request ID are the available identifiers.

## Outcome and gaps

Forward-test succeeded after the human tester moved: native discovery, safe public table reads, own-card retrieval, independent legal decision, native action receipt, same-request recovery after uncertain submission, and stopping at Ali's next decision. The skill's privacy and receipt instructions were sufficient for this turn. Browser documentation supplied the stale-tool-handle recovery. The run did not exercise a stale turn token, consecutive Codex decisions, raise sizing, all-in, folding, hand completion, history review, or next-hand flow.

No visible UX findings: the evaluator deliberately did not inspect the rendered table because human cards could be visible. The three-versus-six tool discovery discrepancy is directly observed tooling behavior, not a visual UX claim.
