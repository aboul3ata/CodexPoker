import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import type { Table as PokerTableConstructorType } from "poker-ts";
import type {
  ActionKind,
  ActionRequest,
  Card,
  GameSnapshot,
  LegalAction,
  PublicAction,
  ReviewSnapshot,
  SeatId,
  SeatView,
  Street,
} from "../shared/contracts";
import { scoreHolding } from "./bot-strength";
import { settleHand } from "./settlement";
import { InvalidActionError, NotToActError, StaleTurnError } from "./errors";
import { Storage, type PlayerProfile } from "./storage";

const require = createRequire(import.meta.url);
const { Table: PokerTableConstructor } = require("poker-ts") as {
  Table: typeof PokerTableConstructorType;
};

type PokerTable = InstanceType<typeof PokerTableConstructor>;

const seatOrder: SeatId[] = ["user", "uplift", "pip", "nova", "clio", "atlas"];

type SeatMeta = Pick<
  SeatView,
  | "seatId"
  | "seatIndex"
  | "name"
  | "kind"
  | "providerLabel"
  | "modelLabel"
  | "tableRole"
  | "personality"
>;

const seatMeta: Record<SeatId, SeatMeta> = {
  user: {
    seatId: "user",
    seatIndex: 0,
    name: "Ali",
    kind: "human",
    providerLabel: "Human",
    modelLabel: "Preview player",
    tableRole: "Hero seat",
    personality: "Pressure-tests Codexxyyy with live decisions.",
  },
  uplift: {
    seatId: "uplift",
    seatIndex: 1,
    name: "Codex",
    kind: "codex",
    providerLabel: "Codex",
    modelLabel: "This Codex session",
    tableRole: "Chat rival",
    personality: "Banter in chat, private cards stay private.",
  },
  pip: {
    seatId: "pip",
    seatIndex: 2,
    name: "Pip",
    kind: "bot",
    providerLabel: "Local bot",
    modelLabel: "Heuristic caller v0",
    tableRole: "Loose caller",
    personality: "Likes seeing flops and paying small prices.",
  },
  nova: {
    seatId: "nova",
    seatIndex: 3,
    name: "Nova",
    kind: "bot",
    providerLabel: "Local bot",
    modelLabel: "Heuristic pressure v0",
    tableRole: "Pot builder",
    personality: "Finds small bets when the table slows down.",
  },
  clio: {
    seatId: "clio",
    seatIndex: 4,
    name: "Clio",
    kind: "bot",
    providerLabel: "Local bot",
    modelLabel: "Heuristic archivist v0",
    tableRole: "Pattern seat",
    personality: "Checks often, then remembers who blinked.",
  },
  atlas: {
    seatId: "atlas",
    seatIndex: 5,
    name: "Atlas",
    kind: "bot",
    providerLabel: "Local bot",
    modelLabel: "Heuristic stack v0",
    tableRole: "Stack bully",
    personality: "Pushes when the price stays manageable.",
  },
};

type AgentActionProfile = {
  checkBias: number;
  callStackFraction: number;
  looseCallStackFraction: number;
  foldBias: number;
  raiseBias: number;
  betBias: number;
  pressureLimit: number;
  wagerFraction: number;
};

const defaultActionProfile: AgentActionProfile = {
  checkBias: 0.8,
  callStackFraction: 0.055,
  looseCallStackFraction: 0.095,
  foldBias: 0.42,
  raiseBias: 0.14,
  betBias: 0.18,
  pressureLimit: 2,
  wagerFraction: 0.05,
};

const actionProfiles: Partial<Record<SeatId, AgentActionProfile>> = {
  pip: {
    checkBias: 0.9,
    callStackFraction: 0.08,
    looseCallStackFraction: 0.13,
    foldBias: 0.34,
    raiseBias: 0.03,
    betBias: 0.06,
    pressureLimit: 1,
    wagerFraction: 0.02,
  },
  nova: {
    checkBias: 0.66,
    callStackFraction: 0.055,
    looseCallStackFraction: 0.09,
    foldBias: 0.44,
    raiseBias: 0.25,
    betBias: 0.3,
    pressureLimit: 2,
    wagerFraction: 0.12,
  },
  clio: {
    checkBias: 0.88,
    callStackFraction: 0.045,
    looseCallStackFraction: 0.075,
    foldBias: 0.52,
    raiseBias: 0.08,
    betBias: 0.12,
    pressureLimit: 2,
    wagerFraction: 0.06,
  },
  atlas: {
    checkBias: 0.58,
    callStackFraction: 0.06,
    looseCallStackFraction: 0.1,
    foldBias: 0.38,
    raiseBias: 0.3,
    betBias: 0.35,
    pressureLimit: 3,
    wagerFraction: 0.18,
  },
};

