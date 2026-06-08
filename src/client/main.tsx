import React, { useEffect, useRef, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Bot, ChevronRight, MessageCircle, RotateCcw, Sparkles, UserRound, UsersRound, X, Zap } from 'lucide-react'
import type { Card, GameSnapshot, LegalAction, PublicAction, SeatId, SeatView } from '../shared/contracts'
import './styles.css'

const avatarBySeat: Record<SeatId, string> = {
  user: '/assets/generated/user.svg',
  uplift: '/assets/generated/uplift.svg',
  pip: '/assets/generated/pip.svg',
  nova: '/assets/generated/nova.svg',
  clio: '/assets/generated/clio.svg',
  atlas: '/assets/generated/atlas.svg'
}

type PreviewPreferences = {
  reducedMotion: boolean
  highContrastSuits: boolean
}

function App() {
  const [state, setState] = useState<GameSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lineupOpen, setLineupOpen] = useState(false)
  const [preferences, setPreferences] = useState<PreviewPreferences>({
    reducedMotion: false,
    highContrastSuits: false
  })

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
  const playback = useActionPlayback(state, preferences.reducedMotion)

  async function post(path: string, body?: unknown) {
    setError(null)
    const requestInit: RequestInit = { method: 'POST' }
    if (body !== undefined) {
      requestInit.headers = { 'content-type': 'application/json' }
      requestInit.body = JSON.stringify(body)
    }
    const response = await fetch(path, requestInit)
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

  function togglePreference(key: keyof PreviewPreferences) {
    setPreferences((current) => ({ ...current, [key]: !current[key] }))
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

  if (!playback) return null

  const shellClass = [
    'app-shell',
    preferences.reducedMotion ? 'reduced-motion' : '',
    preferences.highContrastSuits ? 'high-contrast-suits' : ''
  ].filter(Boolean).join(' ')

  return (
    <main className={shellClass}>
      <section className="top-rail" aria-label="Session status">
        <div className="brand-lockup">
          <div className="brand-mark">CP</div>
          <div>
            <h1>CodexPoker</h1>
            <p>{state.sessionGoal}</p>
          </div>
        </div>
        <div className={`bridge-pill ${state.bridgeStatus}`}>
          <Zap size={16} />
          {bridgeLabel(state.bridgeStatus)}
        </div>
        <button
          aria-controls="table-lineup"
          aria-expanded={lineupOpen}
          className={`lineup-toggle ${lineupOpen ? 'active' : ''}`}
          onClick={() => setLineupOpen((open) => !open)}
          type="button"
        >
          <UsersRound size={18} />
          <span>Lineup</span>
        </button>
      </section>

      {lineupOpen ? (
        <LineupDrawer
          state={state}
          preferences={preferences}
          onClose={() => setLineupOpen(false)}
          onTogglePreference={togglePreference}
        />
      ) : null}

      <section className="play-layout">
        <section className="table-column" aria-label="Poker table">
          {error ? <div className="error-banner" role="alert">{error}</div> : null}
          {state.tableNotice ? <div className="table-notice">{state.tableNotice}</div> : null}
          <PokerTable state={playback.visibleState} />
          <ActionFooter
            state={state}
            isUserTurn={isUserTurn}
            isUpliftTurn={isUpliftTurn}
            canFastForward={canFastForward}
            isCatchingUp={playback.isCatchingUp}
            onAction={submitAction}
            onFastForward={() => post('/api/fast-forward')}
            onNextHand={() => post('/api/new-hand')}
          />
        </section>
      </section>

      <div className="sr-live" aria-live="polite">
        {playback.isCatchingUp ? 'Following table action' : state.actingSeatId ? `${seatName(state, state.actingSeatId)} to act` : 'Hand complete'}
      </div>
    </main>
  )
}

function useActionPlayback(state: GameSnapshot | null, reducedMotion: boolean) {
  const latestSeq = state?.publicActions.at(-1)?.seq ?? 0
  const [visibleSeq, setVisibleSeq] = useState(latestSeq)
  const handRef = useRef<string | null>(state?.handId ?? null)
  const initialized = useRef(false)

  useEffect(() => {
    if (!state) return

    if (!initialized.current) {
      initialized.current = true
      handRef.current = state.handId
      setVisibleSeq(latestSeq)
      return
    }

    if (handRef.current !== state.handId) {
      handRef.current = state.handId
      setVisibleSeq(reducedMotion ? latestSeq : 0)
      return
    }

    if (reducedMotion || visibleSeq > latestSeq) {
      setVisibleSeq(latestSeq)
      return
    }

    if (visibleSeq >= latestSeq) return

    const nextAction = state.publicActions.find((action) => action.seq > visibleSeq)
    const timeout = window.setTimeout(() => {
      setVisibleSeq(nextAction?.seq ?? latestSeq)
    }, playbackDelay(nextAction))

    return () => window.clearTimeout(timeout)
  }, [state, latestSeq, reducedMotion, visibleSeq])

  if (!state) return null

  const visibleActions = state.publicActions.filter((action) => action.seq <= visibleSeq)
  return {
    visibleState: {
      ...state,
      publicActions: visibleActions
    },
    isCatchingUp: visibleSeq < latestSeq
  }
}

function playbackDelay(action: PublicAction | undefined) {
  if (!action) return 2400
  const kind = seatKindFor(action.seatId)
  if (kind === 'human') return 1400
  return 2200 + (action.seq % 4) * 650
}

async function fetchState(): Promise<GameSnapshot> {
  const response = await fetch('/api/state')
  const payload = await response.json()
  return payload.state
}

function LineupDrawer({
  state,
  preferences,
  onClose,
  onTogglePreference
}: {
  state: GameSnapshot
  preferences: PreviewPreferences
  onClose: () => void
  onTogglePreference: (key: keyof PreviewPreferences) => void
}) {
  return (
    <section className="lineup-drawer" id="table-lineup" aria-label="Table lineup">
      <div className="lineup-head">
        <div>
          <span>Table lineup</span>
          <strong>Six-seat study table</strong>
        </div>
        <button className="icon-button" onClick={onClose} type="button" aria-label="Close lineup">
          <X size={18} />
        </button>
      </div>

      <div className="lineup-grid">
        {state.seats.map((seat) => (
          <article className={`lineup-card ${seat.kind} ${seat.isToAct ? 'to-act' : ''}`} key={seat.seatId}>
            <img src={avatarBySeat[seat.seatId]} alt="" />
            <div className="lineup-copy">
              <div className="lineup-name">
                <strong>{seat.name}</strong>
                <span>{seat.tableRole}</span>
              </div>
              <p>{seat.modelLabel}</p>
              <em>{seat.personality}</em>
            </div>
            <div className="lineup-meta">
              <b>{formatChips(seat.stack)}</b>
              <span className={`status-dot ${seat.status}`}>{statusLabel(seat.status)}</span>
            </div>
          </article>
        ))}
      </div>

      <div className="lineup-settings" aria-label="Preview preferences">
        <label>
          <input
            checked={preferences.reducedMotion}
            onChange={() => onTogglePreference('reducedMotion')}
            type="checkbox"
          />
          <span>Reduce motion</span>
        </label>
        <label>
          <input
            checked={preferences.highContrastSuits}
            onChange={() => onTogglePreference('highContrastSuits')}
            type="checkbox"
          />
          <span>High-contrast suits</span>
        </label>
      </div>
    </section>
  )
}

function PokerTable({ state }: { state: GameSnapshot }) {
  const seats = state.seats
  const latestAction = state.publicActions.at(-1)
  const latestPaidAction = [...state.publicActions].reverse().find((action) => (action.amount ?? 0) > 0)
  return (
    <section className="felt-stage">
      <div className="table-felt">
        {seats.map((seat, index) => (
          <Seat seat={seat} key={seat.seatId} index={index} latestAction={latestAction} />
        ))}
        <div className="board-zone">
          <div className="street-label">{state.street}</div>
          <div className="pot">
            <img src="/assets/generated/chip.svg" alt="" />
            <span key={state.pot}>{formatChips(state.pot)}</span>
          </div>
          <div className="community-cards" aria-label="Community cards">
            {Array.from({ length: 5 }).map((_, index) => {
              const card = state.board[index]
              return (
                <PlayingCard
                  card={card}
                  key={card ? `${state.handId}-${index}-${card.rank}-${card.suit}` : `${state.handId}-empty-${index}`}
                  muted={!card}
                />
              )
            })}
          </div>
        </div>
        <MoneyFlight action={latestPaidAction} seat={latestPaidAction ? seats.find((seat) => seat.seatId === latestPaidAction.seatId) : undefined} />
        <div className="hero-hand" aria-label="Your hole cards">
          {(state.seats.find((seat) => seat.seatId === 'user')?.cards ?? []).map((card, index) => (
            <PlayingCard card={card} key={`${card.rank}-${card.suit}-${index}`} large />
          ))}
        </div>
      </div>
      <ActionRail state={state} />
    </section>
  )
}

function Seat({ seat, index, latestAction }: { seat: SeatView; index: number; latestAction?: PublicAction }) {
  const bubble = buildSeatBubble(seat, latestAction)
  return (
    <article
      aria-label={`${seat.name}, ${seat.tableRole}, ${formatChips(seat.stack)} chips`}
      className={`seat seat-${index} ${seat.kind} ${seat.isToAct ? 'to-act' : ''} ${seat.isFolded ? 'folded' : ''}`}
    >
      {bubble ? <span className={`seat-speech ${bubble.kind}`}>{bubble.label}</span> : null}
      <img src={avatarBySeat[seat.seatId]} alt={`${seat.name} avatar`} />
      <span className={`seat-kind-badge ${seat.kind}`} aria-label={seatKindLabel(seat.kind)}>
        <SeatKindIcon kind={seat.kind} />
      </span>
      <div>
        <strong>{seat.name}</strong>
        <span>{seat.providerLabel}</span>
      </div>
      <small>{formatChips(seat.stack)}</small>
      {seat.isButton ? <span className="dealer-chip" aria-label={`${seat.name} dealer button`}>D</span> : null}
      {seat.bet > 0 ? <em className="wager-chip" key={`${seat.seatId}-${seat.bet}`}>{formatChips(seat.bet)}</em> : null}
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

function MoneyFlight({ action, seat }: { action?: PublicAction; seat?: SeatView }) {
  if (!action?.amount || !seat) return null
  return (
    <div
      aria-hidden="true"
      className={`money-flight money-from-${seat.seatIndex} ${seat.kind}`}
      key={`${action.seq}-${action.amount}`}
    >
      <img src="/assets/generated/chip.svg" alt="" />
      <img src="/assets/generated/chip.svg" alt="" />
      <span>{formatChips(action.amount)}</span>
    </div>
  )
}

function buildSeatBubble(seat: SeatView, latestAction?: PublicAction): { label: string; kind: 'turn' | 'action' | 'folded' } | undefined {
  if (latestAction?.seatId === seat.seatId) return { label: formatBubbleAction(latestAction), kind: 'action' }
  if (seat.isFolded) return { label: 'Folded', kind: 'folded' }
  if (seat.isToAct) {
    if (seat.kind === 'human') return { label: 'Your turn', kind: 'turn' }
    if (seat.kind === 'codex') return { label: 'My turn', kind: 'turn' }
    return { label: `${seat.name} acts`, kind: 'turn' }
  }
  return undefined
}

function formatBubbleAction(action: PublicAction) {
  if (action.action === 'raise') return `Raises ${formatChips(action.amount ?? 0)}`
  if (action.action === 'bet') return `Bets ${formatChips(action.amount ?? 0)}`
  if (action.action === 'call') return `Calls${action.amount ? ` ${formatChips(action.amount)}` : ''}`
  if (action.action === 'check') return 'Checks'
  if (action.action === 'fold') return 'Folds'
  return formatActionKind(action.action)
}

function SeatKindIcon({ kind }: { kind: SeatView['kind'] }) {
  if (kind === 'bot') return <Bot size={14} strokeWidth={3} />
  if (kind === 'codex') return <MessageCircle size={14} strokeWidth={3} />
  return <UserRound size={14} strokeWidth={3} />
}

function seatKindLabel(kind: SeatView['kind']) {
  return {
    bot: 'Local bot',
    codex: 'Codex seat',
    human: 'Human seat'
  }[kind]
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

function ActionRail({ state }: { state: GameSnapshot }) {
  const beats = state.publicActions.slice(-4)
  return (
    <section className="action-rail" aria-label="Table beats">
      <div className="action-rail-head">
        <span>Table beats</span>
        <strong>{state.publicActions.length ? `${state.publicActions.length} moves` : state.street}</strong>
      </div>
      <div className="beat-track">
        {beats.length ? beats.map((action) => (
          <ActionBeat action={action} key={action.seq} />
        )) : (
          <div className="beat-empty">
            <img src={avatarBySeat.uplift} alt="" />
            <span>Opening deal</span>
          </div>
        )}
      </div>
    </section>
  )
}

function ActionBeat({ action }: { action: PublicAction }) {
  const kind = seatKindFor(action.seatId)
  return (
    <article className={`action-beat ${kind}`}>
      <div className="beat-avatar">
        <img src={avatarBySeat[action.seatId]} alt="" />
        <span className={`seat-kind-badge ${kind}`} aria-hidden="true">
          <SeatKindIcon kind={kind} />
        </span>
      </div>
      <div>
        <span>{action.street}</span>
        <strong>{formatActionLine(action)}</strong>
      </div>
    </article>
  )
}

function ActionFooter({
  state,
  isUserTurn,
  isUpliftTurn,
  canFastForward,
  isCatchingUp,
  onAction,
  onFastForward,
  onNextHand
}: {
  state: GameSnapshot
  isUserTurn: boolean
  isUpliftTurn: boolean
  canFastForward: boolean
  isCatchingUp: boolean
  onAction: (action: LegalAction, amount?: number) => void
  onFastForward: () => void
  onNextHand: () => void
}) {
  if (state.phase === 'hand-complete') {
    return (
      <footer className="action-footer complete">
        <button className="primary-action" onClick={() => onNextHand()} type="button">
          Next hand <ChevronRight size={18} />
        </button>
      </footer>
    )
  }

  return (
    <footer className="action-footer">
      {isUserTurn && !isCatchingUp ? (
        <UserActionPanel state={state} onAction={onAction} />
      ) : canFastForward ? (
        <button className="primary-action" onClick={() => onFastForward()} type="button">
          <RotateCcw size={18} /> Simulate to result
        </button>
      ) : isCatchingUp ? (
        <div className="waiting-copy action-playback-wait">
          <Sparkles size={18} />
          Following table action...
        </div>
      ) : isUpliftTurn ? (
        <div className="waiting-copy">Codexxyyy is thinking.</div>
      ) : (
        <div className="waiting-copy">Local bots are moving.</div>
      )}
      {canFastForward ? (
        <button className="secondary-action" onClick={() => onFastForward()} type="button">Fast-fold result</button>
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
            type="button"
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
          <button className="primary-action commit-wager" onClick={() => onAction(wagerAction, clampedAmount)} type="button">
            {wagerAction.kind === 'raise' ? 'Raise to' : 'Bet'} {formatChips(clampedAmount)}
          </button>
        </section>
      ) : null}
    </>
  )
}

function actionLabel(action: LegalAction) {
  if (action.kind === 'call') return `Call ${formatChips(action.toCall ?? 0)}`
  if (action.kind === 'bet') return `Bet ${formatChips(action.min ?? 0)}`
  if (action.kind === 'raise') return `Raise to ${formatChips(action.min ?? 0)}`
  return action.kind[0].toUpperCase() + action.kind.slice(1)
}

function formatActionKind(action: PublicAction['action']) {
  return action[0].toUpperCase() + action.slice(1)
}

function formatActionLine(action: PublicAction) {
  if (action.action === 'raise') return `${action.name} raises to ${formatChips(action.amount ?? 0)}`
  if (action.action === 'bet') return `${action.name} bets ${formatChips(action.amount ?? 0)}`
  if (action.action === 'call') return `${action.name} calls${action.amount ? ` ${formatChips(action.amount)}` : ''}`
  if (action.action === 'check') return `${action.name} checks`
  if (action.action === 'fold') return `${action.name} folds`
  return `${action.name} ${formatActionKind(action.action)}`
}

function seatKindFor(seatId: SeatId): SeatView['kind'] {
  if (seatId === 'user') return 'human'
  if (seatId === 'uplift') return 'codex'
  return 'bot'
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

function suitSymbol(suit: Card['suit']) {
  return { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' }[suit]
}

function bridgeLabel(status: GameSnapshot['bridgeStatus']) {
  return {
    'waiting-for-codex': 'Codexxyyy to act',
    'local-bots-moving': 'Bots moving',
    'user-to-act': 'Your turn',
    'hand-complete': 'Hand complete'
  }[status]
}

function statusLabel(status: SeatView['status']) {
  return {
    ready: 'Ready',
    thinking: 'Thinking',
    folded: 'Folded',
    winner: 'Winner'
  }[status]
}

function seatName(state: GameSnapshot, seatId: SeatId) {
  return state.seats.find((seat) => seat.seatId === seatId)?.name ?? seatId
}

const rootElement = document.getElementById('root')!
const windowWithRoot = window as Window & { __codexPokerRoot?: Root }
windowWithRoot.__codexPokerRoot ??= createRoot(rootElement)
windowWithRoot.__codexPokerRoot.render(<App />)
