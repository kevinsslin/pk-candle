import type {
  DailyExpense,
  EventPack,
  MarketEvent,
  MarketState,
  PersonalEvent,
  PlayerState,
  Position,
} from './types';

export type SessionStatus = 'LOBBY' | 'COUNTDOWN' | 'LIVE' | 'ENDED';

export type SessionSnapshot = {
  status: SessionStatus;
  countdownEndsAt: number | null;
  pauseEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  durationMs: number;
  tickIntervalMs: number;
  currentDay: number;
  elapsedMs: number;
};

export type PlayerSummary = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  roleKey: string;
  role: string;
  initialCash: number;
  cash: number;
  stress: number;
  status: PlayerState['status'];
  position: Position | null;
  ready: boolean;
  isHost: boolean;
  online: boolean;
};

export type ChatMessage = {
  id: string;
  sender: string;
  text: string;
  type: 'system' | 'chat' | 'npc' | 'spectator';
  senderType?: 'player' | 'spectator';
  senderHandle?: string | null;
  senderAvatarUrl?: string | null;
  createdAt: number;
};

export type LeaderboardEntry = {
  id: string;
  playerName: string;
  handle: string | null;
  avatarUrl: string | null;
  role: string;
  cash: number;
  peakCash: number;
  roi: number;
  daysSurvived: number;
  walletAddress: string | null;
  createdAt: number;
};

export type EventPackSummary = {
  id: string;
  name: string;
  description: string;
  version: number;
  personalEventCount: number;
  marketEventCount: number;
  updatedAt: number | null;
  isCore?: boolean;
};

export type EventPackInput = {
  name: string;
  description: string;
  settings: EventPack['settings'];
  personalEvents: PersonalEvent[];
  marketEvents: MarketEvent[];
  dailyExpenses: DailyExpense[];
};

export type RoomListItem = {
  roomId: string;
  displayName: string;
  status: SessionStatus;
  playerCount: number;
  spectatorCount: number;
  maxPlayers: number;
  packName: string | null;
  hostName: string | null;
  isLocked: boolean;
};

export type SpectatorSummary = {
  id: string;
  name: string;
  handle: string | null;
  avatarUrl: string | null;
  online: boolean;
};

export type RoomSnapshot = {
  roomId: string;
  displayName: string;
  maxPlayers: number;
  hostId: string | null;
  selfId: string;
  self: PlayerState | null;
  players: PlayerSummary[];
  spectators: SpectatorSummary[];
  isLocked: boolean;
  market: MarketState;
  chat: ChatMessage[];
  session: SessionSnapshot;
  leaderboard: LeaderboardEntry[];
  pack: EventPackSummary | null;
};

export type TradeRequest = {
  action: 'OPEN' | 'CLOSE';
  side?: 'LONG' | 'SHORT';
  leverage?: number;
  sizePercent?: number;
  sizeCash?: number;
  takeProfitPct?: number;
  stopLossPct?: number;
};

export type ClientMessage =
  | {
      type: 'join';
      roomId: string;
      roomName?: string;
      playerName: string;
      roleKey: string;
      packId?: string;
      roomKey?: string;
      maxPlayers?: number;
      clientId?: string;
      mode?: 'player' | 'spectator';
    }
  | { type: 'list_rooms' }
  | { type: 'chat'; text: string }
  | { type: 'trade'; trade: TradeRequest }
  | { type: 'event_choice'; eventId: string; choiceId: string }
  | { type: 'set_ready'; ready: boolean }
  | { type: 'start_countdown' }
  | { type: 'kick_player'; playerId: string }
  | { type: 'set_pack'; packId: string }
  | { type: 'set_room_key'; roomKey?: string }
  | { type: 'update_name'; name: string }
  | { type: 'list_packs' }
  | { type: 'get_pack'; packId: string }
  | { type: 'create_pack'; pack: EventPackInput }
  | { type: 'update_pack'; packId: string; pack: EventPackInput; editToken?: string }
  | { type: 'delete_pack'; packId: string; editToken?: string }
  | { type: 'auth'; accessToken: string; identityToken?: string }
  | { type: 'claim_leaderboard'; playerName?: string }
  | { type: 'ping' };

export type ServerMessage =
  | { type: 'connected'; clientId: string; roomId: string; isHost: boolean }
  | { type: 'room_state'; room: RoomSnapshot }
  | { type: 'rooms'; rooms: RoomListItem[] }
  | { type: 'session_status'; session: SessionSnapshot }
  | { type: 'presence'; players: PlayerSummary[]; spectators: SpectatorSummary[]; hostId: string | null }
  | { type: 'market_tick'; market: MarketState }
  | { type: 'self_state'; state: PlayerState }
  | { type: 'personal_event'; event: PersonalEvent; expiresAt?: number }
  | { type: 'market_event'; event: MarketEvent }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'leaderboard'; entries: LeaderboardEntry[] }
  | {
      type: 'respawn_notice';
      reason: 'BROKE' | 'DEAD';
      pauseMs: number;
      currentCash: number;
      respawnCash: number;
      penaltyPct: number;
    }
  | { type: 'packs'; packs: EventPackSummary[] }
  | { type: 'pack_created'; pack: EventPackSummary; editToken?: string }
  | { type: 'pack_updated'; pack: EventPackSummary }
  | { type: 'pack_deleted'; packId: string }
  | { type: 'pack_detail'; packId: string; pack: EventPackInput }
  | { type: 'game_over'; result: PlayerState }
  | { type: 'leaderboard_submitted'; entry: LeaderboardEntry }
  | { type: 'pong' }
  | { type: 'error'; message: string };
