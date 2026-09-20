import React, { useEffect, useState, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  Card,
  GameSnapshot,
  LegalAction,
  PublicAction,
  SeatView,
} from "../shared/contracts";
import { registerPokerTools } from "./webmcp";
import "./styles.css";
import { fetchStateWithRetry } from "./state-loader";

const chips = (n: number) => n.toLocaleString("en-US");
const suits = { clubs: "♣", diamonds: "♦", hearts: "♥", spades: "♠" };
const names = {
  user: "You",
  uplift: "Codex",
  pip: "Pip",
  nova: "Nova",
  clio: "Clio",
  atlas: "Atlas",
};
const toolsReady = registerPokerTools().catch((error) => {
  console.error(error);
  return false;
});

async function request(path: string, body?: unknown): Promise<GameSnapshot> {
  const response = await fetch(
    path,
    body === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.message ?? "Could not reach the table. Try again.");
  return data.state;
}

function App() {
  const [state, setState] = useState<GameSnapshot>();
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [pending, setPending] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const stateRevision = useRef(0);
  function acceptState(next: GameSnapshot) {
    stateRevision.current += 1;
    setState(next);
  }
  const historyRef = useRef<HTMLElement>(null);
  const historyButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (historyOpen) {
      historyRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "start",
      });
      historyRef.current?.focus({ preventScroll: true });
    }
  }, [historyOpen]);
  function closeHistory() {
    setHistoryOpen(false);
    historyButton.current?.focus();
  }
  useEffect(() => {
    let alive = true;
    fetchStateWithRetry()
      .then((s) => alive && setState((current) => current ?? s))
      .catch((e) => alive && setError(e.message));
    const events = new EventSource("/events");
    events.onopen = () => setConnected(true);
    events.addEventListener("state", (e) => {
      acceptState(JSON.parse((e as MessageEvent).data));
      setConnected(true);
      setError("");
    });
    events.onerror = () => setConnected(false);
    void toolsReady.then((ready) => {
      if (alive) setReady(ready);
    });
    return () => {
      alive = false;
      events.close();
    };
  }, []);
  // HTTP remains a usable fallback while EventSource reconnects.
  useEffect(() => {
    if (connected) return;
    let alive = true;
    const timer = window.setInterval(() => {
      const revision = stateRevision.current;
      request("/api/state")
        .then((next) => {
          if (alive && revision === stateRevision.current) acceptState(next);
        })
        .catch(() => {});
    }, 1500);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [connected]);
  async function act(action: LegalAction, amount?: number) {
    if (!state || pending) return;
    stateRevision.current += 1;
    setPending(true);
    setError("");
    try {
      acceptState(
        await request("/api/action", {
          seat: "user",
          turnToken: state.turnToken,
          action: action.kind,
          ...(amount !== undefined ? { amount } : {}),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
      request("/api/state")
        .then(acceptState)
        .catch(() => {});
    } finally {
      setPending(false);
    }
  }
  async function next() {
    if (!state || pending) return;
    stateRevision.current += 1;
    setPending(true);
    setError("");
    try {
      acceptState(await request("/api/new-hand", { handId: state.handId }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const done = state?.phase === "hand-complete";
  const me = state?.seats.find((s) => s.kind === "human");
  const codex = state?.seats.find((s) => s.kind === "codex");
  const status = !connected
    ? "Reconnecting"
    : done
      ? "Hand complete"
      : state?.actingSeatId === "user"
        ? "Your move"
        : "Codex’s move";
  return (
    <main className="app">
      <header className="masthead">
        <a href="/" className="wordmark" aria-label="CodexPoker home">
          <span className="brand-suit">♠</span> Codex<span>Poker</span>
          <i>THE AFTER HOURS TABLE</i>
        </a>
        <button
          className="quiet-button"
          ref={historyButton}
          onClick={() => setHistoryOpen(!historyOpen)}
          aria-expanded={historyOpen}
        >
          Hand history <span>↗</span>
        </button>
      </header>
      <div className="table-caption">
        <span>
          <b className={connected ? "live-dot" : "live-dot offline"} />
          {status}
        </span>
        <span>
          50 / 100 <i>·</i> Play chips
        </span>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button
            onClick={() =>
              request("/api/state")
                .then(acceptState)
                .then(() => setError(""))
                .catch((e) => setError(e.message))
            }
          >
            Reconnect
          </button>
        </div>
      )}
      {!state ? (
        <div className="loading" role="status">
          <span>♠</span>Pulling up a chair…
        </div>
      ) : (
        <>
          <section className="table-scene" aria-label="Poker table">
            <div className="felt">
              <div className="felt-stitch" />
              <div className="felt-signature">
                GOOD COMPANY. BAD INTENTIONS.
              </div>
            </div>
            {state.seats.map((seat) => (
              <Seat
                key={seat.seatId}
                seat={seat}
                latest={state.publicActions
                  .filter(
                    (a) =>
                      a.seatId === seat.seatId &&
                      (done ||
                        a.street === state.street ||
                        a.action === "fold"),
                  )
                  .at(-1)}
                done={done!}
                thinking={state.codexPresence === "thinking"}
              />
            ))}
            <div className="board-area">
              <div className="pot">
                <span>{done ? "FINAL POT" : "IN THE MIDDLE"}</span>
                <strong>
                  <i className="chip-icon" />
                  {chips(state.pot)}
                </strong>
              </div>
              <div className="board" aria-label="Community cards">
                {Array.from({ length: 5 }, (_, i) => (
                  <PlayingCard
                    key={`${state.handId}-${i}-${state.board[i]?.rank ?? ""}`}
                    card={state.board[i]}
                    empty={!state.board[i]}
                  />
                ))}
              </div>
              <div className="street-label">
                {done
                  ? state.review?.winningHandName
                  : state.street === "preflop"
                    ? "The opening hand"
                    : state.street}
              </div>
              {!done && state.publicActions.at(-1) && (
                <div className="last-play">
                  {names[state.publicActions.at(-1)!.seatId]} ·{" "}
                  {actionText(state.publicActions.at(-1)!)}
                </div>
              )}
              {done && (
                <div className="result" role="status">
                  <strong>
                    {state.review?.winningSeatIds
                      .map((id) => names[id])
                      .join(" & ")}{" "}
                    {state.review?.winningSeatIds.length === 1 &&
                    state.review.winningSeatIds[0] !== "user"
                      ? "wins"
                      : "win"}
                  </strong>
                  <span>
                    {state.review!.bankrollDelta >= 0 ? "+" : "−"}
                    {chips(Math.abs(state.review!.bankrollDelta))} for you
                  </span>
                </div>
              )}
            </div>
          </section>
          <section
            className={`table-bottom ${state.actingSeatId === "user" ? "your-turn" : ""}`}
            aria-label="Your controls"
          >
            <div className="your-hand">
              <div className="hole-cards" aria-label="Your cards">
                {(me?.cards ?? me?.revealedCards ?? []).map((card, i) => (
                  <PlayingCard key={i} card={card} />
                ))}
              </div>
              <div>
                <span className="eyebrow">YOUR HAND</span>
                <strong>
                  {me?.isFolded
                    ? "You folded"
                    : done
                      ? "Until next time."
                      : "Make it interesting."}
                </strong>
              </div>
            </div>
            {done ? (
              <button
                className="primary next"
                disabled={pending}
                onClick={next}
              >
                Next hand <span>↗</span>
              </button>
            ) : state.actingSeatId === "user" ? (
              <ActionControls
                key={state.turnToken}
                actions={state.legalActions}
                pot={state.pot}
                disabled={pending}
                onAction={act}
              />
            ) : (
              <div className="waiting">
                <span className="waiting-eyes">
                  <i />
                  <i />
                </span>
                <div>
                  <strong>
                    {me?.isFolded
                      ? "You’re out. Stay for the show."
                      : state.codexPresence === "thinking"
                        ? "Codex is thinking…"
                        : state.codexPresence === "watching"
                          ? "Codex is at the table."
                          : "Your move, Codex."}
                  </strong>
                  <span>
                    {ready
                      ? state.codexPresence === "away"
                        ? "Say “turn” in chat."
                        : "The next move comes from chat."
                      : "Open in the Codex browser to play."}
                  </span>
                </div>
              </div>
            )}
          </section>
          <div className="session-foot">
            <span>
              {state.tableNotice ?? "A little rivalry between friends."}
            </span>
            <span>
              {codex?.isFolded && !done
                ? "Codex folded"
                : "YOU + CODEX / FOUR BOTS"}
            </span>
          </div>
          <div className="sr-only" aria-live="polite">
            {status}. Pot {state.pot}.
          </div>
          {historyOpen && (
            <section
              ref={historyRef}
              tabIndex={-1}
              className="history"
              aria-label="Hand history"
            >
              <div className="history-heading">
                <h2>Previously, at this table.</h2>
                <button className="quiet-button" onClick={closeHistory}>
                  Close ×
                </button>
              </div>
              <ol className="hand-actions" aria-label="Current hand actions">
                {state.publicActions.map((a) => (
                  <li key={a.seq}>
                    <span>{a.street}</span>
                    <strong>{names[a.seatId]}</strong>
                    <span>{actionText(a)}</span>
                  </li>
                ))}
              </ol>
              {state.history.length === 0 ? (
                <p>Your first story is still being written.</p>
              ) : (
                [...state.history].reverse().map((hand, i) => (
                  <div className="history-row" key={hand.handId}>
                    <span>Hand {state.history.length - i}</span>
                    <span>
                      {hand.winningSeatIds.map((id) => names[id]).join(", ")}
                    </span>
                    <strong>
                      {hand.bankrollDelta >= 0 ? "+" : "−"}
                      {chips(Math.abs(hand.bankrollDelta))}
                    </strong>
                  </div>
                ))
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}

function Portrait({ kind, id }: { kind: SeatView["kind"]; id: string }) {
  if (kind === "bot")
    return (
      <svg className="bot-portrait" viewBox="0 0 64 54" aria-hidden="true">
        <path
          d={
            id === "atlas"
              ? "M12 10H52L60 44H4Z"
              : id === "nova"
                ? "M18 5H46L58 27L46 49H18L6 27Z"
                : id === "clio"
                  ? "M10 8H54V46H10Z"
                  : "M17 7H47Q57 7 57 17V38Q57 48 47 48H17Q7 48 7 38V17Q7 7 17 7"
          }
          fill="currentColor"
        />
        <path d="M19 22h8v8h-8zm18 0h8v8h-8z" fill="#e9e4d5" />
        <path d="M25 38h14" stroke="#e9e4d5" strokeWidth="2" />
        {id === "nova" && (
          <path d="M32 5V0" stroke="currentColor" strokeWidth="3" />
        )}
      </svg>
    );
  return (
    <svg
      className={`portrait ${kind}`}
      viewBox="0 0 100 106"
      aria-hidden="true"
    >
      <path
        className="portrait-body"
        d="M8 100C8 78 26 69 50 69S92 78 92 100"
      />
      <path
        className="portrait-head"
        d="M19 39C17 9 81 8 81 39L79 64C75 83 25 83 21 64Z"
      />
      {kind === "human" ? (
        <>
          <path
            d="M19 42C7 13 31 5 52 9C80 1 91 25 80 43L72 29C58 40 43 22 29 34L26 45Z"
            fill="#313a32"
          />
          <path
            d="M34 48l8-1m17 0 8 1"
            stroke="#313a32"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path
            d="M44 63q8 5 14-2"
            stroke="#313a32"
            strokeWidth="2.5"
            fill="none"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <ellipse className="eye" cx="36" cy="46" rx="9" ry="12" />
          <ellipse className="eye" cx="63" cy="46" rx="9" ry="12" />
          <ellipse cx="39" cy="47" rx="3" ry="5" fill="#263b36" />
          <ellipse cx="66" cy="47" rx="3" ry="5" fill="#263b36" />
          <path
            d="M31 27l16 4m7-1 16-5"
            stroke="#e6e3ce"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
          <path
            d="M46 66q10 3 16-4"
            stroke="#e6e3ce"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
    </svg>
  );
}
function actionText(a: PublicAction) {
  return a.action === "raise"
    ? `Raise to ${chips(a.amount ?? 0)}`
    : a.action === "bet"
      ? `Bet ${chips(a.amount ?? 0)}`
      : a.action === "call"
        ? `Call ${chips(a.amount ?? 0)}`
        : a.action === "fold"
          ? "Fold"
          : "Check";
}
function Seat({
  seat,
  latest,
  done,
  thinking,
}: {
  seat: SeatView;
  latest?: PublicAction;
  done: boolean;
  thinking: boolean;
}) {
  const hero = seat.kind !== "bot";
  return (
    <article
      data-mood={
        seat.stack === 0 && !seat.isFolded
          ? "all-in"
          : (latest?.action ?? "idle")
      }
      className={`seat seat-${seat.seatId} ${hero ? "hero-seat" : "bot-seat"} ${seat.isToAct ? "to-act" : ""} ${seat.isFolded ? "folded" : ""} ${seat.status === "winner" ? "winner" : ""}`}
      aria-label={`${names[seat.seatId]}, ${chips(seat.stack)} chips${seat.isToAct ? ", to act" : ""}${seat.isFolded ? ", folded" : ""}`}
    >
      <div className="avatar-wrap">
        <Portrait kind={seat.kind} id={seat.seatId} />
        {seat.isButton && (
          <span className="dealer" title="Dealer">
            D
          </span>
        )}
      </div>
      <div className="seat-info">
        <div className="seat-name">
          {names[seat.seatId]}
          {hero ? (
            <span className="seat-tag">
              {seat.kind === "codex" ? "Plays from chat" : "Your seat"}
            </span>
          ) : (
            <span className="bot-tag">BOT</span>
          )}
        </div>
        <strong className="stack">{chips(seat.stack)}</strong>
      </div>
      <div className={`seat-action ${seat.isToAct ? "active" : ""}`}>
        {seat.isToAct
          ? seat.kind === "human"
            ? "Your move"
            : thinking
              ? "Thinking in chat…"
              : "Your move, Codex"
          : seat.status === "winner"
            ? "Winner"
            : seat.stack === 0 && !seat.isFolded && !done
              ? "All-in"
              : latest
                ? actionText(latest)
                : "At the table"}
      </div>
      {done && seat.revealedCards && seat.kind !== "human" && (
        <div className="revealed">
          {seat.revealedCards.map((card, i) => (
            <PlayingCard key={i} card={card} />
          ))}
        </div>
      )}
    </article>
  );
}
function PlayingCard({ card, empty }: { card?: Card; empty?: boolean }) {
  return (
    <div
      className={`playing-card ${empty ? "empty" : ""} ${card && ["hearts", "diamonds"].includes(card.suit) ? "red" : ""}`}
      aria-label={
        card
          ? `${card.rank === "T" ? "10" : card.rank} of ${card.suit}`
          : "Undealt card"
      }
    >
      {card ? (
        <>
          <span className="card-corner">
            {card.rank === "T" ? "10" : card.rank}
            <small>{suits[card.suit]}</small>
          </span>
          <span className="card-suit">{suits[card.suit]}</span>
          <span className="card-bottom">
            {card.rank === "T" ? "10" : card.rank}
          </span>
        </>
      ) : (
        <span>♠</span>
      )}
    </div>
  );
}
function ActionControls({
  actions,
  pot,
  disabled,
  onAction,
}: {
  actions: LegalAction[];
  pot: number;
  disabled: boolean;
  onAction: (action: LegalAction, amount?: number) => void;
}) {
  const wager = actions.find((a) => a.kind === "raise" || a.kind === "bet");
  const [expanded, setExpanded] = useState(false);
  const [amount, setAmount] = useState(wager?.min ?? 0);
  const min = wager?.min ?? 0,
    max = wager?.max ?? min;
  return (
    <div className="actions">
      {expanded && wager && (
        <div className="wager-panel">
          <div className="wager-top">
            <label htmlFor="wager-amount">
              {wager.kind === "raise" ? "Raise to" : "Bet"}
            </label>
            <input
              id="wager-amount"
              type="number"
              min={min}
              max={max}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </div>
          <input
            aria-label="Bet size"
            type="range"
            min={min}
            max={max}
            value={Math.max(min, Math.min(max, amount))}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <div className="presets">
            {[
              ...new Set([
                min,
                Math.max(min, Math.min(max, Math.round(pot))),
                max,
              ]),
            ]
              .map((value) => ({
                label: value === max ? "All-in" : chips(value),
                value,
              }))
              .map((p) => (
                <button
                  key={p.label}
                  onClick={() =>
                    setAmount(Math.max(min, Math.min(max, Math.round(p.value))))
                  }
                >
                  {p.label}
                </button>
              ))}
          </div>
        </div>
      )}
      <div className="action-buttons">
        {actions
          .filter((a) => a.kind !== "raise" && a.kind !== "bet")
          .map((a) => (
            <button
              key={a.kind}
              className={a.kind === "fold" ? "fold-button" : "secondary"}
              disabled={disabled}
              onClick={() => onAction(a)}
            >
              {a.kind === "call"
                ? `Call ${chips(a.toCall ?? 0)}`
                : a.kind === "check"
                  ? "Check"
                  : "Fold"}
            </button>
          ))}
        {wager && (
          <button
            className="primary"
            disabled={
              disabled ||
              (expanded &&
                (!Number.isInteger(amount) || amount < min || amount > max))
            }
            onClick={() =>
              expanded ? onAction(wager, amount) : setExpanded(true)
            }
          >
            {expanded
              ? `${amount === max ? "All-in" : wager.kind === "raise" ? "Raise to" : "Bet"} ${chips(amount)}`
              : wager.kind === "raise"
                ? "Raise ↗"
                : "Bet ↗"}
          </button>
        )}
        {expanded && (
          <button
            className="cancel-wager"
            aria-label="Cancel raise"
            onClick={() => setExpanded(false)}
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

const container = document.getElementById("root")! as HTMLElement & {
  pokerRoot?: Root;
};
container.pokerRoot ??= createRoot(container);
container.pokerRoot.render(<App />);
