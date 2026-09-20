# CodexPoker rebuild

Accepted outcome: Ali and the Codex in this chat play a real local play-money game against four local bots. Browser is the table; chat is the conversation. Codex chooses all its own moves, including after Ali folds. Ali and Codex share a distinct expressive visual language; bots use a quieter mechanical language.

## Completion gates
- Native WebMCP discovery and action in Codex's actual browser, not only registration or a mock.
- Perspective-specific state: human sees own cards, Codex receives only its own private cards, public results reveal only eligible showdown cards. No deck or bot private cards in agent tools.
- Legal moves, stale-turn rejection, retry idempotency, exact settlement and chip conservation including side pots.
- Bounded event waiting tested live; no claim of idle-chat wakeup without evidence.
- Ten continuous hands through real browser/tool interaction without manual recovery or simulated Codex decisions.
- Responsive table and controls, keyboard/focus/reduced motion, correct loading/error/reconnection behavior.
- Blinded evaluations with fresh context, neutral tasks, concrete observations, and revision after findings.
- Fable consultation through Claude app when decisions are uncertain.
- Delete obsolete CLI/file bridge and canned copy after replacement verified; preserve saved data.
- Ship through reviewed PR and leave verified app open in Codex.

## Implementation sequence
1. Native connection and perspective-safe API.
2. Engine/session correctness and replace turn orchestration.
3. New table, avatars, controls and event reactions.
4. Blinded play and UX evaluation; fix findings.
5. Remove legacy paths, documentation/skill, ship and verify.

## Evidence log
- Initial inspection: pre-existing uncommitted createRequire import correction in game-service.ts; preserve.
- Current normal CLI loop selects heuristic actions. Fast-forward also substitutes for Codex. Browser playback delays actions 2–4 seconds and combines delayed history with current state.
- OpenAI documentation uses document.modelContext.registerTool at page top level. Host availability and unsolicited wakeup must be tested.
