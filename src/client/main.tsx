import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Bot, ChevronRight, RotateCcw, Sparkles, Zap } from 'lucide-react'
import type { Card, GameSnapshot, HandHistoryPoint, LegalAction, SeatId, SeatView } from '../shared/contracts'
import './styles.css'

const avatarBySeat: Record<SeatId, string> = {
  user: '/assets/generated/user.svg',
  uplift: '/assets/generated/uplift.svg',
  pip: '/assets/generated/pip.svg',
  nova: '/assets/generated/nova.svg',
  clio: '/assets/generated/clio.svg',
  atlas: '/assets/generated/atlas.svg'
}

function App() {
  const [state, setState] = useState<GameSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchState().then(setState).catch((err) => setError(err.message))
    const events = new EventSource('/events')
    events.addEventListener('state', (event) => {
      setState(JSON.parse((event as MessageEvent).data))
      setError(null)
    })
    events.onerror = () => setError('Live table connection dropped. The HTTP controls still work.')
    return () => events.close()
  }, [])

  const userSeat = state?.seats.find((seat) => seat.seatId === 'user')
  const isUserTurn = state?.actingSeatId === 'user'
  const isUpliftTurn = state?.actingSeatId === 'uplift'
  const canFastForward = Boolean(userSeat?.isFolded && state?.phase === 'playing')

  async function post(path: string, body?: unknown) {
    setError(null)
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    })
    const payload = await response.json()
    if (!response.ok) {
      setError(payload.message ?? 'Something went wrong.')
      return
    }
    setState(payload.state)
  }

  async function submitAction(action: LegalAction, amount?: number) {
    if (!state) return
    await post('/api/action', {
      seat: 'user',
      turnToken: state.turnToken,
      action: action.kind,
      amount: action.kind === 'bet' || action.kind === 'raise' ? amount ?? action.min : undefined
    })
  }

  if (!state) {
    return (
      <main className="boot">
        <div className="loader-chip" />
        <h1>Shuffling the classroom table</h1>
        <p>Loading local poker state.</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="top-rail" aria-label="Session status">
        <div className="brand-lockup">
          <div className="brand-mark">CP</div>
          <div>
            <h1>CodexPoker</h1>
            <p>{state.sessionGoal}</p>
          </div>
        </div>
        <Stat label="Bankroll" value={formatChips(state.bankroll)} />
        <Stat label="Elo" value={String(state.rating)} />
        <div className={`bridge-pill ${state.bridgeStatus}`}>
          <Zap size={16} />
          {bridgeLabel(state.bridgeStatus)}
        </div>
      </section>

      <section className="play-layout">
        <section className="table-column" aria-label="Poker table">
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          {state.tableNotice ? <div className="table-notice">{state.tableNotice}</div> : null}
          <PokerTable state={state} />
          <ActionFooter
            state={state}
            isUserTurn={isUserTurn}
            isUpliftTurn={isUpliftTurn}
            canFastForward={canFastForward}
            onAction={submitAction}
            onFastForward={() => post('/api/fast-forward')}
            onNextHand={() => post('/api/new-hand')}
          />
        </section>
        <ReviewPanel state={state} onNextHand={() => post('/api/new-hand')} />
      </section>

      <div className="sr-live" aria-live="polite">
        {state.actingSeatId ? `${seatName(state, state.actingSeatId)} to act` : 'Hand complete'}
      </div>
    </main>
  )
}

