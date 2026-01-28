import 'dotenv/config';
import http from 'http';
import { createHash, randomUUID } from 'crypto';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CORE_PACK,
  DEFAULT_ROLE_KEY,
  ROLES,
  applyMarketEvent,
  createInitialMarketState,
  getChatMessage,
  pickMarketEvent,
  pickPersonalEvent,
  simulateMarketTick,
} from '@pk-candle/shared';
import type {
  ChatMessage,
  ClientMessage,
  EventPack,
  EventPackSummary,
  LeaderboardEntry,
  MarketEvent,
  MarketState,
  PersonalEvent,
  PlayerState,
  PlayerSummary,
  RoomListItem,
  RoomSnapshot,
  SessionSnapshot,
  SessionStatus,
  TradeRequest,
} from '@pk-candle/shared';
import {
  ALLOW_ANON_PACK_EDIT,
  ALLOW_MEMORY_LEADERBOARD,
  AUTO_SUBMIT_LEADERBOARD,
  COUNTDOWN_MS,
  DEFAULT_ROOM_PLAYERS,
  DAYS_PER_SESSION,
  EVENT_PAUSE_MS,
  MAX_ROOM_PLAYERS,
  MAX_CHAT_HISTORY,
  MAX_LEADERBOARD,
  MAX_LEVERAGE,
  MIN_ROOM_PLAYERS,
  PORT,
  REQUIRE_PRIVY_FOR_LEADERBOARD,
  SESSION_DURATION_MS,
  TICK_INTERVAL_MS,
} from './config';
import {
  createPack,
  createSession,
  deletePack,
  endSession,
  fetchLeaderboard,
  getDbStatus,
  getPackById,
  getPackRow,
  insertLeaderboardEntry,
  isDbReady,
  listPacks,
  updatePack,
} from './db';
import { privyEnabled, verifyPrivyAccess } from './auth';
import { packSchema } from './validation';
import { getCachedLeaderboard, setCachedLeaderboard } from './redis';

const NPC_CHAT_MIN_MS = 8000;
const NPC_CHAT_MAX_MS = 18000;

const RESPAWN_BASE_PCT = 0.5;
const RESPAWN_PAUSE_MS = 5_000;
const PERSONAL_EVENT_DECISION_MS = 10_000;

type PlayerRuntime = {
  id: string;
  name: string;
  roleKey: string;
  roleName: string;
  baseCash: number;
  peakCash: number;
  state: PlayerState;
  pendingEvent: PersonalEvent | null;
  personalEventEndsAt: number | null;
  recentPersonalEvents: string[];
  nextPersonalEventAt: number;
  lastExpenseDay: number;
  eliminatedAt: number | null;
  eliminatedReason: PlayerState['endReason'] | null;
  respawns: number;
  respawnCooldownEndsAt: number | null;
  auth: {
    userId: string;
    walletAddress: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
  leaderboardSubmitted: boolean;
  lastLeaderboardEntry: LeaderboardEntry | null;
};

type SpectatorRuntime = {
  id: string;
  name: string;
  auth: {
    userId: string;
    walletAddress: string | null;
    handle: string | null;
    avatarUrl: string | null;
  } | null;
};

type RoomState = {
  roomId: string;
  displayName: string;
  hostId: string | null;
  clients: Set<WebSocket>;
  players: Map<string, PlayerRuntime>;
  spectators: Map<string, SpectatorRuntime>;
  market: MarketState;
  status: SessionStatus;
  countdownEndsAt: number | null;
  pauseEndsAt: number | null;
  startedAt: number | null;
  endsAt: number | null;
  currentDay: number;
  sessionId: string | null;
  maxPlayers: number;
  passcodeHash: string | null;
  createdAt: number;
  nextMarketEventAt: number;
  nextNpcChatAt: number;
  recentMarketEvents: string[];
  chat: ChatMessage[];
  leaderboard: LeaderboardEntry[];
  pack: EventPack;
};

type ClientContext = {
  clientId: string;
  roomId: string;
  mode: 'player' | 'spectator';
};

const rooms = new Map<string, RoomState>();
const clients = new WeakMap<WebSocket, ClientContext>();
const connections = new Map<string, WebSocket>();
let globalLeaderboard: LeaderboardEntry[] = [];
const recentLeaderboardResults = new Map<string, {
  sessionId: string | null;
  sessionKey: string;
  roomId: string;
  playerName: string;
  role: string;
  cash: number;
  peakCash: number;
  roi: number;
  daysSurvived: number;
  handle: string | null;
  avatarUrl: string | null;
  walletAddress: string | null;
  userId: string | null;
  capturedAt: number;
}>();
const submittedLeaderboardClients = new Map<string, string>();

const getSessionKey = (room: RoomState, overrideSessionId?: string | null) => {
  if (overrideSessionId) return overrideSessionId;
  if (room.sessionId) return room.sessionId;
  const startedAt = room.startedAt ?? room.createdAt;
  return `${room.roomId}-${startedAt}`;
};
const pruneLeaderboardResults = () => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [clientId, entry] of recentLeaderboardResults.entries()) {
    if (entry.capturedAt < cutoff) {
      recentLeaderboardResults.delete(clientId);
      submittedLeaderboardClients.delete(clientId);
    }
  }
};

const sanitizeName = (value: string) => {
  return value.trim().slice(0, 16).replace(/[^\S\r\n]+/g, ' ') || 'Guest';
};

const sanitizeRoomId = (value: string) => {
  const cleaned = value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
  return cleaned || 'public';
};

const sanitizeRoomName = (value?: string, fallback?: string) => {
  const trimmed = (value ?? '').trim().replace(/[\t\n\r]+/g, ' ').replace(/[^\S\r\n]+/g, ' ');
  // Allow emoji/unicode; just cap length.
  const capped = trimmed.slice(0, 24);
  return capped || fallback || 'Room';
};

const sanitizeRoomKey = (value?: string) => {
  if (!value) return '';
  return value.trim().slice(0, 32);
};

const sanitizeMessage = (value: string) => value.trim().slice(0, 240).replace(/[^\S\r\n]+/g, ' ');

const sanitizeClientId = (value: string) => {
  const cleaned = value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 36);
  return cleaned || randomUUID();
};

const randomBetween = (min: number, max: number) => Math.floor(min + Math.random() * (max - min));

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const hashRoomKey = (value: string) => createHash('sha256').update(value).digest('hex');

const normalizeRoomPlayers = (value?: number) => {
  const parsed = Number.isFinite(value) ? Number(value) : DEFAULT_ROOM_PLAYERS;
  return clamp(Math.round(parsed), MIN_ROOM_PLAYERS, MAX_ROOM_PLAYERS);
};

const buildSessionSnapshot = (room: RoomState): SessionSnapshot => {
  const elapsedMs = room.startedAt ? Math.max(0, Date.now() - room.startedAt) : 0;
  return {
    status: room.status,
    countdownEndsAt: room.countdownEndsAt,
    pauseEndsAt: room.pauseEndsAt,
    startedAt: room.startedAt,
    endsAt: room.endsAt,
    durationMs: SESSION_DURATION_MS,
    tickIntervalMs: TICK_INTERVAL_MS,
    currentDay: room.currentDay,
    elapsedMs,
  };
};

const buildPackSummary = (pack: EventPack): EventPackSummary => ({
  id: pack.id,
  name: pack.name,
  description: pack.description,
  version: pack.version,
  personalEventCount: pack.personalEvents.length,
  marketEventCount: pack.marketEvents.length,
  updatedAt: null,
  isCore: pack.id === CORE_PACK.id,
});

