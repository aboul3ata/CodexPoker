# Fable consultation: CodexPoker

Ali explicitly requested consulting Fable in the Claude app. Please advise only; do not edit implementation files.

Product: local play-money poker. Ali uses the Codex browser, Codex in the same chat is an actual opponent, four heuristic bots fill the table. The chat handles natural banter and Codex's genuine decisions. WebMCP native discovery and a real action have been verified. No bot substitutes for Codex. Ali and Codex share illustrated avatar styling; other seats are smaller geometric robots. Current design: cream paper, subdued green felt, terracotta primary actions; match table to narrow browser beside chat.

Uncertainties to critique:
1. How to make the two lead characters feel alive and clearly linked without blocking poker or filling the table with copy?
2. Action controls: human hand in bottom strip, compact Fold/Call/Raise with raise sizing popover. Is the split between table seat and bottom private cards confusing?
3. Chat proactivity: bounded event-wait works during an active turn; no established mechanism for waking finished chat. How to communicate this honestly without exposing transport details or making user babysit?
4. What are the three most important UX failure cases for blind evaluations?

You may inspect /Users/ali.abouelatta/Documents/CodexPoker/src/client/main.tsx and styles.css, but distinguish source review from actually seeing the UI. Do not navigate or mutate the game during our active test. Save recommendations to /Users/ali.abouelatta/Documents/CodexPoker/docs/evals/fable-consultation-result.md. Keep it concise and opinionated. This is consultation, not a blinded evaluation.
