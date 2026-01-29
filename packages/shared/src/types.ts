export type MarketPhase = 'IDLE' | 'Accumulation' | 'PUMP' | 'DUMP' | 'MOON' | 'RUG';

export type Candle = {
  open: number;
  close: number;
  high: number;
  low: number;
  time: number;
};

export type TokenInfo = {
  name: string;
  ticker: string;
  initialPrice: number;
  narrative: string;
  risk: number;
  rugPullChance: number;
  isRug: boolean;
};

export type MarketState = {
  token: TokenInfo | null;
  price: number;
  candles: Candle[];
  phase: MarketPhase;
  volatility: number;
  isRugged: boolean;
};

export type Position = {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  size: number;
  margin: number;
  leverage: number;
  liquidationPrice: number;
  takeProfitPrice?: number | null;
  stopLossPrice?: number | null;
  openedAt: number;
};

export type TradeHistoryItem = {
  type: 'OPEN' | 'CLOSE' | 'LIQUIDATION';
  side: 'LONG' | 'SHORT';
  price: number;
  time: number;
  pnl?: number;
};

export type PlayerStatus = 'ACTIVE' | 'ELIMINATED' | 'FINISHED';
export type EndReason = 'BROKE' | 'DEAD' | 'TIME';

export type RoomMode = 'casual' | 'ranked';

export type RankTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond';
export type RankDivision = 'III' | 'II' | 'I';

export type RankedLeaderboardEntry = {
  walletAddress: string;
  playerName: string;
  rating: number;
  tier: RankTier;
  division: RankDivision;
  matchesPlayed: number;
  updatedAt: number;
};

export type RankedMatchPlayerResult = {
  walletAddress: string;
  playerName: string;
  placement: number;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  tierBefore: RankTier;
  divisionBefore: RankDivision;
  tierAfter: RankTier;
  divisionAfter: RankDivision;
};

export type RankedMatchResult = {
  matchId: string;
  roomId: string;
  seasonId: string;
  playerCount: number;
  players: RankedMatchPlayerResult[];
};

export type RankedQueueStatus = {
  status: 'queued' | 'matching' | 'found' | 'cancelled' | 'error';
  waitMs: number;
  minPlayers: number;
  maxPlayers: number;
  rangeMin: number;
  rangeMax: number;
  crossTier: boolean;
  queueSize: number;
};

export type AdminMetrics = {
  generatedAt: number;
  totals: {
    totalGames: number;
    rankedMatches: number;
    rankedParticipants: number;
    leaderboardEntries: number;
    playerStarts: number;
  };
  live: {
    activePlayers: number;
    activeRooms: number;
    liveRooms: number;
    rankedRooms: number;
    rankedQueue: number;
  };
};

export type PlayerState = {
  id: string;
  name: string;
  roleKey: string;
  role: string;
  initialCash: number;
  cash: number;
  stress: number;
  history: TradeHistoryItem[];
  position: Position | null;
  status: PlayerStatus;
  ready: boolean;
  endReason?: EndReason;
};

export type PlayerEffect = {
  cash?: number;
  cashPercent?: number;
  stress?: number;
};

export type EventCondition = {
  minCash?: number;
  maxCash?: number;
  minStress?: number;
  maxStress?: number;
  minDay?: number;
  maxDay?: number;
  phaseIn?: MarketPhase[];
};

export type PersonalEventChoice = {
  id: string;
  text: string;
  effect: PlayerEffect;
};

export type PersonalEvent = {
  id: string;
  title: string;
  description: string;
  choices: PersonalEventChoice[];
  conditions?: EventCondition;
};

export type MarketEffect = {
  phase?: MarketPhase;
  volatilityDelta?: number;
  priceMultiplier?: number;
};

export type MarketEvent = {
  id: string;
  title: string;
  description: string;
  effect: MarketEffect;
  conditions?: EventCondition;
};

export type DailyExpense = {
  id: string;
  label: string;
  cost: number;
};

export type EventPackSettings = {
  personalEventMinMs: number;
  personalEventMaxMs: number;
  marketEventMinMs: number;
  marketEventMaxMs: number;
};

export type EventPack = {
  id: string;
  name: string;
  description: string;
  version: number;
  settings: EventPackSettings;
  personalEvents: PersonalEvent[];
  marketEvents: MarketEvent[];
  dailyExpenses: DailyExpense[];
};