const initialStack = 10000;
const tableRefillThreshold = 1000;

export class GameService {
  private table!: PokerTable;
  private codexWatchers = 0;
  private thinkingToken = "";
  private attentionTimer?: ReturnType<typeof setTimeout>;
  private profile: PlayerProfile;
  private handId = "";
  private actionSeq = 0;
  private dealerSeat = 5;
  private turnToken = "";
  private publicActions: PublicAction[] = [];
  private review: ReviewSnapshot | undefined;
  private handStartStacks: Record<SeatId, number>;
  private handContributions: Record<SeatId, number>;
  private seatStacks: Record<SeatId, number>;
  private tableNotice: string | undefined;
  private userVpipThisHand = false;
  private userPfrThisHand = false;
  private userFoldedThisHand = false;
  private listeners = new Set<(snapshot: GameSnapshot) => void>();

  constructor(private storage = new Storage()) {
    this.profile = this.storage.getProfile();
    this.seatStacks = {
      user: this.profile.bankroll,
      uplift: initialStack,
      pip: initialStack,
      nova: initialStack,
      clio: initialStack,
      atlas: initialStack,
    };
    this.handStartStacks = { ...this.seatStacks };
    this.handContributions = this.zeroSeatAmounts();
    this.startNewHand();
  }

  close() {
    clearTimeout(this.attentionTimer);
    this.storage.close();
  }

  subscribe(listener: (snapshot: GameSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): GameSnapshot {
    const actingSeatId = this.getActingSeat();
    const isComplete = Boolean(this.review);
    return {
      schemaVersion: 1,
      codexPresence:
        this.thinkingToken === this.turnToken
          ? "thinking"
          : this.codexWatchers > 0
            ? "watching"
            : "away",
      handId: this.handId,
      phase: isComplete ? "hand-complete" : "playing",
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
      sessionGoal: "",
      tableNotice: this.tableNotice,
      bridgeStatus: this.getBridgeStatus(actingSeatId, isComplete),
      review: this.review,
    };
  }

  /** Agent tools never return the human's view, which contains Ali's cards. */
  getAgentSnapshot() {
    const state = this.getSnapshot();
    return {
      ...state,
      seats: state.seats.map(({ cards: _cards, ...seat }) => seat),
      legalActions: state.actingSeatId === "uplift" ? state.legalActions : [],
      turnToken: state.actingSeatId === "uplift" ? state.turnToken : "",
      cursor: `${state.handId}:${state.actionSeq}:${state.phase}`,
    };
  }

  getHandHistory() {
    return this.storage.getReviews();
  }

  watchCodex() {
    this.codexWatchers += 1;
    this.emit();
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      this.codexWatchers -= 1;
      this.emit();
    };
  }

  getCodexTurn() {
    if (this.getActingSeat() !== "uplift")
      throw new NotToActError("It is not Codex’s turn.");
    this.thinkingToken = this.turnToken;
    clearTimeout(this.attentionTimer);
    this.attentionTimer = setTimeout(() => {
      this.thinkingToken = "";
      this.emit();
    }, 30000);
    this.attentionTimer.unref();
    this.emit();
    return {
      ...this.getAgentSnapshot(),
      holeCards: this.getHoleCardsSafe()[seatMeta.uplift.seatIndex] ?? [],
    };
  }

  submitAction(request: ActionRequest) {
    if (this.review)
      throw new InvalidActionError(
        "The hand is complete. Start the next hand.",
      );
    const actingSeatId = this.getActingSeat();
    if (!actingSeatId)
      throw new InvalidActionError("No seat is currently to act.");
    if (request.seat !== actingSeatId)
      throw new NotToActError(`${seatMeta[request.seat].name} is not to act.`);
    if (request.turnToken !== this.turnToken) throw new StaleTurnError();
    this.applyAction(request.seat, request.action, request.amount);
    this.advanceUntilHumanOrCodex();
    this.emit();
    return this.getSnapshot();
  }

