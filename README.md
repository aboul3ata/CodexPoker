# CodexPoker

CodexPoker is a local-first Texas Hold’em game built around one continuous Codex task. Ali plays on the table in the Codex preview; Codexxyyy acts, banters, and reviews hands in the main Codex chat. The preview stays table-only.

## Play

1. Clone this repository.
2. Open the repository in Codex.
3. Say: **Play CodexPoker.**

The repo-native CodexPoker skill installs dependencies when needed, starts and verifies the local runtime, opens the discovered preview URL in the Codex in-app Browser, and keeps the same task alive while you play. Startup progress and any recovery diagnostics appear in chat.

Supported local tooling:

- Node `^20.19.0 || >=22.12.0`
- npm `10.9.8` (pinned by `packageManager`)

The recommended Node version is recorded in both `.nvmrc` and `.node-version`.

## Runtime commands

```bash
npm run --silent game:start -- --json
npm run --silent game:doctor -- --json
npm run --silent game:watch
```

- `game:start` reuses a healthy runtime or launches a supervised Fastify-then-Vite runtime. Its JSON includes the verified `previewUrl`, `apiUrl`, runtime ID, PID, and reuse status.
- `game:doctor` checks Node compatibility, native SQLite loading, the repo skill, runtime/process health, port 5173 handling, and preview reachability.
- `game:watch` holds a public-safe watcher lease and returns when the table changes. Its events exclude hole cards, legal/private recommendations, reviews, and turn tokens.

Runtime metadata is stored in `data/runtime.json`. It is versioned, contains no secrets, and is trusted only when its process is alive and its health identity matches. Explicit `CODEX_POKER_SERVER_URL` configuration takes precedence. Structured runtime logs are written to `data/logs/runtime.log`.

## Codex play commands

- `npm run --silent game:loop` — safely advances Codexxyyy, fast-forwards after Ali folds, or stops at Ali/review.
- `npm run --silent game:state` — prints public-safe state and the next Codex step.
- `npm run --silent game:banter` — produces public-safe table talk for the main chat.
- `npm run --silent game:review -- --mode accepted` — prepares a review only after Ali accepts it.
- `npm run --silent game:next` — starts a hand only after Ali chooses next hand in chat.

Private debugging commands (`game:turn`, `game:play`, and `game:act`) are for Codexxyyy action selection only. Their private output must never be copied into chat.

## Development

```bash
npm install
npm test
npm run build
npm run test:e2e
```

`npm run dev` uses the same deterministic supervisor as `game:start`: Fastify becomes healthy first, then Vite starts on an available preview port, then the proxied health endpoint is verified.
