import { randomUUID } from 'node:crypto'
import { Table as PokerTableConstructor } from 'poker-ts'
import type {
  ActionKind,
  ActionRequest,
  Card,
  CurrentTurnPacket,
  GameSnapshot,
  LegalAction,
  LatestHandPacket,
  PublicAction,
  ReviewSnapshot,
  SeatId,
  SeatView,
  Street
} from '../shared/contracts'
import { clearCurrentTurn, clearLastError, writeCurrentTurn, writeLatestHand } from './bridge'
import { InvalidActionError, NotToActError, StaleTurnError } from './errors'
import { Storage, type PlayerProfile } from './storage'

type PokerTable = InstanceType<typeof PokerTableConstructor>

const seatOrder: SeatId[] = ['user', 'uplift', 'pip', 'nova', 'clio', 'atlas']

type SeatMeta = Pick<SeatView, 'seatId' | 'seatIndex' | 'name' | 'kind' | 'providerLabel' | 'modelLabel' | 'tableRole' | 'personality'>

const seatMeta: Record<SeatId, SeatMeta> = {
  user: {
    seatId: 'user',
    seatIndex: 0,
    name: 'Ali',
    kind: 'human',
    providerLabel: 'Human',
    modelLabel: 'Preview player',
    tableRole: 'Hero seat',
    personality: 'Pressure-tests Uplift with live decisions.'
  },
  uplift: {
    seatId: 'uplift',
    seatIndex: 1,
    name: 'Uplift',
    kind: 'codex',
    providerLabel: 'Codex',
    modelLabel: 'This Codex session',
    tableRole: 'Chat rival',
    personality: 'Banter in chat, private cards stay private.'
  },
  pip: {
    seatId: 'pip',
    seatIndex: 2,
    name: 'Pip',
    kind: 'bot',
    providerLabel: 'Local bot',
    modelLabel: 'Heuristic caller v0',
    tableRole: 'Loose caller',
    personality: 'Likes seeing flops and paying small prices.'
  },
  nova: {
    seatId: 'nova',
    seatIndex: 3,
    name: 'Nova',
    kind: 'bot',
    providerLabel: 'Local bot',
    modelLabel: 'Heuristic pressure v0',
    tableRole: 'Pot builder',
    personality: 'Finds small bets when the table slows down.'
  },
  clio: {
    seatId: 'clio',
    seatIndex: 4,
    name: 'Clio',
    kind: 'bot',
    providerLabel: 'Local bot',
    modelLabel: 'Heuristic archivist v0',
    tableRole: 'Pattern seat',
    personality: 'Checks often, then remembers who blinked.'
  },
  atlas: {
    seatId: 'atlas',
    seatIndex: 5,
    name: 'Atlas',
    kind: 'bot',
    providerLabel: 'Local bot',
    modelLabel: 'Heuristic stack v0',
    tableRole: 'Stack bully',
    personality: 'Pushes when the price stays manageable.'
  }
}

type AgentActionProfile = {
  checkBias: number
  callStackFraction: number
  looseCallStackFraction: number
  raiseBias: number
  betBias: number
  pressureLimit: number
  wagerFraction: number
}

const defaultActionProfile: AgentActionProfile = {
  checkBias: 0.76,
  callStackFraction: 0.08,
  looseCallStackFraction: 0.14,
  raiseBias: 0.18,
  betBias: 0.22,
  pressureLimit: 2,
  wagerFraction: 0.05
}

const actionProfiles: Partial<Record<SeatId, AgentActionProfile>> = {
  uplift: {
    checkBias: 0.68,
    callStackFraction: 0.1,
    looseCallStackFraction: 0.16,
    raiseBias: 0.22,
    betBias: 0.26,
    pressureLimit: 2,
    wagerFraction: 0.08
  },
  pip: {
    checkBias: 0.9,
    callStackFraction: 0.12,
    looseCallStackFraction: 0.2,
    raiseBias: 0.04,
    betBias: 0.08,
    pressureLimit: 1,
    wagerFraction: 0.02
  },
  nova: {
    checkBias: 0.62,
    callStackFraction: 0.08,
    looseCallStackFraction: 0.13,
    raiseBias: 0.28,
    betBias: 0.34,
    pressureLimit: 3,
    wagerFraction: 0.12
  },
  clio: {
    checkBias: 0.84,
    callStackFraction: 0.07,
    looseCallStackFraction: 0.11,
    raiseBias: 0.1,
    betBias: 0.16,
    pressureLimit: 2,
    wagerFraction: 0.06
  },
  atlas: {
    checkBias: 0.55,
    callStackFraction: 0.1,
    looseCallStackFraction: 0.16,
    raiseBias: 0.34,
    betBias: 0.4,
    pressureLimit: 3,
    wagerFraction: 0.18
  }
}