const buildPlayerSummary = (room: RoomState, player: PlayerRuntime): PlayerSummary => ({
  id: player.id,
  name: player.name,
  handle: player.auth?.handle ?? null,
  avatarUrl: player.auth?.avatarUrl ?? null,
  roleKey: player.roleKey,
  role: player.roleName,
  initialCash: player.state.initialCash,
  cash: player.state.cash,
  stress: player.state.stress,
  status: player.state.status,
  position: player.state.position,
  ready: player.state.ready,
  isHost: room.hostId === player.id,
  online: connections.has(player.id),
});

const buildSpectatorSummary = (spectator: SpectatorRuntime): RoomSnapshot['spectators'][number] => ({
  id: spectator.id,
  name: spectator.name,
  handle: spectator.auth?.handle ?? null,
  avatarUrl: spectator.auth?.avatarUrl ?? null,
  online: connections.has(spectator.id),
});

const arePlayersReady = (room: RoomState) => {
  const players = Array.from(room.players.values());
  if (players.length === 0) return false;
  return players.every((player) => player.state.ready);
};

const resetCountdown = (room: RoomState) => {
  if (room.status !== 'COUNTDOWN') return;
  room.status = 'LOBBY';
  room.countdownEndsAt = null;
  broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
  broadcastRoomList();
};

const buildRoomSnapshot = (room: RoomState, selfId: string): RoomSnapshot => {
  const self = room.players.get(selfId)?.state ?? null;
  return {
    roomId: room.roomId,
    displayName: room.displayName,
    maxPlayers: room.maxPlayers,
    hostId: room.hostId,
    selfId,
    self,
    players: Array.from(room.players.values()).map((player) => buildPlayerSummary(room, player)),
    spectators: Array.from(room.spectators.values()).map((spectator) => buildSpectatorSummary(spectator)),
    isLocked: Boolean(room.passcodeHash),
    market: room.market,
    chat: room.chat,
    session: buildSessionSnapshot(room),
    leaderboard: room.leaderboard,
    pack: buildPackSummary(room.pack),
  };
};

const getActivePlayerCount = (room: RoomState) => {
  let count = 0;
  for (const player of room.players.values()) {
    if (connections.has(player.id)) count += 1;
  }
  return count;
};

const getActiveSpectatorCount = (room: RoomState) => {
  let count = 0;
  for (const spectator of room.spectators.values()) {
    if (connections.has(spectator.id)) count += 1;
  }
  return count;
};

const buildRoomListItem = (room: RoomState): RoomListItem => ({
  roomId: room.roomId,
  displayName: room.displayName,
  status: room.status,
  playerCount: getActivePlayerCount(room),
  spectatorCount: getActiveSpectatorCount(room),
  maxPlayers: room.maxPlayers,
  packName: room.pack?.name ?? null,
  hostName: room.hostId ? room.players.get(room.hostId)?.name ?? null : null,
  isLocked: Boolean(room.passcodeHash),
});

const listRooms = () => {
  const statusOrder: Record<SessionStatus, number> = {
    LOBBY: 0,
    COUNTDOWN: 1,
    LIVE: 2,
    ENDED: 3,
  };

  return Array.from(rooms.values())
    .map((room) => buildRoomListItem(room))
    .sort((a, b) => {
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      return b.playerCount - a.playerCount;
    });
};

const send = (ws: WebSocket, message: unknown) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
};