  startNewHand() {
    if (this.handId && !this.review)
      throw new InvalidActionError("Finish this hand before dealing another.");
    this.review = undefined;
    this.publicActions = [];
    this.handId = `hand_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.actionSeq = 0;
    this.userVpipThisHand = false;
    this.userPfrThisHand = false;
    this.userFoldedThisHand = false;
    this.tableNotice = this.ensurePlayableStacks();
    this.handStartStacks = { ...this.seatStacks };
    this.handContributions = this.zeroSeatAmounts();
    this.table = new PokerTableConstructor(
      { smallBlind: 50, bigBlind: 100 },
      seatOrder.length,
    );
    for (const seatId of seatOrder) {
      this.table.sitDown(seatMeta[seatId].seatIndex, this.seatStacks[seatId]);
    }
    this.table.startHand(this.dealerSeat);
    this.captureForcedBetContributions();
    this.dealerSeat = (this.dealerSeat + 1) % seatOrder.length;
    this.issueTurnToken();
    this.advanceUntilHumanOrCodex();
    this.emit();
    return this.getSnapshot();
  }

  private advanceUntilHumanOrCodex() {
    while (!this.review) {
      const actingSeatId = this.getActingSeat();
      if (!actingSeatId) {
        this.progressStreetOrShowdown();
        continue;
      }
      if (actingSeatId === "user" || actingSeatId === "uplift") {
        this.issueTurnToken();
        return;
      }
      const botAction = this.chooseBotAction(actingSeatId);
      this.applyAction(actingSeatId, botAction.action, botAction.amount);
    }
  }

  private progressStreetOrShowdown() {
    if (!this.table.isHandInProgress()) {
      this.completeHand(
        this.getBoardSafe(),
        this.getShowdownCards(),
        this.getPot(),
      );
      return;
    }
    if (this.table.isBettingRoundInProgress()) return;
    if (this.table.areBettingRoundsCompleted()) {
      const board = this.getBoardSafe();
      const showdownCards = this.getShowdownCards();
      const finalPot = this.getPot();
      this.completeHand(board, showdownCards, finalPot);
      return;
    }
    this.table.endBettingRound();
    this.issueTurnToken();
  }

  private applyAction(seatId: SeatId, action: ActionKind, amount?: number) {
    const legal = this.getLegalActions();
    const legalAction = legal.find((item) => item.kind === action);
    if (!legalAction)
      throw new InvalidActionError(`${action} is not legal right now.`);
    if (
      (action === "bet" || action === "raise") &&
      (!amount ||
        amount < (legalAction.min ?? 0) ||
        amount > (legalAction.max ?? Infinity))
    ) {
      throw new InvalidActionError(
        `${action} must be between ${legalAction.min} and ${legalAction.max}.`,
      );
    }

    const seatIndex = seatMeta[seatId].seatIndex;
    const beforeSeat = this.table.seats()[seatIndex];
    const beforeStack = beforeSeat?.stack ?? 0;
    const beforeBet = beforeSeat?.betSize ?? 0;
    const toCall = Math.max(0, this.getCurrentHighestBet() - beforeBet);
    const expectedCommit = this.getExpectedCommit(
      action,
      amount,
      beforeStack,
      beforeBet,
      toCall,
    );
    const actionStreet = this.getStreet();
    try {
      this.table.actionTaken(action, amount);
    } catch (error) {
      throw new InvalidActionError(
        error instanceof Error ? error.message : "Invalid poker action.",
      );
    }
    this.handContributions[seatId] += expectedCommit;
    this.actionSeq += 1;
    this.publicActions.push({
      seq: this.actionSeq,
      seatId,
      name: seatMeta[seatId].name,
      street: actionStreet,
      action,
      amount:
        amount ??
        (action === "call" && expectedCommit > 0 ? expectedCommit : undefined),
      at: new Date().toISOString(),
    });
    this.updateTendencies(seatId, action, actionStreet);
    this.issueTurnToken();
    this.progressStreetOrShowdown();
  }

  private completeHand(
    board: Card[],
    showdownCards = this.getShowdownCards(),
    capturedPot = this.getPot(),
  ) {
    if (this.review) return;
    const folded = new Set(
      this.publicActions
        .filter((a) => a.action === "fold")
        .map((a) => a.seatId),
    );
    const holes = Object.fromEntries(
      seatOrder.map((id, i) => [id, this.getHoleCardsSafe()[i] ?? []]),
    );
    const settlement = settleHand(
      seatOrder,
      this.getButtonSafe(),
      this.handStartStacks,
      this.handContributions,
      folded,
      holes,
      board,
    );
    this.assertHandAccounting(settlement.stacks);
    this.seatStacks = settlement.stacks;
    const bankrollDelta = settlement.stacks.user - this.handStartStacks.user;
    const ratingDelta = 0; // Keep historical ratings without inventing new Elo from chip outcomes.
    const { winningSeatIds, winningHandName, finalPot } = settlement;

    this.profile = {
      ...this.profile,
      bankroll: this.seatStacks.user,
      rating: Math.max(100, this.profile.rating + ratingDelta),
      handsPlayed: this.profile.handsPlayed + 1,
      vpip: this.profile.vpip + (this.userVpipThisHand ? 1 : 0),
      preflopRaises:
        this.profile.preflopRaises + (this.userPfrThisHand ? 1 : 0),
      foldsToRaise:
        this.profile.foldsToRaise + (this.userFoldedThisHand ? 1 : 0),
    };

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
      lesson: "",
      publicActions: this.publicActions,
      showdownCards,
    };
    this.review = review;
    this.storage.completeHand(this.profile, review);
  }

  private chooseBotAction(seatId: SeatId): {
    action: ActionKind;
    amount?: number;
  } {
    if (seatId === "user" || seatId === "uplift")
      throw new Error("Only local bots can use bot strategy.");
    const legal = this.getLegalActions();
    const seat = this.getSeatViews().find((item) => item.seatId === seatId);
    const profile = actionProfiles[seatId] ?? defaultActionProfile;
    const toCall = legal.find((item) => item.kind === "call")?.toCall ?? 0;
    const canCheck = legal.some((item) => item.kind === "check");
    const canCall = legal.some((item) => item.kind === "call");
    const raise = legal.find((item) => item.kind === "raise");
    const bet = legal.find((item) => item.kind === "bet");
    const canFold = legal.some((item) => item.kind === "fold");
    const pressure = this.publicActions.filter(
      (action) => action.street === this.getStreet(),
    ).length;
    const stack = seat?.stack ?? 0;
    const strength = this.getHoldingStrength(seatId);
    const callCeiling = Math.max(
      100,
      stack * (profile.callStackFraction + strength * 0.1),
    );
    const looseCallCeiling = Math.max(
      200,
      stack * (profile.looseCallStackFraction + strength * 0.13),
    );
    const pressureRatio = stack > 0 ? toCall / stack : 1;
    const foldChance = Math.min(
      0.88,
      profile.foldBias +
        pressureRatio * 2.2 +
        pressure * 0.04 -
        strength * 0.22,
    );
    const raiseChance = Math.min(
      0.72,
      profile.raiseBias * (0.45 + strength * 1.45),
    );
    const betChance = Math.min(
      0.78,
      profile.betBias * (0.45 + strength * 1.55),
    );

    if (canCheck) {
      if (
        bet &&
        pressure <= profile.pressureLimit &&
        (strength >= 0.74 || Math.random() < betChance)
      ) {
        return { action: "bet", amount: this.chooseProfileWager(bet, profile) };
      }
      if (strength < 0.58 || Math.random() < profile.checkBias)
        return { action: "check" };
    }

    if (
      raise &&
      strength >= 0.76 &&
      pressure <= profile.pressureLimit &&
      Math.random() < raiseChance
    ) {
      return {
        action: "raise",
        amount: this.chooseProfileWager(raise, profile),
      };
    }
    if (canCall && (toCall <= callCeiling || strength >= 0.74))
      return { action: "call" };
    if (canFold && canCall && toCall > looseCallCeiling && strength < 0.72)
      return { action: "fold" };
    if (
      canFold &&
      canCall &&
      toCall > callCeiling &&
      strength < 0.6 &&
      Math.random() < foldChance
    )
      return { action: "fold" };
    if (
      raise &&
      strength >= 0.62 &&
      pressure <= profile.pressureLimit &&
      Math.random() < raiseChance
    ) {
      return {
        action: "raise",
        amount: this.chooseProfileWager(raise, profile),
      };
    }
    if (bet && strength >= 0.6 && Math.random() < betChance)
      return { action: "bet", amount: this.chooseProfileWager(bet, profile) };
    if (
      canCall &&
      toCall <= looseCallCeiling &&
      (strength >= 0.42 || Math.random() > profile.foldBias)
    )
      return { action: "call" };
    if (canFold) return { action: "fold" };
    return { action: canCheck ? "check" : "call" };
  }

  private getHoldingStrength(seatId: SeatId) {
    const holes = this.getHoleCardsSafe()[seatMeta[seatId].seatIndex];
    return scoreHolding(holes, this.getBoardSafe());
  }

  private chooseProfileWager(action: LegalAction, profile: AgentActionProfile) {
    const min = action.min ?? 0;
    const max = action.max ?? min;
    if (max <= min) return min;
    const target = min + (max - min) * profile.wagerFraction;
    return Math.max(min, Math.min(max, Math.round(target / 50) * 50));
  }

  private getExpectedCommit(
    action: ActionKind,
    amount: number | undefined,
    stack: number,
    currentBet: number,
    toCall: number,
  ) {
    if (action === "call") return Math.min(stack, toCall);
    if (action === "bet") return Math.min(stack, amount ?? 0);
    if (action === "raise")
      return Math.min(stack, Math.max(0, (amount ?? 0) - currentBet));
    return 0;
  }

  private captureForcedBetContributions() {
    const seats = this.table.seats();
    for (const seatId of seatOrder) {
      const stack =
        seats[seatMeta[seatId].seatIndex]?.stack ??
        this.handStartStacks[seatId];
      this.handContributions[seatId] = Math.max(
        0,
        this.handStartStacks[seatId] - stack,
      );
    }
  }

  private assertHandAccounting(stacks: Record<SeatId, number>) {
    const expected = this.sumSeatAmounts(this.handStartStacks);
    const actual = this.sumSeatAmounts(stacks);
    if (actual !== expected) {
      throw new Error(
        `Accounting invariant failed: table total moved from ${expected} to ${actual}.`,
      );
    }
    for (const seatId of seatOrder) {
      const stack = stacks[seatId];
      if (!Number.isInteger(stack) || stack < 0) {
        throw new Error(
          `Accounting invariant failed: ${seatMeta[seatId].name} has invalid stack ${stack}.`,
        );
      }
    }
  }

  private sumSeatAmounts(amounts: Record<SeatId, number>) {
    return seatOrder.reduce((sum, seatId) => sum + amounts[seatId], 0);
  }

  private zeroSeatAmounts(): Record<SeatId, number> {
    return {
      user: 0,
      uplift: 0,
      pip: 0,
      nova: 0,
      clio: 0,
      atlas: 0,
    };
  }

  private getActingSeat(): SeatId | null {
    if (
      this.review ||
      !this.table.isHandInProgress() ||
      !this.table.isBettingRoundInProgress()
    )
      return null;
    return seatOrder[this.table.playerToAct()];
  }

  private getStreet(): Street {
    if (this.review) return "river";
    try {
      return this.table.roundOfBetting();
    } catch {
      return "river";
    }
  }

  private getBoardSafe(): Card[] {
    try {
      return this.table.communityCards();
    } catch {
      return [];
    }
  }

  private getHandPlayersSafe() {
    try {
      return this.table.handPlayers();
    } catch {
      return [];
    }
  }

  private getSeatViews(): SeatView[] {
    const seats = this.table.seats();
    const holes = this.getHoleCardsSafe();
    const actingSeatId = this.getActingSeat();
    const button = this.getButtonSafe();
    const winningSeatIds = this.review?.winningSeatIds ?? [];

    return seatOrder.map((seatId) => {
      const index = seatMeta[seatId].seatIndex;
      const seat = seats[index];
      const foldedByAction = this.publicActions.some(
        (action) => action.seatId === seatId && action.action === "fold",
      );
      const isFolded = foldedByAction;
      const isWinner = winningSeatIds.includes(seatId);
      const cards =
        seatId === "user" && !this.review
          ? (holes[index] ?? undefined)
          : undefined;
      const revealedCards = this.review?.showdownCards[seatId];
      const stack = this.review
        ? this.seatStacks[seatId]
        : (seat?.stack ?? this.seatStacks[seatId]);
      const bet = this.review ? 0 : (seat?.betSize ?? 0);
      return {
        ...seatMeta[seatId],
        stack,
        bet,
        isButton: button === index,
        isToAct: actingSeatId === seatId,
        isFolded,
        status: isWinner
          ? "winner"
          : isFolded
            ? "folded"
            : actingSeatId === seatId
              ? "thinking"
              : "ready",
        cards,
        revealedCards,
      };
    });
  }

  private getLegalActions(): LegalAction[] {
    const actingSeatId = this.getActingSeat();
    if (!actingSeatId) return [];
    const legal = this.table.legalActions();
    const toCall =
      this.getCurrentHighestBet() -
      (this.table.seats()[seatMeta[actingSeatId].seatIndex]?.betSize ?? 0);
    return legal.actions.map((kind) => ({
      kind,
      min:
        kind === "bet" || kind === "raise" ? legal.chipRange?.min : undefined,
      max:
        kind === "bet" || kind === "raise" ? legal.chipRange?.max : undefined,
      toCall:
        kind === "call"
          ? Math.min(
              toCall,
              this.table.seats()[seatMeta[actingSeatId].seatIndex]?.stack ?? 0,
            )
          : undefined,
    }));
  }

  private getPot() {
    return this.sumSeatAmounts(this.handContributions);
  }

  private getCurrentHighestBet() {
    return Math.max(...this.table.seats().map((seat) => seat?.betSize ?? 0));
  }

  private getToCall(beforeBet: number) {
    return Math.max(0, this.getCurrentHighestBet() - beforeBet);
  }

  private getButtonSafe() {
    try {
      return this.table.button();
    } catch {
      return -1;
    }
  }

  private getHoleCardsSafe(): (Card[] | null)[] {
    try {
      return this.table.holeCards();
    } catch {
      return [];
    }
  }

  private getShowdownCards(): Partial<Record<SeatId, Card[]>> {
    const holes = this.getHoleCardsSafe();
    const revealed: Partial<Record<SeatId, Card[]>> = {};
    seatOrder.forEach((seatId) => {
      const cards = holes[seatMeta[seatId].seatIndex];
      const folded = this.publicActions.some(
        (a) => a.seatId === seatId && a.action === "fold",
      );
      if (cards && !folded) revealed[seatId] = cards;
    });
    return Object.keys(revealed).length > 1 && this.getBoardSafe().length === 5
      ? revealed
      : {};
  }

  private updateTendencies(seatId: SeatId, action: ActionKind, street: Street) {
    if (seatId !== "user") return;
    if (street === "preflop" && ["call", "bet", "raise"].includes(action))
      this.userVpipThisHand = true;
    if (street === "preflop" && ["bet", "raise"].includes(action))
      this.userPfrThisHand = true;
    if (action === "fold") this.userFoldedThisHand = true;
  }

  private getTendencySummary() {
    const hands = Math.max(1, this.profile.handsPlayed);
    const vpip = Math.min(100, Math.round((this.profile.vpip / hands) * 100));
    const pfr = Math.min(
      100,
      Math.round((this.profile.preflopRaises / hands) * 100),
    );
    return `VPIP-ish ${vpip}%, preflop raise ${pfr}%, folds logged ${this.profile.foldsToRaise}.`;
  }

  private getBridgeStatus(
    actingSeatId: SeatId | null,
    isComplete: boolean,
  ): GameSnapshot["bridgeStatus"] {
    if (isComplete) return "hand-complete";
    if (actingSeatId === "uplift") return "waiting-for-codex";
    if (actingSeatId === "user") return "user-to-act";
    return "local-bots-moving";
  }

  private issueTurnToken() {
    const actingSeatId = this.getActingSeat() ?? "user";
    this.turnToken = `${this.handId}.${this.actionSeq}.${actingSeatId}.${randomUUID().slice(0, 8)}`;
  }

  private emit() {
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) listener(snapshot);
  }

  private ensurePlayableStacks() {
    const refilled: SeatId[] = [];
    for (const seatId of seatOrder) {
      if (this.seatStacks[seatId] < tableRefillThreshold) {
        this.seatStacks[seatId] = initialStack;
        refilled.push(seatId);
      }
    }
    if (!refilled.length) return undefined;

    if (refilled.includes("user")) {
      this.profile = { ...this.profile, bankroll: this.seatStacks.user };
      this.storage.saveProfile(this.profile);
    }

    const names = refilled.map((seatId) => seatMeta[seatId].name).join(", ");
    return `Play-chip refill: ${names} returned to ${initialStack.toLocaleString()} chips so the table can keep playing.`;
  }
}