const rankingNames = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
  'Royal flush'
]

const initialStack = 10000
const tableRefillThreshold = 1000

export class GameService {
  private table!: PokerTable
  private profile: PlayerProfile
  private handId = ''
  private actionSeq = 0
  private dealerSeat = 5
  private turnToken = ''
  private publicActions: PublicAction[] = []
  private review: ReviewSnapshot | undefined
  private handStartStacks: Record<SeatId, number>
  private handContributions: Record<SeatId, number>
  private seatStacks: Record<SeatId, number>
  private tableNotice: string | undefined
  private userVpipThisHand = false
  private userPfrThisHand = false
  private userFoldedThisHand = false
  private listeners = new Set<(snapshot: GameSnapshot) => void>()

  constructor(private storage = new Storage()) {
    this.profile = this.storage.getProfile()
    this.seatStacks = {
      user: this.profile.bankroll,
      uplift: initialStack,
      pip: initialStack,
      nova: initialStack,
      clio: initialStack,
      atlas: initialStack
    }
    this.handStartStacks = { ...this.seatStacks }
    this.handContributions = this.zeroSeatAmounts()
    this.startNewHand()
  }

  close() {
    this.storage.close()
  }

  subscribe(listener: (snapshot: GameSnapshot) => void) {
    this.listeners.add(listener)
    listener(this.getSnapshot())
    return () => this.listeners.delete(listener)
  }

  getSnapshot(): GameSnapshot {
    const actingSeatId = this.getActingSeat()
    const isComplete = Boolean(this.review)
    this.writeBridgeIfNeeded()
    return {
      schemaVersion: 1,
      handId: this.handId,
      phase: isComplete ? 'hand-complete' : 'playing',
      street: this.getStreet(),
      actionSeq: this.actionSeq,
      turnToken: this.turnToken,
      actingSeatId,
      board: this.review?.board ?? this.getBoardSafe(),
      pot: this.review?.finalPot ?? this.getPot(),
      seats: this.getSeatViews(),
      legalActions: isComplete || !actingSeatId ? [] : this.getLegalActions(),
      publicActions: this.publicActions,
      bankroll: this.profile.bankroll,
      rating: this.profile.rating,
      history: this.storage.getHandHistory(12),
      tendencySummary: this.getTendencySummary(),
      sessionGoal: 'Win two pots or catch one good fold',
      tableNotice: this.tableNotice,
      bridgeStatus: this.getBridgeStatus(actingSeatId, isComplete),
      review: this.review
    }
  }

  submitAction(request: ActionRequest) {
    if (this.review) throw new InvalidActionError('The hand is complete. Start the next hand.')
    const actingSeatId = this.getActingSeat()
    if (!actingSeatId) throw new InvalidActionError('No seat is currently to act.')
    if (request.seat !== actingSeatId) throw new NotToActError(`${seatMeta[request.seat].name} is not to act.`)
    if (request.turnToken !== this.turnToken) throw new StaleTurnError()
    this.applyAction(request.seat, request.action, request.amount)
    this.advanceUntilHumanOrCodex()
    this.emit()
    return this.getSnapshot()
  }

  useUpliftFallback() {
    if (this.review) return this.getSnapshot()
    const actingSeatId = this.getActingSeat()
    if (actingSeatId !== 'uplift') throw new NotToActError('Uplift is not to act.')
    const botAction = this.chooseBotAction('uplift')
    this.applyAction('uplift', botAction.action, botAction.amount)
    this.advanceUntilHumanOrCodex()
    this.emit()
    return this.getSnapshot()
  }

  fastForwardAfterFold() {
    if (this.review) return this.getSnapshot()
    const userSeat = this.getHandPlayersSafe()[0]
    if (userSeat !== null) throw new InvalidActionError('Fast-forward is only available after you fold.')
    while (!this.review) {
      const actingSeatId = this.getActingSeat()
      if (!actingSeatId) {
        this.progressStreetOrShowdown()
        continue
      }
      const botAction = this.chooseBotAction(actingSeatId)
      this.applyAction(actingSeatId, botAction.action, botAction.amount)
    }
    this.emit()
    return this.getSnapshot()
  }