const broadcast = (room: RoomState, message: unknown) => {
  const payload = JSON.stringify(message);
  for (const client of room.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
};

const broadcastRoomList = () => {
  const roomsSnapshot = listRooms();
  for (const client of connections.values()) {
    send(client, { type: 'rooms', rooms: roomsSnapshot });
  }
};

const buildPlayerState = (id: string, name: string, roleKey: string, roleName: string, cash: number): PlayerState => ({
  id,
  name,
  roleKey,
  role: roleName,
  initialCash: cash,
  cash,
  stress: 0,
  history: [],
  position: null,
  status: 'ACTIVE',
  ready: false,
});

const createPlayerRuntime = (id: string, name: string, roleKey: string, pack: EventPack): PlayerRuntime => {
  const role = ROLES[roleKey as keyof typeof ROLES] ?? ROLES.WORKER;
  const state = buildPlayerState(id, name, roleKey, role.name, role.initialCash);
  return {
    id,
    name,
    roleKey,
    roleName: role.name,
    baseCash: role.initialCash,
    peakCash: role.initialCash,
    state,
    pendingEvent: null,
    personalEventEndsAt: null,
    recentPersonalEvents: [],
    nextPersonalEventAt: Date.now() + randomBetween(pack.settings.personalEventMinMs, pack.settings.personalEventMaxMs),
    lastExpenseDay: 1,
    eliminatedAt: null,
    eliminatedReason: null,
    respawns: 0,
    respawnCooldownEndsAt: null,
    auth: null,
    leaderboardSubmitted: false,
    lastLeaderboardEntry: null,
  };
};

const createSpectatorRuntime = (id: string, name: string): SpectatorRuntime => ({
  id,
  name,
  auth: null,
});

const resetPlayerForSession = (room: RoomState, player: PlayerRuntime) => {
  player.state = buildPlayerState(player.id, player.name, player.roleKey, player.roleName, player.baseCash);
  player.pendingEvent = null;
  player.personalEventEndsAt = null;
  player.recentPersonalEvents = [];
  player.nextPersonalEventAt = Date.now() + randomBetween(room.pack.settings.personalEventMinMs, room.pack.settings.personalEventMaxMs);
  player.lastExpenseDay = 1;
  player.eliminatedAt = null;
  player.eliminatedReason = null;
  player.respawns = 0;
  player.respawnCooldownEndsAt = null;
  player.leaderboardSubmitted = false;
  player.lastLeaderboardEntry = null;
  player.peakCash = player.state.initialCash;
};

const createRoom = (
  roomId: string,
  displayName: string,
  pack: EventPack,
  options?: { maxPlayers?: number; passcodeHash?: string | null }
): RoomState => ({
  roomId,
  displayName,
  hostId: null,
  clients: new Set(),
  players: new Map(),
  spectators: new Map(),
  market: createInitialMarketState(),
  status: 'LOBBY',
  countdownEndsAt: null,
  startedAt: null,
  endsAt: null,
  currentDay: 1,
  sessionId: null,
  maxPlayers: options?.maxPlayers ?? DEFAULT_ROOM_PLAYERS,
  passcodeHash: options?.passcodeHash ?? null,
  createdAt: Date.now(),
  pauseEndsAt: null,
  nextMarketEventAt: Date.now() + randomBetween(pack.settings.marketEventMinMs, pack.settings.marketEventMaxMs),
  nextNpcChatAt: Date.now() + randomBetween(NPC_CHAT_MIN_MS, NPC_CHAT_MAX_MS),
  recentMarketEvents: [],
  chat: [],
  leaderboard: globalLeaderboard,
  pack,
});

const scheduleMarketEvent = (room: RoomState) => {
  room.nextMarketEventAt = Date.now() + randomBetween(room.pack.settings.marketEventMinMs, room.pack.settings.marketEventMaxMs);
};

const scheduleNpcChat = (room: RoomState) => {
  room.nextNpcChatAt = Date.now() + randomBetween(NPC_CHAT_MIN_MS, NPC_CHAT_MAX_MS);
};

const schedulePersonalEvent = (room: RoomState, player: PlayerRuntime) => {
  player.nextPersonalEventAt = Date.now() + randomBetween(room.pack.settings.personalEventMinMs, room.pack.settings.personalEventMaxMs);
};

const applyEventPause = (room: RoomState, ms: number) => {
  const now = Date.now();
  const previous = room.pauseEndsAt ?? now;
  const next = Math.max(previous, now + ms);
  const delta = next - previous;
  if (delta <= 0) return;
  room.pauseEndsAt = next;
  room.nextMarketEventAt += delta;
  room.nextNpcChatAt += delta;
  for (const player of room.players.values()) {
    player.nextPersonalEventAt += delta;
  }
  broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
};

const broadcastPresence = (room: RoomState) => {
  const players = Array.from(room.players.values()).map((player) => buildPlayerSummary(room, player));
  const spectators = Array.from(room.spectators.values()).map((spectator) => buildSpectatorSummary(spectator));
  broadcast(room, { type: 'presence', players, spectators, hostId: room.hostId });
};

const broadcastRoomState = (room: RoomState) => {
  for (const client of room.clients) {
    const context = clients.get(client);
    if (!context) continue;
    send(client, { type: 'room_state', room: buildRoomSnapshot(room, context.clientId) });
  }
};

const broadcastPacks = (packs: EventPackSummary[]) => {
  for (const room of rooms.values()) {
    broadcast(room, { type: 'packs', packs });
  }
};

const pushChat = (room: RoomState, message: ChatMessage) => {
  room.chat = [...room.chat, message].slice(-MAX_CHAT_HISTORY);
  broadcast(room, { type: 'chat', message });
};

const sendSelfState = (player: PlayerRuntime) => {
  const client = connections.get(player.id);
  if (client) {
    send(client, { type: 'self_state', state: player.state });
  }
};

const applyEffect = (player: PlayerRuntime, effect: PersonalEvent['choices'][number]['effect']) => {
  if (effect.cash) player.state.cash += effect.cash;

  player.state.cash = Math.max(0, player.state.cash);
};

const resolvePersonalEvent = (room: RoomState, player: PlayerRuntime, choice: PersonalEvent['choices'][number]) => {
  applyEffect(player, choice.effect);
  player.pendingEvent = null;
  player.personalEventEndsAt = null;
  schedulePersonalEvent(room, player);
  sendSelfState(player);
};

const maybeResolveExpiredPersonalEvent = (room: RoomState, player: PlayerRuntime, now: number) => {
  if (!player.pendingEvent || !player.personalEventEndsAt) return;
  if (now < player.personalEventEndsAt) return;
  const fallback = player.pendingEvent.choices[0];
  if (!fallback) {
    player.pendingEvent = null;
    player.personalEventEndsAt = null;
    schedulePersonalEvent(room, player);
    return;
  }
  resolvePersonalEvent(room, player, fallback);
};

const getPnl = (position: NonNullable<PlayerState['position']>, price: number) => {
  const delta = position.side === 'LONG' ? price - position.entryPrice : position.entryPrice - price;
  return delta * position.size;
};

const getNetWorth = (player: PlayerRuntime, price: number) => {
  if (!player.state.position) return player.state.cash;
  const pnl = getPnl(player.state.position, price);
  return player.state.cash + player.state.position.margin + pnl;
};

const updatePeakCash = (player: PlayerRuntime, price: number) => {
  const netWorth = getNetWorth(player, price);
  if (netWorth > player.peakCash) {
    player.peakCash = netWorth;
  }
};

const checkLiquidation = (player: PlayerRuntime, price: number) => {
  const position = player.state.position;
  if (!position) return false;
  let liquidated = false;

  if (position.side === 'LONG' && price <= position.liquidationPrice) {
    player.state.history.push({ type: 'LIQUIDATION', side: 'LONG', price, time: Date.now(), pnl: -position.margin });
    player.state.position = null;
    liquidated = true;
  }

  if (position.side === 'SHORT' && price >= position.liquidationPrice) {
    player.state.history.push({ type: 'LIQUIDATION', side: 'SHORT', price, time: Date.now(), pnl: -position.margin });
    player.state.position = null;
    liquidated = true;
  }
  return liquidated;
};

const closePosition = (player: PlayerRuntime, price: number, sendUpdate = true) => {
  const position = player.state.position;
  if (!position) return;
  const pnl = getPnl(position, price);
  player.state.cash = player.state.cash + position.margin + pnl;
  player.state.history.push({ type: 'CLOSE', side: position.side, price, time: Date.now(), pnl });
  player.state.position = null;
  updatePeakCash(player, price);
  if (sendUpdate) {
    sendSelfState(player);
  }
};

const checkStops = (player: PlayerRuntime, price: number) => {
  const position = player.state.position;
  if (!position) return;

  const takeProfit = position.takeProfitPrice ?? null;
  const stopLoss = position.stopLossPrice ?? null;

  if (takeProfit !== null) {
    const hitTakeProfit = position.side === 'LONG'
      ? price >= takeProfit
      : price <= takeProfit;
    if (hitTakeProfit) {
      closePosition(player, price, false);
      return;
    }
  }

  if (stopLoss !== null) {
    const hitStopLoss = position.side === 'LONG'
      ? price <= stopLoss
      : price >= stopLoss;
    if (hitStopLoss) {
      closePosition(player, price, false);
    }
  }
};

const markEliminated = (player: PlayerRuntime, reason: PlayerState['endReason']) => {
  if (player.state.status !== 'ACTIVE') return;
  player.state.status = 'ELIMINATED';
  player.state.endReason = reason;
  player.eliminatedAt = Date.now();
  player.eliminatedReason = reason;
};

const respawnPlayer = (
  room: RoomState,
  player: PlayerRuntime,
  reason: PlayerState['endReason'],
  currentCash: number
) => {
  // 5-minute party mode: never hard-eliminate; instead reset state and keep them in the session.
  const now = Date.now();
  player.respawns += 1;

  // Force close any open position (treat as liquidation).
  if (player.state.position) {
    player.state.history.push({
      type: 'LIQUIDATION',
      side: player.state.position.side,
      price: room.market.price,
      time: now,
      pnl: -player.state.position.margin,
    });
    player.state.position = null;
  }

  player.state.status = 'ACTIVE';
  player.state.endReason = undefined;
  player.eliminatedAt = null;
  player.eliminatedReason = null;
  player.pendingEvent = null;
  player.personalEventEndsAt = null;

  const respawnCash = Math.max(1, Math.floor(player.baseCash * Math.pow(RESPAWN_BASE_PCT, player.respawns)));
  player.state.cash = respawnCash;
  player.state.stress = 0;
  player.respawnCooldownEndsAt = now + RESPAWN_PAUSE_MS;

  const message: ChatMessage = {
    id: randomUUID(),
    sender: 'SYSTEM',
    text: `${player.name} ${reason === 'BROKE' ? 'got liquidated' : 'went down'} and respawned with fresh funds.`,
    type: 'system',
    createdAt: now,
  };
  pushChat(room, message);

  const client = connections.get(player.id);
  if (client) {
    const safeCurrentCash = Math.max(0, currentCash);
    send(client, {
      type: 'respawn_notice',
      reason: reason === 'BROKE' ? 'BROKE' : 'DEAD',
      pauseMs: RESPAWN_PAUSE_MS,
      currentCash: safeCurrentCash,
      respawnCash,
      penaltyPct: Math.round((respawnCash / player.baseCash) * 100),
    });
  }
};

const applyDailyExpense = (room: RoomState, player: PlayerRuntime) => {
  const expense = room.pack.dailyExpenses[Math.floor(Math.random() * room.pack.dailyExpenses.length)];
  if (!expense) return;
  player.state.cash = Math.max(0, player.state.cash - expense.cost);
  const message: ChatMessage = {
    id: randomUUID(),
    sender: 'SYSTEM',
    text: `${player.name} spent ${expense.cost} on ${expense.label}.`,
    type: 'system',
    createdAt: Date.now(),
  };
  pushChat(room, message);
};

const refreshLeaderboard = async () => {
  if (!isDbReady()) {
    if (!ALLOW_MEMORY_LEADERBOARD) {
      globalLeaderboard = [];
    }
    return;
  }

  const cached = await getCachedLeaderboard();
  if (cached && Array.isArray(cached)) {
    globalLeaderboard = cached as LeaderboardEntry[];
    return;
  }

  globalLeaderboard = await fetchLeaderboard(MAX_LEADERBOARD);
  await setCachedLeaderboard(globalLeaderboard);
};

const insertMemoryLeaderboardEntry = (entry: Omit<LeaderboardEntry, 'id' | 'createdAt'>) => {
  const record: LeaderboardEntry = {
    ...entry,
    id: randomUUID(),
    createdAt: Date.now(),
  };
  globalLeaderboard = [record, ...globalLeaderboard]
    .sort((a, b) => b.roi - a.roi)
    .slice(0, MAX_LEADERBOARD);
  return record;
};

const broadcastLeaderboard = () => {
  for (const room of rooms.values()) {
    room.leaderboard = globalLeaderboard;
    broadcast(room, { type: 'leaderboard', entries: globalLeaderboard });
  }
};

const endRoomSession = async (room: RoomState) => {
  if (room.status === 'ENDED') return;

  room.status = 'ENDED';
  room.endsAt = Date.now();

  const price = room.market.price;

  for (const player of room.players.values()) {
    if (player.state.position) {
      const pnl = getPnl(player.state.position, price);
      player.state.cash = player.state.cash + player.state.position.margin + pnl;
      player.state.history.push({ type: 'CLOSE', side: player.state.position.side, price, time: Date.now(), pnl });
      player.state.position = null;
    }

    if (player.state.status === 'ACTIVE') {
      player.state.status = 'FINISHED';
      player.state.endReason = 'TIME';
    }

    const sessionCash = player.state.cash;
    const peakCash = Math.max(player.peakCash, sessionCash);
    const roi = player.state.initialCash > 0
      ? ((sessionCash - player.state.initialCash) / player.state.initialCash) * 100
      : 0;

    const sessionKey = getSessionKey(room);
    recentLeaderboardResults.set(player.id, {
      sessionId: room.sessionId,
      sessionKey,
      roomId: room.roomId,
      playerName: player.name,
      role: player.roleName,
      cash: sessionCash,
      peakCash,
      roi,
      daysSurvived: room.currentDay,
      handle: player.auth?.handle ?? null,
      avatarUrl: player.auth?.avatarUrl ?? null,
      walletAddress: player.auth?.walletAddress ?? null,
      userId: player.auth?.userId ?? null,
      capturedAt: Date.now(),
    });

    if (AUTO_SUBMIT_LEADERBOARD) {
      const canSubmit = !REQUIRE_PRIVY_FOR_LEADERBOARD || Boolean(player.auth?.userId);
      if (!player.leaderboardSubmitted && canSubmit && isDbReady()) {
        const inserted = await insertLeaderboardEntry({
          sessionId: room.sessionId,
          roomId: room.roomId,
          playerName: player.name,
          handle: player.auth?.handle ?? null,
          avatarUrl: player.auth?.avatarUrl ?? null,
          role: player.roleName,
          cash: sessionCash,
          peakCash,
          roi,
          daysSurvived: room.currentDay,
          walletAddress: player.auth?.walletAddress ?? null,
          userId: player.auth?.userId ?? null,
        });
        if (inserted) {
          player.leaderboardSubmitted = true;
          player.lastLeaderboardEntry = inserted;
          submittedLeaderboardClients.set(player.id, sessionKey);
        }
      }
    }

    const client = connections.get(player.id);
    if (client) {
      send(client, { type: 'game_over', result: player.state });
    }
  }

  if (room.sessionId) {
    await endSession(room.sessionId);
  }

  await refreshLeaderboard();
  broadcastLeaderboard();
  broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
  broadcastRoomList();
  pruneLeaderboardResults();
};

const maybeStartSession = async (room: RoomState) => {
  room.status = 'LIVE';
  room.startedAt = Date.now();
  room.endsAt = room.startedAt + SESSION_DURATION_MS;
  room.countdownEndsAt = null;
  room.currentDay = 1;
  room.market = createInitialMarketState();
  room.recentMarketEvents = [];
  scheduleMarketEvent(room);
  scheduleNpcChat(room);

  for (const player of room.players.values()) {
    resetPlayerForSession(room, player);
    sendSelfState(player);
  }

  room.sessionId = await createSession(room.roomId, room.pack.id);
  broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
  broadcastRoomList();
};

const maybeApplyMarketEvent = (room: RoomState) => {
  const event = pickMarketEvent(room.pack, room.market, room.currentDay, room.recentMarketEvents);
  if (!event) return;

  room.market = applyMarketEvent(room.market, event);
  room.recentMarketEvents = [...room.recentMarketEvents, event.id].slice(-6);
  scheduleMarketEvent(room);
  applyEventPause(room, EVENT_PAUSE_MS);
  broadcast(room, { type: 'market_event', event });
  pushChat(room, {
    id: randomUUID(),
    sender: 'SYSTEM',
    text: `${event.title}: ${event.description}`,
    type: 'system',
    createdAt: Date.now(),
  });
};

const maybeSendNpcChat = (room: RoomState) => {
  const message = getChatMessage(room.market.phase, room.market.price, room.market.token);
  if (message.effect) {
    const event: MarketEvent = {
      id: `chat-${Date.now()}`,
      title: 'Chat Wave',
      description: message.text,
      effect: message.effect.type === 'VOLATILITY'
        ? { volatilityDelta: message.effect.strength }
        : { phase: message.effect.type, volatilityDelta: message.effect.strength },
    };
    room.market = applyMarketEvent(room.market, event);
  }

  pushChat(room, {
    id: randomUUID(),
    sender: message.sender,
    text: message.text,
    type: 'npc',
    createdAt: Date.now(),
  });

  scheduleNpcChat(room);
};

const maybeSendPersonalEvent = (room: RoomState, player: PlayerRuntime) => {
  if (player.state.status !== 'ACTIVE') return;
  if (player.pendingEvent) return;
  if (Date.now() < player.nextPersonalEventAt) return;

  const event = pickPersonalEvent(room.pack, player.state, room.market, room.currentDay, player.recentPersonalEvents);
  if (!event) {
    schedulePersonalEvent(room, player);
    return;
  }

  player.pendingEvent = event;
  player.personalEventEndsAt = Date.now() + PERSONAL_EVENT_DECISION_MS;
  player.recentPersonalEvents = [...player.recentPersonalEvents, event.id].slice(-5);

  const client = connections.get(player.id);
  if (client) {
    send(client, { type: 'personal_event', event, expiresAt: player.personalEventEndsAt });
  }
};

const handleTrade = (room: RoomState, player: PlayerRuntime, trade: TradeRequest) => {
  const client = connections.get(player.id);
  const deny = (message: string) => {
    if (client) send(client, { type: 'error', message });
  };

  if (room.status !== 'LIVE') {
    deny('Trading disabled: session is not LIVE.');
    return;
  }
  if (player.state.status !== 'ACTIVE') {
    deny('Trading disabled: player is not ACTIVE.');
    return;
  }
  if (player.respawnCooldownEndsAt && Date.now() < player.respawnCooldownEndsAt) {
    deny('Trading paused: respawning.');
    return;
  }
  if (room.pauseEndsAt && Date.now() < room.pauseEndsAt) {
    deny('Trading paused.');
    return;
  }
  if (player.pendingEvent && player.personalEventEndsAt && Date.now() < player.personalEventEndsAt) {
    deny('Trading paused: personal event.');
    return;
  }

  const price = room.market.price;
  if (!Number.isFinite(price) || price <= 0) {
    deny('Trading disabled: invalid market price.');
    return;
  }

  if (trade.action === 'OPEN') {
    const side = trade.side === 'SHORT' ? 'SHORT' : 'LONG';
    const leverageInput = trade.leverage ?? 1;
    if (!Number.isFinite(leverageInput)) return;
    const leverage = clamp(leverageInput, 1, MAX_LEVERAGE);

    const resolveMargin = (budget: number) => {
      let margin = 0;
      if (trade.sizeCash !== undefined) {
        if (!Number.isFinite(trade.sizeCash)) return 0;
        margin = clamp(trade.sizeCash, 0, budget);
      } else {
        const sizePercentInput = trade.sizePercent ?? 100;
        if (!Number.isFinite(sizePercentInput)) return 0;
        const sizePercent = clamp(sizePercentInput, 1, 100);
        margin = budget * (sizePercent / 100);
      }
      return margin;
    };

    const takeProfitPctInput = trade.takeProfitPct;
    const stopLossPctInput = trade.stopLossPct;
    const takeProfitPct = typeof takeProfitPctInput === 'number' && Number.isFinite(takeProfitPctInput)
      ? clamp(takeProfitPctInput, 1, 500)
      : null;
    const stopLossPct = typeof stopLossPctInput === 'number' && Number.isFinite(stopLossPctInput)
      ? clamp(stopLossPctInput, 1, 100)
      : null;

    if (!player.state.position) {
      const margin = resolveMargin(player.state.cash);
      if (margin <= 0) return;

      const size = (margin * leverage) / price;
      const liquidationPrice = side === 'LONG'
        ? price * (1 - 1 / leverage)
        : price * (1 + 1 / leverage);
      const takeProfitPrice = takeProfitPct !== null
        ? side === 'LONG'
          ? price * (1 + takeProfitPct / 100)
          : Math.max(0.00000001, price * (1 - takeProfitPct / 100))
        : null;
      const stopLossPrice = stopLossPct !== null
        ? side === 'LONG'
          ? Math.max(0.00000001, price * (1 - stopLossPct / 100))
          : price * (1 + stopLossPct / 100)
        : null;

      player.state.cash = Math.max(0, player.state.cash - margin);
      player.state.position = {
        side,
        entryPrice: price,
        size,
        margin,
        leverage,
        liquidationPrice: Math.max(0.00000001, liquidationPrice),
        takeProfitPrice,
        stopLossPrice,
        openedAt: Date.now(),
      };
      player.state.history.push({ type: 'OPEN', side, price, time: Date.now() });
      sendSelfState(player);
      pushChat(room, {
        id: randomUUID(),
        sender: 'SYSTEM',
        text: `${player.state.name} opened ${side} ${leverage}x @ ${price.toFixed(6)}`,
        type: 'system',
        createdAt: Date.now(),
      });
      broadcastPresence(room);
      return;
    }

    const position = player.state.position;
    if (side === position.side) {
      const margin = resolveMargin(player.state.cash);
      if (margin <= 0) return;
      const sizeDelta = (margin * leverage) / price;
      const totalSize = position.size + sizeDelta;
      const totalMargin = position.margin + margin;
      const entryPrice = (position.entryPrice * position.size + price * sizeDelta) / totalSize;
      const effectiveLeverage = clamp((totalSize * entryPrice) / totalMargin, 1, MAX_LEVERAGE);
      const liquidationPrice = position.side === 'LONG'
        ? entryPrice * (1 - 1 / effectiveLeverage)
        : entryPrice * (1 + 1 / effectiveLeverage);
      const takeProfitPrice = takeProfitPct !== null
        ? position.side === 'LONG'
          ? entryPrice * (1 + takeProfitPct / 100)
          : Math.max(0.00000001, entryPrice * (1 - takeProfitPct / 100))
        : position.takeProfitPrice ?? null;
      const stopLossPrice = stopLossPct !== null
        ? position.side === 'LONG'
          ? Math.max(0.00000001, entryPrice * (1 - stopLossPct / 100))
          : entryPrice * (1 + stopLossPct / 100)
        : position.stopLossPrice ?? null;

      player.state.cash = Math.max(0, player.state.cash - margin);
      player.state.position = {
        ...position,
        entryPrice,
        size: totalSize,
        margin: totalMargin,
        leverage: effectiveLeverage,
        liquidationPrice: Math.max(0.00000001, liquidationPrice),
        takeProfitPrice,
        stopLossPrice,
      };
      player.state.history.push({ type: 'OPEN', side, price, time: Date.now() });
      sendSelfState(player);
      pushChat(room, {
        id: randomUUID(),
        sender: 'SYSTEM',
        text: `${player.state.name} added ${side} @ ${price.toFixed(6)}`,
        type: 'system',
        createdAt: Date.now(),
      });
      broadcastPresence(room);
      return;
    }

    const reduceMargin = resolveMargin(position.margin);
    if (reduceMargin <= 0) return;
    const reduceFraction = reduceMargin / position.margin;
    const sizeDelta = position.size * reduceFraction;
    const pnlPerUnit = position.side === 'LONG' ? price - position.entryPrice : position.entryPrice - price;
    const realizedPnl = pnlPerUnit * sizeDelta;

    player.state.cash = player.state.cash + reduceMargin + realizedPnl;

    const remainingSize = position.size - sizeDelta;
    const remainingMargin = position.margin - reduceMargin;
    if (remainingSize <= 0 || remainingMargin <= 0) {
      player.state.history.push({ type: 'CLOSE', side: position.side, price, time: Date.now(), pnl: realizedPnl });
      player.state.position = null;
      updatePeakCash(player, price);
      sendSelfState(player);
      pushChat(room, {
        id: randomUUID(),
        sender: 'SYSTEM',
        text: `${player.state.name} closed ${position.side} @ ${price.toFixed(6)} (${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)} U)`,
        type: 'system',
        createdAt: Date.now(),
      });
      broadcastPresence(room);
      return;
    }

    const effectiveLeverage = clamp((remainingSize * position.entryPrice) / remainingMargin, 1, MAX_LEVERAGE);
    const liquidationPrice = position.side === 'LONG'
      ? position.entryPrice * (1 - 1 / effectiveLeverage)
      : position.entryPrice * (1 + 1 / effectiveLeverage);
    player.state.position = {
      ...position,
      size: remainingSize,
      margin: remainingMargin,
      leverage: effectiveLeverage,
      liquidationPrice: Math.max(0.00000001, liquidationPrice),
    };
    player.state.history.push({ type: 'CLOSE', side: position.side, price, time: Date.now(), pnl: realizedPnl });
    updatePeakCash(player, price);
    sendSelfState(player);
    pushChat(room, {
      id: randomUUID(),
      sender: 'SYSTEM',
      text: `${player.state.name} reduced ${position.side} @ ${price.toFixed(6)} (${realizedPnl >= 0 ? '+' : ''}${realizedPnl.toFixed(2)} U)`,
      type: 'system',
      createdAt: Date.now(),
    });
    broadcastPresence(room);
    return;
  }

  if (trade.action === 'CLOSE' && player.state.position) {
    const { side } = player.state.position;
    const pnl = getPnl(player.state.position, price);
    closePosition(player, price, true);
    pushChat(room, {
      id: randomUUID(),
      sender: 'SYSTEM',
      text: `${player.state.name} closed ${side} @ ${price.toFixed(6)} (${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} U)`,
      type: 'system',
      createdAt: Date.now(),
    });
    broadcastPresence(room);
  }
};

const handleJoin = async (ws: WebSocket, message: ClientMessage & { type: 'join' }) => {
  const clientId = sanitizeClientId(message.clientId || randomUUID());
  const roomId = sanitizeRoomId(message.roomId);
  const name = sanitizeName(message.playerName);
  const roleKey = DEFAULT_ROLE_KEY;
  const roomKey = sanitizeRoomKey(message.roomKey);

  // MVP: no spectators.
  const mode = 'player';

  let room = rooms.get(roomId);
  if (!room) {
    const maxPlayers = normalizeRoomPlayers(message.maxPlayers);
    const passcodeHash = roomKey ? hashRoomKey(roomKey) : null;
    const displayName = sanitizeRoomName(message.roomName, roomId);
    room = createRoom(roomId, displayName, CORE_PACK, { maxPlayers, passcodeHash });
    rooms.set(roomId, room);
  } else {
    // MVP: do not allow joining mid-game.
    if (room.status !== 'LOBBY' && room.status !== 'COUNTDOWN') {
      send(ws, { type: 'error', message: 'Game already started.' });
      return;
    }

    // Allow host to update display name while in lobby.
    if (room.hostId === clientId && room.status === 'LOBBY') {
      room.displayName = sanitizeRoomName(message.roomName, room.roomId);
    }

    if (room.passcodeHash) {
      if (!roomKey || hashRoomKey(roomKey) !== room.passcodeHash) {
        send(ws, { type: 'error', message: 'Room key required.' });
        return;
      }
    }
  }

  let player = room.players.get(clientId);
  if (!player) {
    const activeCount = getActivePlayerCount(room);
    if (activeCount >= room.maxPlayers) {
      send(ws, { type: 'error', message: 'Room is full.' });
      return;
    }
    player = createPlayerRuntime(clientId, name, roleKey, room.pack);
    room.players.set(clientId, player);
  } else {
    player.name = name;
  }

  room.clients.add(ws);
  connections.set(clientId, ws);
  clients.set(ws, { clientId, roomId, mode: 'player' });

  if (!room.hostId && mode === 'player') {
    room.hostId = clientId;

    // Friendly default: if the room name is still the raw room code, rename it to the host's room.
    if (room.displayName === room.roomId) {
      room.displayName = sanitizeRoomName(message.roomName, `${name}'s Room`);
    }
  }

  if (room.status === 'COUNTDOWN' && !arePlayersReady(room)) {
    resetCountdown(room);
  }

  if (message.packId && mode === 'player' && room.status === 'LOBBY' && room.hostId === clientId) {
    const packRecord = await getPackById(message.packId);
    if (packRecord) {
      room.pack = {
        id: packRecord.summary.id,
        name: packRecord.summary.name,
        description: packRecord.summary.description,
        version: packRecord.summary.version,
        settings: packRecord.data.settings,
        personalEvents: packRecord.data.personalEvents,
        marketEvents: packRecord.data.marketEvents,
        dailyExpenses: packRecord.data.dailyExpenses,
      };
      scheduleMarketEvent(room);
      scheduleNpcChat(room);
    }
  }

  send(ws, { type: 'connected', clientId, roomId, isHost: room.hostId === clientId });
  broadcastRoomState(room);
  send(ws, { type: 'leaderboard', entries: globalLeaderboard });

  const packs = await listPacks();
  send(ws, { type: 'packs', packs });
  broadcastPresence(room);
  broadcastRoomList();
};

const handlePackUpdate = async (ws: WebSocket, player: PlayerRuntime | null, message: ClientMessage) => {
  if (!player) return;
  if (!isDbReady()) {
    send(ws, { type: 'error', message: 'Database not configured.' });
    return;
  }

  if (message.type === 'create_pack') {
    const parsed = packSchema.safeParse(message.pack);
    if (!parsed.success) {
      send(ws, { type: 'error', message: 'Invalid pack payload.' });
      return;
    }

    const editToken = randomUUID();
    const result = await createPack(parsed.data, {
      userId: player.auth?.userId ?? null,
      walletAddress: player.auth?.walletAddress ?? null,
      editToken,
    });
    if (!result) {
      send(ws, { type: 'error', message: 'Failed to create pack.' });
      return;
    }
    send(ws, { type: 'pack_created', pack: result.summary, editToken: result.editToken ?? undefined });
    const packs = await listPacks();
    broadcastPacks(packs);
    return;
  }

  if (message.type === 'update_pack') {
    if (message.packId === CORE_PACK.id) {
      send(ws, { type: 'error', message: 'Core pack cannot be edited.' });
      return;
    }
    const parsed = packSchema.safeParse(message.pack);
    if (!parsed.success) {
      send(ws, { type: 'error', message: 'Invalid pack payload.' });
      return;
    }

    const row = await getPackRow(message.packId);
    if (!row) {
      send(ws, { type: 'error', message: 'Pack not found.' });
      return;
    }

    const canEdit = (ALLOW_ANON_PACK_EDIT && message.editToken && row.editToken === message.editToken)
      || (player.auth?.userId && row.creatorUserId && player.auth.userId === row.creatorUserId);

    if (!canEdit) {
      send(ws, { type: 'error', message: 'Not authorized to edit this pack.' });
      return;
    }

    const updated = await updatePack(message.packId, parsed.data);
    if (!updated) {
      send(ws, { type: 'error', message: 'Failed to update pack.' });
      return;
    }
    send(ws, { type: 'pack_updated', pack: updated });
    const packs = await listPacks();
    broadcastPacks(packs);
    return;
  }

  if (message.type === 'delete_pack') {
    if (message.packId === CORE_PACK.id) {
      send(ws, { type: 'error', message: 'Core pack cannot be deleted.' });
      return;
    }
    const row = await getPackRow(message.packId);
    if (!row) {
      send(ws, { type: 'error', message: 'Pack not found.' });
      return;
    }

    const canEdit = (ALLOW_ANON_PACK_EDIT && message.editToken && row.editToken === message.editToken)
      || (player.auth?.userId && row.creatorUserId && player.auth.userId === row.creatorUserId);

    if (!canEdit) {
      send(ws, { type: 'error', message: 'Not authorized to delete this pack.' });
      return;
    }

    const deleted = await deletePack(message.packId);
    if (!deleted) {
      send(ws, { type: 'error', message: 'Failed to delete pack.' });
      return;
    }
    send(ws, { type: 'pack_deleted', packId: message.packId });
    const packs = await listPacks();
    broadcastPacks(packs);
  }
};

const handleMessage = async (ws: WebSocket, raw: string) => {
  let message: ClientMessage;
  try {
    message = JSON.parse(raw);
  } catch {
    send(ws, { type: 'error', message: 'Invalid JSON payload.' });
    return;
  }

  if (message.type === 'join') {
    await handleJoin(ws, message);
    return;
  }

  if (message.type === 'list_rooms') {
    send(ws, { type: 'rooms', rooms: listRooms() });
    return;
  }

  if (message.type === 'list_packs') {
    const packs = await listPacks();
    send(ws, { type: 'packs', packs });
    return;
  }

  if (message.type === 'get_pack') {
    const packRecord = await getPackById(message.packId);
    if (!packRecord) {
      send(ws, { type: 'error', message: 'Pack not found.' });
      return;
    }
    send(ws, { type: 'pack_detail', packId: message.packId, pack: packRecord.data });
    return;
  }

  const context = clients.get(ws);
  if (!context) {
    send(ws, { type: 'error', message: 'Join a room first.' });
    return;
  }

  const room = rooms.get(context.roomId);
  if (!room) return;
  const player = room.players.get(context.clientId) ?? null;
  const spectator = room.spectators.get(context.clientId) ?? null;

  switch (message.type) {
    case 'chat': {
      if (room.status === 'ENDED') return;
      const text = sanitizeMessage(message.text);
      if (!text) return;
      const senderName = context.mode === 'spectator'
        ? spectator?.name ?? 'Spectator'
        : player?.name ?? 'Guest';
      const senderHandle = context.mode === 'spectator'
        ? spectator?.auth?.handle ?? null
        : player?.auth?.handle ?? null;
      const senderAvatarUrl = context.mode === 'spectator'
        ? spectator?.auth?.avatarUrl ?? null
        : player?.auth?.avatarUrl ?? null;
      pushChat(room, {
        id: randomUUID(),
        sender: senderName,
        text,
        type: context.mode === 'spectator' ? 'spectator' : 'chat',
        senderType: context.mode,
        senderHandle,
        senderAvatarUrl,
        createdAt: Date.now(),
      });
      return;
    }
    case 'trade': {
      if (player) {
        handleTrade(room, player, message.trade);
      }
      return;
    }
    case 'event_choice': {
      if (!player || !player.pendingEvent) return;
      if (player.pendingEvent.id !== message.eventId) return;
      if (player.personalEventEndsAt && Date.now() > player.personalEventEndsAt) {
        return;
      }
      const choice = player.pendingEvent.choices.find((item: PersonalEvent['choices'][number]) => item.id === message.choiceId);
      if (!choice) return;
      resolvePersonalEvent(room, player, choice);
      return;
    }
    case 'set_ready': {
      if (!player || (room.status !== 'LOBBY' && room.status !== 'COUNTDOWN')) return;
      player.state.ready = Boolean(message.ready);
      broadcastPresence(room);
      if (room.status === 'COUNTDOWN' && !arePlayersReady(room)) {
        resetCountdown(room);
        broadcastRoomList();
      }
      return;
    }
    case 'start_countdown': {
      if ((room.status !== 'LOBBY' && room.status !== 'ENDED') || room.hostId !== player?.id) return;
      if (!arePlayersReady(room)) {
        send(ws, { type: 'error', message: 'Waiting for everyone to ready up.' });
        return;
      }
      room.status = 'COUNTDOWN';
      room.countdownEndsAt = Date.now() + COUNTDOWN_MS;
      broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
      broadcastRoomList();
      return;
    }
    case 'kick_player': {
      if (!player || room.hostId !== player.id) return;
      if (room.status !== 'LOBBY' && room.status !== 'COUNTDOWN') return;
      const targetId = sanitizeClientId(message.playerId);
      if (!room.players.has(targetId)) return;
      if (targetId === room.hostId) return;

      room.players.delete(targetId);

      const targetWs = connections.get(targetId);
      if (targetWs) {
        try {
          targetWs.close();
        } catch {
          // ignore
        }
        connections.delete(targetId);
        clients.delete(targetWs);
      }

      if (room.status === 'COUNTDOWN' && !arePlayersReady(room)) {
        resetCountdown(room);
      }

      broadcastRoomState(room);
      broadcastPresence(room);
      broadcastRoomList();
      return;
    }
    case 'set_pack': {
      if (room.status !== 'LOBBY' || room.hostId !== player?.id) return;
      const packRecord = await getPackById(message.packId);
      if (!packRecord) {
        send(ws, { type: 'error', message: 'Pack not found.' });
        return;
      }
      room.pack = {
        id: packRecord.summary.id,
        name: packRecord.summary.name,
        description: packRecord.summary.description,
        version: packRecord.summary.version,
        settings: packRecord.data.settings,
        personalEvents: packRecord.data.personalEvents,
        marketEvents: packRecord.data.marketEvents,
        dailyExpenses: packRecord.data.dailyExpenses,
      };
      scheduleMarketEvent(room);
      for (const runtime of room.players.values()) {
        schedulePersonalEvent(room, runtime);
      }
      broadcastRoomState(room);
      broadcastRoomList();
      return;
    }
    case 'set_room_key': {
      if (room.status !== 'LOBBY' || room.hostId !== player?.id) return;
      const key = sanitizeRoomKey(message.roomKey);
      room.passcodeHash = key ? hashRoomKey(key) : null;
      broadcastRoomState(room);
      broadcastRoomList();
      return;
    }
    case 'update_name': {
      if (!player) return;
      const nextName = sanitizeName(message.name);
      player.name = nextName;
      player.state.name = nextName;
      if (room.hostId === player.id && room.status === 'LOBBY') {
        room.displayName = sanitizeRoomName(room.displayName, `${nextName}'s Room`);
      }
      sendSelfState(player);
      broadcastPresence(room);
      broadcastRoomList();
      return;
    }
    case 'create_pack':
    case 'update_pack':
    case 'delete_pack': {
      await handlePackUpdate(ws, player, message);
      return;
    }
    case 'auth': {
      if (!privyEnabled) return;
      try {
        const result = await verifyPrivyAccess(message.accessToken, message.identityToken);
        if (player) {
          player.auth = result;
        }
        if (spectator) {
          spectator.auth = result;
        }
        broadcastPresence(room);
      } catch {
        send(ws, { type: 'error', message: 'Auth failed.' });
      }
      return;
    }
    case 'claim_leaderboard': {
      if (!player) return;
      const sessionKey = getSessionKey(room);
      const submittedSession = submittedLeaderboardClients.get(player.id);
      if (submittedSession && submittedSession === sessionKey) {
        if (player.lastLeaderboardEntry) {
          send(ws, { type: 'leaderboard_submitted', entry: player.lastLeaderboardEntry });
          return;
        }
        send(ws, { type: 'error', message: 'Leaderboard already submitted.' });
        return;
      }
      if (player.leaderboardSubmitted && submittedSession === sessionKey) {
        if (player.lastLeaderboardEntry) {
          send(ws, { type: 'leaderboard_submitted', entry: player.lastLeaderboardEntry });
          return;
        }
        send(ws, { type: 'error', message: 'Leaderboard already submitted.' });
        return;
      }
      const dbStatus = getDbStatus();
      if (!dbStatus.configured && !ALLOW_MEMORY_LEADERBOARD) {
        send(ws, { type: 'error', message: 'Database not configured. Set DATABASE_URL or DB_URL.' });
        return;
      }
      if (dbStatus.configured && !dbStatus.healthy && !ALLOW_MEMORY_LEADERBOARD) {
        const err = dbStatus.lastError ?? '';
        if (/relation .*leaderboard_entries/i.test(err) || /relation .*sessions/i.test(err)) {
          send(ws, { type: 'error', message: 'Database schema missing. Run pnpm db:push.' });
          return;
        }
        send(ws, { type: 'error', message: 'Database unavailable.' });
        return;
      }
      if (REQUIRE_PRIVY_FOR_LEADERBOARD && !player.auth?.userId) {
        if (!privyEnabled) {
          send(ws, { type: 'error', message: 'Privy not configured on server.' });
          return;
        }
        send(ws, { type: 'error', message: 'Login required to submit leaderboard.' });
        return;
      }

      const claimedName = message.playerName ? sanitizeName(message.playerName) : player.state.name;
      const cash = getNetWorth(player, room.market.price);
      const peakCash = Math.max(player.peakCash, cash);
      const roi = player.state.initialCash > 0
        ? ((cash - player.state.initialCash) / player.state.initialCash) * 100
        : 0;

      const entryPayload = {
        sessionId: room.sessionId,
        roomId: room.roomId,
        playerName: claimedName,
        handle: player.auth?.handle ?? null,
        avatarUrl: player.auth?.avatarUrl ?? null,
        role: player.roleName,
        cash,
        peakCash,
        roi,
        daysSurvived: room.currentDay,
        walletAddress: player.auth?.walletAddress ?? null,
        userId: player.auth?.userId ?? null,
      };

      const dbInsert = isDbReady()
        ? await insertLeaderboardEntry(entryPayload)
        : null;
      const inserted = dbInsert ?? (ALLOW_MEMORY_LEADERBOARD
        ? insertMemoryLeaderboardEntry({
          playerName: entryPayload.playerName,
          handle: entryPayload.handle,
          avatarUrl: entryPayload.avatarUrl,
          role: entryPayload.role,
          cash: entryPayload.cash,
          peakCash: entryPayload.peakCash,
          roi: entryPayload.roi,
          daysSurvived: entryPayload.daysSurvived,
          walletAddress: entryPayload.walletAddress,
        })
        : null);

      if (!inserted) {
        send(ws, { type: 'error', message: 'Leaderboard service unavailable.' });
        return;
      }

      player.leaderboardSubmitted = true;
      player.lastLeaderboardEntry = inserted;
      submittedLeaderboardClients.set(player.id, sessionKey);
      if (!globalLeaderboard.find((entry) => entry.id === inserted.id)) {
        globalLeaderboard = [inserted, ...globalLeaderboard]
          .sort((a, b) => b.roi - a.roi)
          .slice(0, MAX_LEADERBOARD);
      }
      broadcastLeaderboard();
      if (isDbReady()) {
        void refreshLeaderboard().then(() => broadcastLeaderboard()).catch(() => {
          // ignore refresh errors
        });
      }
      send(ws, { type: 'leaderboard_submitted', entry: inserted });
      return;
    }
    case 'ping': {
      send(ws, { type: 'pong' });
      return;
    }
    default:
      return;
  }
};

const tickRooms = async () => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (room.status === 'COUNTDOWN' && room.countdownEndsAt && now >= room.countdownEndsAt) {
      await maybeStartSession(room);
    }

    if (room.status !== 'LIVE') continue;

    if (room.endsAt && now >= room.endsAt) {
      await endRoomSession(room);
      continue;
    }

    if (room.pauseEndsAt) {
      if (now < room.pauseEndsAt) {
        broadcastPresence(room);
        continue;
      }
      room.pauseEndsAt = null;
      broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
    }

    const { newCandles, newPrice, newPhase, newVolatility } = simulateMarketTick(room.market);
    room.market = {
      ...room.market,
      candles: newCandles,
      price: newPrice,
      phase: newPhase,
      volatility: newVolatility,
    };
    broadcast(room, { type: 'market_tick', market: room.market });

    if (room.startedAt) {
      const dayLength = SESSION_DURATION_MS / DAYS_PER_SESSION;
      const day = Math.min(DAYS_PER_SESSION, Math.floor((now - room.startedAt) / dayLength) + 1);
      if (day !== room.currentDay) {
        room.currentDay = day;
        for (const player of room.players.values()) {
          if (player.state.status === 'ACTIVE' && player.lastExpenseDay < day) {
            applyDailyExpense(room, player);
            player.lastExpenseDay = day;
          }
        }
        broadcast(room, { type: 'session_status', session: buildSessionSnapshot(room) });
      }
    }

    if (now >= room.nextMarketEventAt) {
      maybeApplyMarketEvent(room);
    }

    if (now >= room.nextNpcChatAt) {
      maybeSendNpcChat(room);
    }

    let activePlayers = 0;
    for (const player of room.players.values()) {
      if (player.state.status === 'ACTIVE') {
        const liquidated = checkLiquidation(player, room.market.price);
        if (!liquidated) {
          checkStops(player, room.market.price);
        }
        const netWorth = getNetWorth(player, room.market.price);
        updatePeakCash(player, room.market.price);
        if (liquidated || netWorth <= 0) {
          respawnPlayer(room, player, 'BROKE', netWorth);
        }
      }

      if (player.state.status === 'ACTIVE') {
        activePlayers += 1;
      }

      maybeResolveExpiredPersonalEvent(room, player, now);
      maybeSendPersonalEvent(room, player);
      sendSelfState(player);
    }

    if (activePlayers === 0) {
      await endRoomSession(room);
      continue;
    }

    broadcastPresence(room);
  }
};

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  const isOptions = req.method === 'OPTIONS';
  if (isOptions) {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  if (url.startsWith('/rooms')) {
    const payload = JSON.stringify({ rooms: listRooms() });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(payload);
    return;
  }

  if (url.startsWith('/leaderboard')) {
    if (req.method === 'POST' && url.startsWith('/leaderboard/submit')) {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body) as { clientId?: string; playerName?: string };
          const clientId = sanitizeClientId(payload.clientId ?? '');
          const entry = recentLeaderboardResults.get(clientId);
          if (!entry) {
            res.writeHead(404, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'No result found for client.' }));
            return;
          }
          const submittedSession = submittedLeaderboardClients.get(clientId);
          if (submittedSession && submittedSession === entry.sessionKey) {
            res.writeHead(409, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Already submitted.' }));
            return;
          }

          const dbStatus = getDbStatus();
          if (!dbStatus.configured && !ALLOW_MEMORY_LEADERBOARD) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Database not configured. Set DATABASE_URL or DB_URL.' }));
            return;
          }
          if (dbStatus.configured && !dbStatus.healthy && !ALLOW_MEMORY_LEADERBOARD) {
            res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Database unavailable.' }));
            return;
          }

          const claimedName = payload.playerName ? sanitizeName(payload.playerName) : entry.playerName;
          const entryPayload = {
            sessionId: entry.sessionId,
            roomId: entry.roomId,
            playerName: claimedName,
            handle: entry.handle,
            avatarUrl: entry.avatarUrl,
            role: entry.role,
            cash: entry.cash,
            peakCash: entry.peakCash,
            roi: entry.roi,
            daysSurvived: entry.daysSurvived,
            walletAddress: entry.walletAddress,
            userId: entry.userId,
          };
          const inserted = isDbReady()
            ? await insertLeaderboardEntry(entryPayload)
            : insertMemoryLeaderboardEntry({
              playerName: entryPayload.playerName,
              handle: entryPayload.handle,
              avatarUrl: entryPayload.avatarUrl,
              role: entryPayload.role,
              cash: entryPayload.cash,
              peakCash: entryPayload.peakCash,
              roi: entryPayload.roi,
              daysSurvived: entryPayload.daysSurvived,
              walletAddress: entryPayload.walletAddress,
            });

          if (!inserted) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Failed to submit leaderboard.' }));
            return;
          }

          submittedLeaderboardClients.set(clientId, entry.sessionKey);
          if (!globalLeaderboard.find((row) => row.id === inserted.id)) {
            globalLeaderboard = [inserted, ...globalLeaderboard]
              .sort((a, b) => b.roi - a.roi)
              .slice(0, MAX_LEADERBOARD);
          }
          for (const room of rooms.values()) {
            const runtime = room.players.get(clientId);
            if (runtime) {
              runtime.leaderboardSubmitted = true;
              runtime.lastLeaderboardEntry = inserted;
            }
          }
          broadcastLeaderboard();
          if (isDbReady()) {
            void refreshLeaderboard().then(() => broadcastLeaderboard()).catch(() => undefined);
          }

          res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ entry: inserted }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Invalid request.' }));
        }
      });
      return;
    }

    const payload = JSON.stringify({ leaderboard: globalLeaderboard });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(payload);
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  ws.on('message', async (data) => {
    await handleMessage(ws, data.toString());
  });

  ws.on('close', () => {
    const context = clients.get(ws);
    if (!context) return;
    const room = rooms.get(context.roomId);
    if (!room) return;
    room.clients.delete(ws);
    connections.delete(context.clientId);

    if (room.status !== 'LIVE') {
      room.players.delete(context.clientId);
    }

    if (room.hostId === context.clientId) {
      const nextHost = Array.from(room.players.keys()).find((id) => connections.has(id));
      room.hostId = nextHost ?? null;
    }

    if (room.status === 'COUNTDOWN' && !arePlayersReady(room)) {
      resetCountdown(room);
    }

    broadcastPresence(room);
    if (room.clients.size === 0) {
      rooms.delete(room.roomId);
    }
    broadcastRoomList();
  });
});

server.listen(PORT, async () => {
  await refreshLeaderboard();
  console.log(`PK Candle WS server on :${PORT}`);
});

setInterval(() => {
  void tickRooms();
}, TICK_INTERVAL_MS);