async function fetchState(): Promise<GameSnapshot> {
  const response = await fetch('/api/state')
  const payload = await response.json()
  return payload.state
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function PokerTable({ state }: { state: GameSnapshot }) {
  const seats = state.seats
  return (
    <section className="felt-stage">
      <div className="table-felt">
        {seats.map((seat, index) => (
          <Seat seat={seat} key={seat.seatId} index={index} />
        ))}
        <div className="board-zone">
          <div className="street-label">{state.street}</div>
          <div className="pot">
            <img src="/assets/generated/chip.svg" alt="" />
            <span>{formatChips(state.pot)}</span>
          </div>
          <div className="community-cards" aria-label="Community cards">
            {Array.from({ length: 5 }).map((_, index) => (
              <PlayingCard card={state.board[index]} key={index} muted={!state.board[index]} />
            ))}
          </div>
        </div>
        <div className="hero-hand" aria-label="Your hole cards">
          {(state.seats.find((seat) => seat.seatId === 'user')?.cards ?? []).map((card, index) => (
            <PlayingCard card={card} key={`${card.rank}-${card.suit}-${index}`} large />
          ))}
        </div>
      </div>
    </section>
  )
}

function Seat({ seat, index }: { seat: SeatView; index: number }) {
  return (
    <article className={`seat seat-${index} ${seat.isToAct ? 'to-act' : ''} ${seat.isFolded ? 'folded' : ''}`}>
      <img src={avatarBySeat[seat.seatId]} alt={`${seat.name} avatar`} />
      <div>
        <strong>{seat.name}</strong>
        <span>{seat.providerLabel}</span>
      </div>
      <small>{formatChips(seat.stack)}</small>
      {seat.bet > 0 ? <em>{formatChips(seat.bet)}</em> : null}
      {seat.revealedCards?.length ? (
        <div className="seat-cards" aria-label={`${seat.name} revealed cards`}>
          {seat.revealedCards.map((card, cardIndex) => (
            <MiniCard card={card} key={`${seat.seatId}-${card.rank}-${card.suit}-${cardIndex}`} />
          ))}
        </div>
      ) : null}
    </article>
  )
}

function MiniCard({ card }: { card: Card }) {
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <span className={`mini-card ${red ? 'red' : 'black'}`}>
      {card.rank}{suitSymbol(card.suit)}
    </span>
  )
}

function PlayingCard({ card, muted, large }: { card?: Card; muted?: boolean; large?: boolean }) {
  if (!card) {
    return <div className={`playing-card empty ${large ? 'large' : ''}`}><img src="/assets/generated/card-back.svg" alt="Hidden card" /></div>
  }
  const red = card.suit === 'hearts' || card.suit === 'diamonds'
  return (
    <div className={`playing-card ${red ? 'red' : 'black'} ${muted ? 'muted' : ''} ${large ? 'large' : ''}`}>
      <span>{card.rank}</span>
      <b>{suitSymbol(card.suit)}</b>
    </div>
  )
}

function ActionFooter({
  state,
  isUserTurn,
  isUpliftTurn,
  canFastForward,
  onAction,
  onFastForward,
  onNextHand
}: {
  state: GameSnapshot
  isUserTurn: boolean
  isUpliftTurn: boolean
  canFastForward: boolean
  onAction: (action: LegalAction, amount?: number) => void
  onFastForward: () => void
  onNextHand: () => void
}) {
  if (state.phase === 'hand-complete') {
    return (
      <footer className="action-footer complete">
        <button className="primary-action" onClick={onNextHand}>
          Next hand <ChevronRight size={18} />
        </button>
      </footer>
    )
  }

  return (
    <footer className="action-footer">
      {isUserTurn ? (
        <UserActionPanel state={state} onAction={onAction} />
      ) : isUpliftTurn ? (
        <>
          <div className="waiting-copy">
            <Bot size={18} />
            Uplift is thinking.
          </div>
        </>
      ) : canFastForward ? (
        <button className="primary-action" onClick={onFastForward}>
          <RotateCcw size={18} /> Simulate to result
        </button>
      ) : (
        <div className="waiting-copy">Local bots are moving.</div>
      )}
      {canFastForward ? (
        <button className="secondary-action" onClick={onFastForward}>Fast-fold result</button>
      ) : null}
    </footer>
  )
}