  startNewHand() {
    this.review = undefined
    this.publicActions = []
    this.handId = `hand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    this.actionSeq = 0
    this.userVpipThisHand = false
    this.userPfrThisHand = false
    this.userFoldedThisHand = false
    this.tableNotice = this.ensurePlayableStacks()
    this.handStartStacks = { ...this.seatStacks }
    this.handContributions = this.zeroSeatAmounts()
    this.table = new PokerTableConstructor({ smallBlind: 50, bigBlind: 100 }, seatOrder.length)
    for (const seatId of seatOrder) {
      this.table.sitDown(seatMeta[seatId].seatIndex, this.seatStacks[seatId])
    }
    this.table.startHand(this.dealerSeat)
    this.captureForcedBetContributions()
    this.dealerSeat = (this.dealerSeat + 1) % seatOrder.length
    this.issueTurnToken()
    this.advanceUntilHumanOrCodex()
    this.emit()
    return this.getSnapshot()
  }

  private advanceUntilHumanOrCodex() {
    while (!this.review) {
      const actingSeatId = this.getActingSeat()
      if (!actingSeatId) {
        this.progressStreetOrShowdown()
        continue
      }
      if (actingSeatId === 'user' || actingSeatId === 'uplift') {
        this.issueTurnToken()
        this.writeBridgeIfNeeded()
        return
      }
      const botAction = this.chooseBotAction(actingSeatId)
      this.applyAction(actingSeatId, botAction.action, botAction.amount)
    }
  }

  private progressStreetOrShowdown() {
    if (!this.table.isHandInProgress()) {
      this.completeHand(this.getBoardSafe(), this.getShowdownCards(), this.getPot())
      return
    }
    if (this.table.isBettingRoundInProgress()) return
    if (this.table.areBettingRoundsCompleted()) {
      const board = this.getBoardSafe()
      const showdownCards = this.getShowdownCards()
      const finalPot = this.getPot()
      this.table.showdown()
      this.completeHand(board, showdownCards, finalPot)
      return
    }
    this.table.endBettingRound()
    this.issueTurnToken()
  }

  private applyAction(seatId: SeatId, action: ActionKind, amount?: number) {
    const legal = this.getLegalActions()
    const legalAction = legal.find((item) => item.kind === action)
    if (!legalAction) throw new InvalidActionError(`${action} is not legal right now.`)
    if ((action === 'bet' || action === 'raise') && (!amount || amount < (legalAction.min ?? 0) || amount > (legalAction.max ?? Infinity))) {
      throw new InvalidActionError(`${action} must be between ${legalAction.min} and ${legalAction.max}.`)
    }

    const seatIndex = seatMeta[seatId].seatIndex
    const beforeSeat = this.table.seats()[seatIndex]
    const beforeStack = beforeSeat?.stack ?? 0
    const beforeBet = beforeSeat?.betSize ?? 0
    const toCall = Math.max(0, this.getCurrentHighestBet() - beforeBet)
    const expectedCommit = this.getExpectedCommit(action, amount, beforeStack, beforeBet, toCall)
    const actionStreet = this.getStreet()
    try {
      this.table.actionTaken(action, amount)
    } catch (error) {
      throw new InvalidActionError(error instanceof Error ? error.message : 'Invalid poker action.')
    }
    const afterStack = this.table.seats()[seatIndex]?.stack ?? 0
    this.handContributions[seatId] += Math.max(0, beforeStack - afterStack, expectedCommit)
    this.actionSeq += 1
    this.publicActions.push({
      seq: this.actionSeq,
      seatId,
      name: seatMeta[seatId].name,
      street: actionStreet,
      action,
      amount: amount ?? (action === 'call' && expectedCommit > 0 ? expectedCommit : undefined),
      at: new Date().toISOString()
    })
    this.updateTendencies(seatId, action, actionStreet)
    this.issueTurnToken()
    this.progressStreetOrShowdown()
    clearLastError()
  }

  private completeHand(board: Card[], showdownCards = this.getShowdownCards(), capturedPot = this.getPot()) {
    if (this.review) return
    clearCurrentTurn()
    const endSeats = this.table.seats()
    const reportedStacks = {} as Record<SeatId, number>
    const reportedDeltas = {} as Record<SeatId, number>
    for (const seatId of seatOrder) {
      const stack = endSeats[seatMeta[seatId].seatIndex]?.stack ?? this.seatStacks[seatId]
      reportedStacks[seatId] = stack
      reportedDeltas[seatId] = stack - this.handStartStacks[seatId]
    }
    const deltas = {} as Record<SeatId, number>
    const winningSeatIds = this.getWinningSeatIds(reportedDeltas)
    const settledStacks = this.settleStacksWithConservation(reportedStacks, winningSeatIds)
    for (const seatId of seatOrder) {
      const stack = settledStacks[seatId]
      this.seatStacks[seatId] = stack
      deltas[seatId] = stack - this.handStartStacks[seatId]
    }
    const settledPot = Object.values(deltas).filter((delta) => delta > 0).reduce((sum, delta) => sum + delta, 0)
    const finalPot = capturedPot > 0 ? capturedPot : settledPot
    const bankrollDelta = deltas.user
    const ratingDelta = this.getRatingDelta(bankrollDelta)
    const winningHandName = this.getWinningHandName(winningSeatIds)

    this.profile = {
      ...this.profile,
      bankroll: this.seatStacks.user,
      rating: Math.max(100, this.profile.rating + ratingDelta),
      handsPlayed: this.profile.handsPlayed + 1,
      vpip: this.profile.vpip + (this.userVpipThisHand ? 1 : 0),
      preflopRaises: this.profile.preflopRaises + (this.userPfrThisHand ? 1 : 0),
      foldsToRaise: this.profile.foldsToRaise + (this.userFoldedThisHand ? 1 : 0)
    }
    this.storage.saveProfile(this.profile)

    const review: ReviewSnapshot = {
      handId: this.handId,
      completedAt: new Date().toISOString(),
      bankrollDelta,
      bankrollAfter: this.profile.bankroll,
      ratingDelta,
      ratingAfter: this.profile.rating,
      board,
      finalPot,
      winningSeatIds,
      winningHandName,
      lesson: this.buildLesson(bankrollDelta),
      publicActions: this.publicActions,
      showdownCards
    }
    this.review = review
    this.storage.recordHand(review)
    this.writeLatestHand()
  }

  private chooseBotAction(seatId: SeatId): { action: ActionKind; amount?: number } {
    const legal = this.getLegalActions()
    const seat = this.getSeatViews().find((item) => item.seatId === seatId)
    const profile = actionProfiles[seatId] ?? defaultActionProfile
    const toCall = legal.find((item) => item.kind === 'call')?.toCall ?? 0
    const canCheck = legal.some((item) => item.kind === 'check')
    const canCall = legal.some((item) => item.kind === 'call')
    const raise = legal.find((item) => item.kind === 'raise')
    const bet = legal.find((item) => item.kind === 'bet')
    const pressure = this.publicActions.filter((action) => action.street === this.getStreet()).length
    const stack = seat?.stack ?? 0

    if (canCheck) {
      if (bet && pressure <= profile.pressureLimit && Math.random() < profile.betBias) {
        return { action: 'bet', amount: this.chooseProfileWager(bet, profile) }
      }
      if (Math.random() < profile.checkBias) return { action: 'check' }
    }

    if (canCall && toCall <= Math.max(100, stack * profile.callStackFraction)) return { action: 'call' }
    if (raise && pressure <= profile.pressureLimit && Math.random() < profile.raiseBias) {
      return { action: 'raise', amount: this.chooseProfileWager(raise, profile) }
    }
    if (bet && Math.random() < profile.betBias) return { action: 'bet', amount: this.chooseProfileWager(bet, profile) }
    if (canCall && toCall <= Math.max(200, stack * profile.looseCallStackFraction)) return { action: 'call' }
    if (legal.some((item) => item.kind === 'fold')) return { action: 'fold' }
    return { action: canCheck ? 'check' : 'call' }
  }

  private chooseProfileWager(action: LegalAction, profile: AgentActionProfile) {
    const min = action.min ?? 0
    const max = action.max ?? min
    if (max <= min) return min
    const target = min + (max - min) * profile.wagerFraction
    return Math.max(min, Math.min(max, Math.round(target / 50) * 50))
  }

  private getExpectedCommit(action: ActionKind, amount: number | undefined, stack: number, currentBet: number, toCall: number) {
    if (action === 'call') return Math.min(stack, toCall)
    if (action === 'bet') return Math.min(stack, amount ?? 0)
    if (action === 'raise') return Math.min(stack, Math.max(0, (amount ?? 0) - currentBet))
    return 0
  }

  private captureForcedBetContributions() {
    const seats = this.table.seats()
    for (const seatId of seatOrder) {
      const stack = seats[seatMeta[seatId].seatIndex]?.stack ?? this.handStartStacks[seatId]
      this.handContributions[seatId] = Math.max(0, this.handStartStacks[seatId] - stack)
    }
  }

  private settleStacksWithConservation(reportedStacks: Record<SeatId, number>, winningSeatIds: SeatId[]) {
    const targetTotal = this.sumSeatAmounts(this.handStartStacks)
    const reportedTotal = this.sumSeatAmounts(reportedStacks)
    const settledStacks = { ...reportedStacks }
    let excess = reportedTotal - targetTotal

    if (excess > 0) {
      const contributionFloors = Object.fromEntries(
        seatOrder.map((seatId) => [seatId, Math.max(0, this.handStartStacks[seatId] - this.handContributions[seatId])])
      ) as Record<SeatId, number>
      const losersFirst = [
        ...seatOrder.filter((seatId) => !winningSeatIds.includes(seatId)),
        ...seatOrder.filter((seatId) => winningSeatIds.includes(seatId))
      ]

      for (const seatId of losersFirst) {
        if (excess <= 0) break
        const removable = Math.max(0, settledStacks[seatId] - contributionFloors[seatId])
        const adjustment = Math.min(removable, excess)
        settledStacks[seatId] -= adjustment
        excess -= adjustment
      }

      for (const seatId of [...seatOrder].sort((a, b) => settledStacks[b] - settledStacks[a])) {
        if (excess <= 0) break
        const adjustment = Math.min(settledStacks[seatId], excess)
        settledStacks[seatId] -= adjustment
        excess -= adjustment
      }
    }

    if (excess < 0) {
      const recipients = winningSeatIds.length ? winningSeatIds : [seatOrder[0]]
      settledStacks[recipients[0]] += Math.abs(excess)
    }

    return settledStacks
  }

  private sumSeatAmounts(amounts: Record<SeatId, number>) {
    return seatOrder.reduce((sum, seatId) => sum + amounts[seatId], 0)
  }

  private zeroSeatAmounts(): Record<SeatId, number> {
    return {
      user: 0,
      uplift: 0,
      pip: 0,
      nova: 0,
      clio: 0,
      atlas: 0
    }
  }

  private getActingSeat(): SeatId | null {
    if (this.review || !this.table.isHandInProgress() || !this.table.isBettingRoundInProgress()) return null
    return seatOrder[this.table.playerToAct()]
  }

  private getStreet(): Street {
    if (this.review) return 'river'
    try {
      return this.table.roundOfBetting()
    } catch {
      return 'river'
    }
  }

  private getBoardSafe(): Card[] {
    try {
      return this.table.communityCards()
    } catch {
      return []
    }
  }

  private getHandPlayersSafe() {
    try {
      return this.table.handPlayers()
    } catch {
      return []
    }
  }

  private getSeatViews(): SeatView[] {
    const seats = this.table.seats()
    const handPlayers = this.getHandPlayersSafe()
    const holes = this.getHoleCardsSafe()
    const actingSeatId = this.getActingSeat()
    const button = this.getButtonSafe()
    const winningSeatIds = this.review?.winningSeatIds ?? []

    return seatOrder.map((seatId) => {
      const index = seatMeta[seatId].seatIndex
      const seat = seats[index]
      const isFolded = Boolean(this.table.isHandInProgress() && handPlayers[index] === null)
      const isWinner = winningSeatIds.includes(seatId)
      const cards = seatId === 'user' && !this.review ? holes[index] ?? undefined : undefined
      const revealedCards = this.review ? holes[index] ?? undefined : undefined
      return {
        ...seatMeta[seatId],
        stack: seat?.stack ?? this.seatStacks[seatId],
        bet: seat?.betSize ?? 0,
        isButton: button === index,
        isToAct: actingSeatId === seatId,
        isFolded,
        status: isWinner ? 'winner' : isFolded ? 'folded' : actingSeatId === seatId ? 'thinking' : 'ready',
        cards,
        revealedCards
      }
    })
  }

  private getLegalActions(): LegalAction[] {
    const actingSeatId = this.getActingSeat()
    if (!actingSeatId) return []
    const legal = this.table.legalActions()
    const toCall = this.getCurrentHighestBet() - (this.table.seats()[seatMeta[actingSeatId].seatIndex]?.betSize ?? 0)
    return legal.actions.map((kind) => ({
      kind,
      min: kind === 'bet' || kind === 'raise' ? legal.chipRange?.min : undefined,
      max: kind === 'bet' || kind === 'raise' ? legal.chipRange?.max : undefined,
      toCall: kind === 'call' ? toCall : undefined
    }))
  }

  private getPot() {
    let pot = 0
    try {
      pot += this.table.pots().reduce((sum, item) => sum + item.size, 0)
    } catch {
      // Pots are not available after showdown from the facade.
    }
    return pot + this.table.seats().reduce((sum, seat) => sum + (seat?.betSize ?? 0), 0)
  }

  private getCurrentHighestBet() {
    return Math.max(...this.table.seats().map((seat) => seat?.betSize ?? 0))
  }

  private getToCall(beforeBet: number) {
    return Math.max(0, this.getCurrentHighestBet() - beforeBet)
  }

  private getButtonSafe() {
    try {
      return this.table.button()
    } catch {
      return -1
    }
  }

  private getHoleCardsSafe(): (Card[] | null)[] {
    try {
      return this.table.holeCards()
    } catch {
      return []
    }
  }

  private getShowdownCards(): Partial<Record<SeatId, Card[]>> {
    const holes = this.getHoleCardsSafe()
    const revealed: Partial<Record<SeatId, Card[]>> = {}
    seatOrder.forEach((seatId) => {
      const cards = holes[seatMeta[seatId].seatIndex]
      if (cards) revealed[seatId] = cards
    })
    return revealed
  }

  private getWinningHandName(winningSeatIds: SeatId[]) {
    try {
      const winners = this.table.winners().flat()
      const firstWinner = winners.find(([seatIndex]) => winningSeatIds.includes(seatOrder[seatIndex]))
      const ranking = firstWinner?.[1]?.ranking
      return typeof ranking === 'number' ? rankingNames[ranking] ?? 'Winning hand' : 'Last player standing'
    } catch {
      return 'Last player standing'
    }
  }

  private getWinningSeatIds(deltas: Record<SeatId, number>): SeatId[] {
    try {
      const engineWinners = this.table.winners().flat()
      const winners = new Set<SeatId>()
      for (const [seatIndex] of engineWinners) {
        const seatId = seatOrder[seatIndex]
        if (seatId) winners.add(seatId)
      }
      if (winners.size > 0) return [...winners]
    } catch {
      // Folded-out hands do not always expose showdown winners.
    }

    const handPlayers = this.getHandPlayersSafe()
    if (handPlayers.length > 0) {
      const activeSeatIds = seatOrder.filter((seatId) => handPlayers[seatMeta[seatId].seatIndex] !== null)
      if (activeSeatIds.length === 1) return activeSeatIds
    }

    const maxDelta = Math.max(...Object.values(deltas))
    const stackWinners = seatOrder.filter((seatId) => deltas[seatId] === maxDelta)
    return stackWinners.length ? stackWinners : [seatOrder[0]]
  }

  private getRatingDelta(bankrollDelta: number) {
    const expected = 1 / (1 + 10 ** ((1000 - this.profile.rating) / 400))
    const actual = Math.max(0, Math.min(1, 0.5 + bankrollDelta / 2000))
    return Math.max(-24, Math.min(24, Math.round(24 * (actual - expected))))
  }

  private updateTendencies(seatId: SeatId, action: ActionKind, street: Street) {
    if (seatId !== 'user') return
    if (street === 'preflop' && ['call', 'bet', 'raise'].includes(action)) this.userVpipThisHand = true
    if (street === 'preflop' && ['bet', 'raise'].includes(action)) this.userPfrThisHand = true
    if (action === 'fold') this.userFoldedThisHand = true
  }

  private getTendencySummary() {
    const hands = Math.max(1, this.profile.handsPlayed)
    const vpip = Math.min(100, Math.round((this.profile.vpip / hands) * 100))
    const pfr = Math.min(100, Math.round((this.profile.preflopRaises / hands) * 100))
    return `VPIP-ish ${vpip}%, preflop raise ${pfr}%, folds logged ${this.profile.foldsToRaise}.`
  }

  private buildLesson(bankrollDelta: number) {
    const folded = this.publicActions.some((action) => action.seatId === 'user' && action.action === 'fold')
    if (folded && bankrollDelta <= 0) return 'Good fold discipline starts with asking what story the raise is telling.'
    if (bankrollDelta > 0) return 'You found a profitable line. Keep the pot story in mind before adding pressure.'
    return 'Next time, pause on the biggest bet of the hand and compare the price to the pot.'
  }

  private getBridgeStatus(actingSeatId: SeatId | null, isComplete: boolean): GameSnapshot['bridgeStatus'] {
    if (isComplete) return 'hand-complete'
    if (actingSeatId === 'uplift') return 'waiting-for-codex'
    if (actingSeatId === 'user') return 'user-to-act'
    return 'local-bots-moving'
  }

  private issueTurnToken() {
    const actingSeatId = this.getActingSeat() ?? 'user'
    this.turnToken = `${this.handId}.${this.actionSeq}.${actingSeatId}.${randomUUID().slice(0, 8)}`
  }

  private writeBridgeIfNeeded() {
    if (this.getActingSeat() !== 'uplift') {
      clearCurrentTurn()
      return
    }
    const holes = this.getHoleCardsSafe()
    const seats = this.getSeatViews()
    const stacks = Object.fromEntries(seats.map((seat) => [seat.seatId, seat.stack])) as Record<SeatId, number>
    const bets = Object.fromEntries(seats.map((seat) => [seat.seatId, seat.bet])) as Record<SeatId, number>
    const position = Object.fromEntries(seats.map((seat) => [seat.seatId, seat.isButton ? 'button' : seat.isToAct ? 'to-act' : 'seat'])) as Record<SeatId, string>
    const packet: CurrentTurnPacket = {
      schemaVersion: 1,
      handId: this.handId,
      seat: 'uplift',
      turnToken: this.turnToken,
      street: this.getStreet(),
      actionSeq: this.actionSeq,
      holeCards: holes[seatMeta.uplift.seatIndex] ?? [],
      board: this.getBoardSafe(),
      pot: this.getPot(),
      stacks,
      bets,
      position,
      legalActions: this.getLegalActions(),
      publicActionHistory: this.publicActions,
      userTendencies: this.getTendencySummary()
    }
    writeCurrentTurn(packet)
  }

  private writeLatestHand() {
    if (!this.review) return
    const packet: LatestHandPacket = {
      schemaVersion: 1,
      handId: this.handId,
      completedAt: this.review.completedAt,
      userSeat: 'user',
      result: {
        bankrollDelta: this.review.bankrollDelta,
        bankrollAfter: this.review.bankrollAfter,
        ratingDelta: this.review.ratingDelta,
        ratingAfter: this.review.ratingAfter,
        winningSeatIds: this.review.winningSeatIds
      },
      visibleDecisionSnapshots: this.publicActions,
      publicActions: this.publicActions,
      lesson: this.review.lesson,
      showdown: {
        board: this.review.board,
        revealedHands: this.review.showdownCards,
        winningHandName: this.review.winningHandName
      },
      reviewPrompt: `Review ${this.handId}. Focus on visible information and one memorable lesson.`
    }
    writeLatestHand(packet)
  }

  private emit() {
    const snapshot = this.getSnapshot()
    for (const listener of this.listeners) listener(snapshot)
  }

  private ensurePlayableStacks() {
    const refilled: SeatId[] = []
    for (const seatId of seatOrder) {
      if (this.seatStacks[seatId] < tableRefillThreshold) {
        this.seatStacks[seatId] = initialStack
        refilled.push(seatId)
      }
    }
    if (!refilled.length) return undefined

    if (refilled.includes('user')) {
      this.profile = { ...this.profile, bankroll: this.seatStacks.user }
      this.storage.saveProfile(this.profile)
    }

    const names = refilled.map((seatId) => seatMeta[seatId].name).join(', ')
    return `Study-stakes refill: ${names} returned to ${initialStack.toLocaleString()} chips so the table can keep playing.`
  }
}
