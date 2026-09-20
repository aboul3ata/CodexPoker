# Independent first-use UX evaluation

Evaluated the UI only at `http://127.0.0.1:5173/`, using native CUA in-app browser tools. No source, plans, skills, other reports, game moves, or private game tools were read. Opened and closed Hand history. Tested 640×800 and 390×844, then reset the viewport. Observed one static flop decision; later game states and betting interactions were not tested.

## What I understood on first use

- I am **You**, the large human portrait at the bottom, with **9,900** chips. My cards are **9♥ and 10♣**, shown separately underneath the table.
- **Codex**, the large character across from me, is my **CHAT RIVAL**. The other four players are **Pip, Nova, Clio, Atlas**, each with 9,900 chips in the accessibility tree. Atlas has a dealer **D** marker.
- The pot is **600**, prominently displayed under **IN THE MIDDLE**. The flop is **8♣ 7♦ 5♥**, with two undealt slots.
- It is clearly **my move**: the top status, yellow label above my portrait, portrait outline, and enabled-looking Fold / Check / Bet controls agree. The last action reads **Codex · Check**.
- I expect to choose Check or Bet, then wait for the next player. Check should cost nothing; Bet's arrow suggests another step to choose an amount. The UI does not tell me who acts next. I would expect another community card only after the remaining players finish this betting round.
- **You and Codex appear related as the two principal rivals**: large rounded portrait cards, distinct character art, opposing positions, and personal subtitles. The other four appear related to one another as supporting bots: identical small robot treatment and reduced seat size. At narrow widths their BOT labels disappear, so I infer bot identity mainly from the art. The full-width footer explicitly confirms “YOU + CODEX / FOUR BOTS.” Nothing suggested a team or shared bankroll.

## Direct visual and DOM evidence

### 640×800

CUA screenshot showed the complete table, all six seats, my cards, controls and footer in a single viewport. All player names and stacks were readable. Community-card ranks and the pot were especially easy to scan. The human and Codex portraits had stronger hierarchy than the small robot seats. The theme was consistent: cream paper, green felt, orange Bet button, friendly illustrated characters.

Minor readability costs: role subtitles, table slogan and “YOUR HAND” are extremely small; the side seats and their status labels feel compressed. “50 / 100” assumes familiarity with blinds. “IN THE MIDDLE” communicates the pot visually, but is less explicit than “Pot.” Neither issue prevented understanding.

### 390×844 — significant seat readability defect

CUA screenshot showed all four side player labels/stacks partly disappearing along the curved outer table edge. Pip and Nova were partly legible; Clio and Atlas were especially damaged. White portions of text beyond the felt effectively disappeared into the cream background. The visible failure follows the oval edge, rather than the rectangular browser edge. I cannot determine the implementation cause from this UI-only evaluation.

DOM/AX still exposed the complete labels: `article "Pip, 9,900 chips"`, `article "Nova, 9,900 chips"`, `article "Clio, 9,900 chips"`, and `article "Atlas, 9,900 chips"`. Pip's DOM rectangle was x=16, y=248.015625, width=54, height=82—inside the 390-pixel viewport. Its article and ancestors reported `overflow: visible`. This supports a visual rendering/contrast defect rather than missing player data or a seat extending beyond the viewport.

My seat, Codex, pot, community cards, and hole cards remained readable. Main controls became large, easy-to-distinguish buttons along the bottom. Fold remained visually subdued but readable. There was no horizontal page overflow observed. The footer sat very close to the lower edge; DOM page height was 846 against an 844-pixel viewport.

### History disclosure — weak response feedback

Clicking **Hand history ↗** changed the AX button to expanded and added a **Hand history** region, **Previously, at this table.** heading, **Close ×**, and six current-hand action rows. However, the immediate mobile screenshot appeared unchanged: the panel was appended beneath the visible screen rather than brought into view. DOM measurement placed it at y=830, height=377.1875. Its first meaningful heading was below the initial viewport, so a first-time user could reasonably think the button did nothing.

After scrolling down, the panel was readable and well aligned. It showed Pip, Nova, Clio and Atlas calling 100; You calling 50; and Codex checking, all labeled Preflop. Below that it said “Your first story is still being written.” This copy is charming, but does not explicitly explain that no completed hand exists yet. The table's last-action label was “Codex · Check” on the flop while the history's shown check was labeled Preflop; the UI did not explain this distinction. I did not infer a game-engine error from this single snapshot.

## Scores

| Dimension | Score | Reason |
|---|---:|---|
| Turn clarity | 5/5 | Several consistent cues make the current human decision unmistakable. |
| Card/amount readability | 3/5 | Cards and pot are strong; mobile opponent names/stacks visibly fail. Would be 4/5 at 640 pixels. |
| Control confidence | 4/5 | Check and Bet are clear and large; Bet amount flow remains untested, and history gives poor immediate feedback. |
| Visual coherence | 4/5 | Distinctive, cohesive atmosphere and clear principal-rival hierarchy; mobile side-seat rendering breaks an otherwise polished composition. |

## Most valuable fixes

1. Make every side player name and stack fully readable at 390 pixels. Keep each label on a consistently contrasting surface, independent of the oval felt boundary.
2. Bring expanded history into view, or provide an unmistakable visual response near its trigger.
3. Preserve the current clear human-turn and pot hierarchy while fixing narrow layouts. The stronger treatment of You and Codex is understandable without explanation.

Evidence consists of direct CUA screenshots and DOM/AX observations from this evaluation; screenshots were inspected in tool output, not exported to separate files. No game state was changed. Hand history was closed and the temporary viewport override was reset before completion.
