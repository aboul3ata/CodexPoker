# CodexPoker Design System

## Direction

Approved direction: **Arcade Study Table**. The table should feel like a chunky flat-mascot learning game: readable poker first, model-seat transparency second, playful character identity throughout.

Reference artifact:

- `/Users/ali.abouelatta/.gstack/projects/CodexPoker/designs/codex-poker-table-20260608/design-board.html`
- Approved variant: B

## Tokens

- Felt: `#22a77f`, `#39c7a0`
- Ink: `#17323b`
- Surface: `#fffef1`, `#f7fbff`
- Codex/status blue: `#206dff`
- Learning yellow: `#f9d84a`
- Action coral: `#f25f5c`
- Muted text: `#5f7178`
- Radius: 14px for HUD chips, 22px for table panels, 999px only for badges.
- Motion: short state-change transitions under 180ms; no blocking reward animation.

## Typography

Use a rounded display face for headings and a friendly readable sans for UI. The implementation loads local fallbacks, then falls back to common rounded sans faces. Do not use Inter, Roboto, Arial, or system defaults as the intended identity.

## Components

- Table scene: central gameplay canvas with a stable pot/board area and visible current-turn ownership.
- Seat: avatar, cute name, stack, provider/model subtitle, and current/folded/winner status.
- Action footer: legal poker actions only; disabled states include reasons.
- Codex chat bridge: Uplift table talk and review back-and-forth happen in the Codex chat, not in the preview UI.
- Review scene: result delta, one Uplift lesson, decision timeline, and `Next hand`.
- Settings drawer: provider/seat setup and accessibility switches.

## Accessibility

- 44px minimum controls.
- Visible focus ring on all interactive elements.
- ARIA live region for current-turn changes.
- Reduced-motion mode disables card/chip movement and reward motion.
- Color is never the only indicator for suit, status, error, or turn ownership.