function UserActionPanel({
  state,
  onAction
}: {
  state: GameSnapshot
  onAction: (action: LegalAction, amount?: number) => void
}) {
  const passiveActions = state.legalActions.filter((action) => action.kind !== 'bet' && action.kind !== 'raise')
  const wagerAction = state.legalActions.find((action) => action.kind === 'bet' || action.kind === 'raise')
  const min = wagerAction?.min ?? 0
  const max = wagerAction?.max ?? min
  const [amount, setAmount] = useState(min)

  useEffect(() => {
    setAmount((current) => clampAmount(current || min, min, max))
  }, [min, max, wagerAction?.kind])

  const presets = wagerAction ? buildAmountPresets(wagerAction, state.pot) : []
  const clampedAmount = wagerAction ? clampAmount(amount, min, max) : amount

  return (
    <>
      <div className="quick-actions" aria-label="Quick actions">
        {passiveActions.map((action) => (
          <button
            key={action.kind}
            className="secondary-action"
            onClick={() => onAction(action)}
          >
            {actionLabel(action)}
          </button>
        ))}
      </div>
      {wagerAction ? (
        <section className="bet-panel" aria-label="Wager controls">
          <div className="bet-panel-head">
            <span>{wagerAction.kind === 'raise' ? 'Raise to' : 'Bet'}</span>
            <strong>{formatChips(clampedAmount)}</strong>
          </div>
          <div className="bet-presets" aria-label="Bet presets">
            {presets.map((preset) => (
              <button
                className={preset.amount === clampedAmount ? 'preset active' : 'preset'}
                key={`${preset.label}-${preset.amount}`}
                onClick={() => setAmount(preset.amount)}
                type="button"
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="amount-row">
            <label htmlFor="bet-amount">{wagerAction.kind === 'raise' ? 'Raise amount' : 'Bet amount'}</label>
            <input
              id="bet-amount"
              inputMode="numeric"
              max={max}
              min={min}
              onChange={(event) => setAmount(clampAmount(Number(event.target.value), min, max))}
              step={50}
              type="number"
              value={clampedAmount}
            />
          </div>
          <input
            aria-label={`${capitalize(wagerAction.kind)} slider`}
            className="amount-slider"
            max={max}
            min={min}
            onChange={(event) => setAmount(clampAmount(Number(event.target.value), min, max))}
            step={50}
            type="range"
            value={clampedAmount}
          />
          <button className="primary-action commit-wager" onClick={() => onAction(wagerAction, clampedAmount)}>
            {wagerAction.kind === 'raise' ? 'Raise to' : 'Bet'} {formatChips(clampedAmount)}
          </button>
        </section>
      ) : null}
    </>
  )
}

function ReviewPanel({ state, onNextHand }: { state: GameSnapshot; onNextHand: () => void }) {
  const review = state.review
  return (
    <aside className={`review-panel ${review ? 'active' : ''}`} aria-label="Hand review">
      <div className="lane-title">
        <Sparkles size={18} />
        <span>Uplift review</span>
      </div>
      {review ? (
        <>
          <div className="result-card">
            <span>{review.bankrollDelta >= 0 ? '+' : ''}{formatChips(review.bankrollDelta)}</span>
            <strong>{review.ratingDelta >= 0 ? '+' : ''}{review.ratingDelta} Elo</strong>
          </div>
          <h2>{review.winningHandName}</h2>
          <p>{review.lesson}</p>
          <div className="timeline">
            {review.publicActions.slice(-8).map((action) => (
              <div className={action.seatId === 'user' ? 'hot' : ''} key={action.seq}>
                <span>{action.street}</span>
                <b>{action.name} {action.action}</b>
              </div>
            ))}
          </div>
          <button className="primary-action wide" onClick={onNextHand}>Next hand</button>
        </>
      ) : (
        <>
          <h2>One lesson after each hand.</h2>
          <p>Uplift reviews decisions from what was visible at the time, then gets out of your way.</p>
          <div className="mini-goal">{state.tendencySummary}</div>
        </>
      )}
      <StackTrail history={state.history} bankroll={state.bankroll} rating={state.rating} />
    </aside>
  )
}

function StackTrail({
  history,
  bankroll,
  rating
}: {
  history: HandHistoryPoint[]
  bankroll: number
  rating: number
}) {
  const values = history.map((point) => point.bankroll)
  const min = Math.min(...values, bankroll)
  const max = Math.max(...values, bankroll)
  const latest = history.at(-1)
  const bars = history.length ? history : [{
    handId: 'starting-stack',
    completedAt: '',
    bankroll,
    bankrollDelta: 0,
    rating,
    ratingDelta: 0,
    winningSeatIds: []
  }]

  return (
    <section className="stack-trail" aria-label="Balance history">
      <div className="trail-head">
        <span>Stack trail</span>
        <strong>{history.length ? `${history.length} hands` : 'Opening stack'}</strong>
      </div>
      <div
        className={`sparkline ${history.length ? '' : 'empty'} ${bars.length === 1 ? 'solo' : ''}`}
        role="img"
        aria-label={`Current bankroll ${formatChips(bankroll)}, Elo ${rating}`}
      >
        {bars.map((point) => (
          <span
            className={point.bankrollDelta >= 0 ? 'up' : 'down'}
            key={point.handId}
            style={{ height: `${sparkHeight(point.bankroll, min, max)}%` }}
            title={`${formatDelta(point.bankrollDelta)} chips`}
          />
        ))}
      </div>
      <div className="trail-metrics">
        <div>
          <span>Bankroll</span>
          <b>{formatChips(bankroll)}</b>
        </div>
        <div>
          <span>Elo</span>
          <b>{rating}</b>
        </div>
      </div>
      {latest ? (
        <div className={`latest-swing ${latest.bankrollDelta >= 0 ? 'up' : 'down'}`}>
          <span>Latest hand</span>
          <b>{formatDelta(latest.bankrollDelta)} chips</b>
        </div>
      ) : null}
    </section>
  )
}

function actionLabel(action: LegalAction) {
  if (action.kind === 'call') return `Call ${formatChips(action.toCall ?? 0)}`
  if (action.kind === 'bet') return `Bet ${formatChips(action.min ?? 0)}`
  if (action.kind === 'raise') return `Raise to ${formatChips(action.min ?? 0)}`
  return action.kind[0].toUpperCase() + action.kind.slice(1)
}

function buildAmountPresets(action: LegalAction, pot: number) {
  const min = action.min ?? 0
  const max = action.max ?? min
  const rawPresets = [
    { label: 'Min', amount: min },
    { label: 'Half pot', amount: roundToChip(pot / 2) },
    { label: 'Pot', amount: roundToChip(pot) },
    { label: 'All in', amount: max }
  ]
  const seen = new Set<number>()
  return rawPresets
    .map((preset) => ({ ...preset, amount: clampAmount(preset.amount, min, max) }))
    .filter((preset) => {
      if (seen.has(preset.amount)) return false
      seen.add(preset.amount)
      return true
    })
}

function clampAmount(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value / 50) * 50))
}

function roundToChip(value: number) {
  return Math.max(0, Math.round(value / 50) * 50)
}

function capitalize(value: string) {
  return value[0].toUpperCase() + value.slice(1)
}

function formatChips(value: number) {
  return new Intl.NumberFormat('en-US').format(value)
}

function formatDelta(value: number) {
  return `${value >= 0 ? '+' : ''}${formatChips(value)}`
}

function sparkHeight(value: number, min: number, max: number) {
  if (max === min) return 52
  return 28 + ((value - min) / (max - min)) * 60
}

function suitSymbol(suit: Card['suit']) {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit]
}

function bridgeLabel(status: GameSnapshot['bridgeStatus']) {
  return {
    'waiting-for-codex': 'Codex to act',
    'local-bots-moving': 'Bots moving',
    'user-to-act': 'Your turn',
    'hand-complete': 'Review ready'
  }[status]
}

function seatName(state: GameSnapshot, seatId: SeatId) {
  return state.seats.find((seat) => seat.seatId === seatId)?.name ?? seatId
}

createRoot(document.getElementById('root')!).render(<App />)
