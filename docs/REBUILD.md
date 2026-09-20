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

## Current implementation evidence
- Native WebMCP discovery and a real action verified in Codex in-app browser. Active bounded wait returned when a tester clicked Call. This is not idle-chat wakeup.
- Independent fresh-context skill test independently chose a Codex move and stopped at Ali; no cards disclosed, no shell gameplay. See docs/evals/blind-play-01.md.
- Independent first-use UX evaluation found mobile side-label contrast and below-fold history disclosure issues. Fixes implemented; retest blocked when browser became unavailable.
- Fable consultation completed through native Claude app; findings applied selectively. Thinking is derived from actual turn-tool activity, never merely turn ownership.
- Old settlement auto-balancer removed. poker-ts still owns betting/dealing; explicit contribution-based settlement handles side pots and exact best-five hand ranking. Tests include 100 varied hands and exact side-pot/tie/odd-chip examples.
- Both local Codex and Claude skill folders now symlink to repository skills/codex-poker; previous folders preserved under each client's skill-backups. Skill validator passes.
- Default remote branch is master and contains newer runtime supervision/reconnect changes absent from initial checkout. Integration in progress; preserve startup identity/health verification.
- Remaining gates: upstream reconciliation, regression/build checks, complete ten-hand session, post-fix blinded UX retest, reviewed PR/merge and final local production-build verification.
- Upstream integration complete: retained supervised startup, runtime health identity and state-load retries; retired old watcher/CLI transport. 19 tests, typecheck and production build pass.
- Builder verified fixed mobile labels, visible history opening, and controls within the narrow viewport. Independent retest could not access browser; no claim of a second blind pass.
- PR #5 opened against verified default master; Codex reviewer automatically started for 995f712.

## Fixes queued after continuous session
- Native wait must finish under the host's 20-second evaluation deadline; use 15 seconds and verify timeout response live.
- Reviewer findings accepted: tool readiness race, HTTP usability during SSE outage, own cards on uncontested results. Port discovery guidance already updated; make test preview port strict.
- Clarify previous-street last action; sanitize legacy uncontested history reveals as well as folded cards.

## Final verification before review refresh
- Fresh-context ten-hand native session completed: 24 independent Codex actions, nine deals, no eleventh hand; human fold continuation, all-in, refill and Turn ownership checks passed. Full evidence in docs/evals/blind-session-10-hands.md.
- Native idle-wait regression fixed and verified: 15,044 ms, ok=true, changed=false, returned without host timeout.
- Live production-build SSE-outage check: temporary loopback proxy returned 503 only for /events. Human Call remained enabled; Codex native check succeeded; fallback HTTP refresh restored human Check in about 1.3 seconds. Proxy closed after verification.
- Accepted review findings addressed: promise-based tool readiness, runtime URL discovery, strict test preview port, HTTP fallback, persistent own-card display and safe legacy history reveal filtering.
- Remaining: final CI/browser regression results, refreshed review verdict, merge, and clean user-profile production preview.
