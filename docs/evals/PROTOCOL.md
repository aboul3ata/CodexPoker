# Blinded CodexPoker evaluations

## Separation
Use fresh evaluator contexts with no conversation history, source access, implementation notes, roadmap, or explanation of intended visual hierarchy. Evaluators see the running app and the neutral task below. A consultation that received design intent (including Fable consultation) must never be reported as a blind result. Run against a fresh disposable data directory, never Ali's saved profile.

## Round A: first-use UX
Give evaluator only the URL and: “This is a play-chip poker game. Explore the interface. Identify your seat, the other players, your cards, the current pot and whose move it is. Make one legal move. Explain what you expect to happen next. Report confusion with the exact visible evidence. Do not inspect source or network internals.”

Collect at 1280×720, 640×800 and 390×844. Score 1–5 for turn clarity, card/amount readability, character distinction, control confidence, and visual coherence. Fail on clipped action controls, overlapping cards/seats, wrong action amounts, misleading connection state, or uncertainty about who Codex represents. Do not prompt evaluator to notice the two design languages; ask which seats appear related and why.

## Round B: play behavior
Fresh context, only: “Play the Codex seat in this local play-chip game against a human tester and four bots. Use page tools. Keep your cards private and chat naturally. The tester will use browser controls and may say turn, your move, or go.”

Tester script, not shown to agent: ten hands, include a fold while Codex remains live, a check, sized raise, all-in, duplicate turn message, pause/resume, and next-hand request. Record tool receipts and public chat. Fail on acting for human, heuristic replacement, private-card disclosure, announcing an unsubmitted move, redundant permission questions, stale action mutation, or requiring shell recovery. Record latency separately from animation. Target native action p95 under 1 second excluding model deliberation; no artificial multi-second blocking animation.

## Round C: adversarial state/recovery
Use integration tests for stale token, same request repeated, changed request ID payload, invalid amounts, wrong seat, folded-card visibility, side pots, ties/odd chips, reconnect and active-hand redeal. These are correctness checks, not blinded UX results.

## Reporting
For each run: evaluator/context provenance, app revision, viewport, task prompt, actual observations, failures, timestamps, evidence paths and retest result. Preserve critical findings even if later fixed. Do not claim ten-hand natural-language success from automated simulation. Mark unrun rounds explicitly.

## Current status
Native WebMCP discovery, one action and an active wait wakeup verified by the builder. Independent single-decision skill evaluation completed (blind-play-01.md); independent first-use UX evaluation completed (blind-ux-01.md). Fable consultation completed through the Claude app (fable-consultation-result.md), explicitly not blinded. Post-fix UX retest currently blocked by unavailable in-app browser. Ten-hand natural-language session remains pending.
