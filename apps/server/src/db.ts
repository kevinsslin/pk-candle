import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { EventPackInput, EventPackSummary, LeaderboardEntry } from '@pk-candle/shared';
import { CORE_PACK } from '@pk-candle/shared';
import { eventPacks, leaderboardEntries, playerRatings, rankedMatchPlayers, rankedMatches, rankedSeasons, sessions } from './schema';

const databaseUrl = process.env.DATABASE_URL ?? process.env.DB_URL;
const DB_CONNECT_TIMEOUT_MS = Number(process.env.DB_CONNECT_TIMEOUT_MS ?? 5000);
const DB_QUERY_TIMEOUT_MS = Number(process.env.DB_QUERY_TIMEOUT_MS ?? 5000);

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;
let dbHealthy = Boolean(databaseUrl);
let lastDbError: string | null = null;

if (databaseUrl) {
  pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: DB_CONNECT_TIMEOUT_MS,
    query_timeout: DB_QUERY_TIMEOUT_MS,
  });
  pool.on('error', (err) => {
    dbHealthy = false;
    console.warn('[db] pool error', err);
  });
  db = drizzle(pool);
}

export const getDbStatus = () => ({
  configured: Boolean(databaseUrl),
  healthy: dbHealthy,
  lastError: lastDbError,
});

export const isDbReady = () => Boolean(db && dbHealthy);

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  if (!DB_QUERY_TIMEOUT_MS || DB_QUERY_TIMEOUT_MS <= 0) return promise;
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB timeout: ${label}`)), DB_QUERY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const runQuery = async <T>(promise: Promise<T>, label: string): Promise<T | null> => {
  if (!db) return null;
  try {
    const result = await withTimeout(promise, label);
    dbHealthy = true;
    lastDbError = null;
    return result;
  } catch (err) {
    dbHealthy = false;
    lastDbError = err instanceof Error ? err.message : String(err);
    console.warn('[db] query failed', err);
    return null;
  }
};

const toNumber = (value: unknown) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return 0;
};

const toLeaderboardEntry = (row: typeof leaderboardEntries.$inferSelect): LeaderboardEntry => ({
  id: row.id,
  playerName: row.playerName,
  handle: row.handle ?? null,
  avatarUrl: row.avatarUrl ?? null,
  role: row.role,
  cash: toNumber(row.cash),
  peakCash: toNumber(row.peakCash),
  roi: toNumber(row.roi),
  daysSurvived: row.daysSurvived,
  walletAddress: row.walletAddress ?? null,
  createdAt: row.createdAt ? row.createdAt.getTime() : Date.now(),
});

const toPackSummary = (
  row: typeof eventPacks.$inferSelect,
  data: EventPackInput
): EventPackSummary => ({
  id: row.id,
  name: row.name,
  description: row.description,
  version: row.version,
  personalEventCount: data.personalEvents.length,
  marketEventCount: data.marketEvents.length,
  updatedAt: row.updatedAt ? row.updatedAt.getTime() : null,
});

export const createSession = async (roomId: string, packId: string | null) => {
  if (!db) return null;
  const rows = await runQuery(
    db.insert(sessions).values({ roomId, packId }).returning(),
    'createSession',
  );
  const row = rows?.[0];
  return row?.id ?? null;
};

export const endSession = async (sessionId: string) => {
  if (!db) return;
  await runQuery(
    db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, sessionId)),
    'endSession',
  );
};

export const insertLeaderboardEntry = async (entry: Omit<LeaderboardEntry, 'id' | 'createdAt'> & {
  sessionId?: string | null;
  roomId: string;
  userId?: string | null;
}) => {
  if (!db) return null;
  const rows = await runQuery(
    db.insert(leaderboardEntries)
      .values({
        sessionId: entry.sessionId ?? null,
        roomId: entry.roomId,
        playerName: entry.playerName,
        handle: entry.handle,
        avatarUrl: entry.avatarUrl,
        role: entry.role,
        cash: entry.cash.toFixed(2),
        peakCash: entry.peakCash.toFixed(2),
        roi: entry.roi.toFixed(2),
        daysSurvived: entry.daysSurvived,
        walletAddress: entry.walletAddress,
        userId: entry.userId ?? null,
      })
      .returning(),
    'insertLeaderboardEntry',
  );
  const row = rows?.[0];
  return row ? toLeaderboardEntry(row) : null;
};

export const fetchLeaderboard = async (limit: number) => {
  if (!db) return [] as LeaderboardEntry[];
  const rows = await runQuery(
    db.select().from(leaderboardEntries).orderBy(desc(leaderboardEntries.roi)).limit(limit),
    'fetchLeaderboard',
  );
  if (!rows) return [] as LeaderboardEntry[];
  return rows.map(toLeaderboardEntry);
};

type PlayerRatingRow = {
  seasonId: string;
  walletAddress: string;
  playerName: string;
  rating: number;
  matchesPlayed: number;
  updatedAt: number;
};

const memoryRatings = new Map<string, PlayerRatingRow>();

const ratingKey = (seasonId: string, walletAddress: string) => `${seasonId}:${walletAddress.toLowerCase()}`;

export const ensureRankedSeason = async (seasonId: string, name: string) => {
  if (!db) return null;
  const rows = await runQuery(
    db.select().from(rankedSeasons).where(eq(rankedSeasons.id, seasonId)),
    'ensureRankedSeason:select',
  );
  if (rows && rows.length > 0) return rows[0];
  const inserted = await runQuery(
    db.insert(rankedSeasons).values({ id: seasonId, name }).returning(),
    'ensureRankedSeason:insert',
  );
  return inserted?.[0] ?? null;
};

export const getOrCreatePlayerRating = async (params: {
  seasonId: string;
  walletAddress: string;
  playerName: string;
  defaultRating: number;
}) => {
  const key = ratingKey(params.seasonId, params.walletAddress);
  if (!db) {
    const existing = memoryRatings.get(key);
    if (existing) return existing;
    const created: PlayerRatingRow = {
      seasonId: params.seasonId,
      walletAddress: params.walletAddress,
      playerName: params.playerName,
      rating: params.defaultRating,
      matchesPlayed: 0,
      updatedAt: Date.now(),
    };
    memoryRatings.set(key, created);
    return created;
  }

  const rows = await runQuery(
    db.select()
      .from(playerRatings)
      .where(and(
        eq(playerRatings.walletAddress, params.walletAddress),
        eq(playerRatings.seasonId, params.seasonId),
      ))
      .limit(1),
    'getOrCreatePlayerRating:select',
  );
  const row = rows?.[0];
  if (row) {
    return {
      seasonId: row.seasonId,
      walletAddress: row.walletAddress,
      playerName: row.playerName,
      rating: row.rating,
      matchesPlayed: row.matchesPlayed,
      updatedAt: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
    };
  }

  const inserted = await runQuery(
    db.insert(playerRatings).values({
      seasonId: params.seasonId,
      walletAddress: params.walletAddress,
      playerName: params.playerName,
      rating: params.defaultRating,
      matchesPlayed: 0,
    }).returning(),
    'getOrCreatePlayerRating:insert',
  );
  const created = inserted?.[0];
  if (!created) {
    return {
      seasonId: params.seasonId,
      walletAddress: params.walletAddress,
      playerName: params.playerName,
      rating: params.defaultRating,
      matchesPlayed: 0,
      updatedAt: Date.now(),
    };
  }
  return {
    seasonId: created.seasonId,
    walletAddress: created.walletAddress,
    playerName: created.playerName,
    rating: created.rating,
    matchesPlayed: created.matchesPlayed,
    updatedAt: created.updatedAt ? created.updatedAt.getTime() : Date.now(),
  };
};

export const updatePlayerRating = async (params: {
  seasonId: string;
  walletAddress: string;
  playerName: string;
  rating: number;
  matchesPlayed: number;
}) => {
  const key = ratingKey(params.seasonId, params.walletAddress);
  if (!db) {
    memoryRatings.set(key, {
      seasonId: params.seasonId,
      walletAddress: params.walletAddress,
      playerName: params.playerName,
      rating: params.rating,
      matchesPlayed: params.matchesPlayed,
      updatedAt: Date.now(),
    });
    return;
  }
  await runQuery(
    db.update(playerRatings)
      .set({
        playerName: params.playerName,
        rating: params.rating,
        matchesPlayed: params.matchesPlayed,
        updatedAt: new Date(),
      })
      .where(and(
        eq(playerRatings.walletAddress, params.walletAddress),
        eq(playerRatings.seasonId, params.seasonId),
      )),
    'updatePlayerRating',
  );
};

export const insertRankedMatch = async (params: {
  matchId?: string;
  seasonId: string;
  roomId: string;
  playerCount: number;
}) => {
  if (!db) return null;
  const rows = await runQuery(
    db.insert(rankedMatches)
      .values({
        id: params.matchId ?? undefined,
        seasonId: params.seasonId,
        roomId: params.roomId,
        playerCount: params.playerCount,
      })
      .returning(),
    'insertRankedMatch',
  );
  return rows?.[0] ?? null;
};

export const insertRankedMatchPlayers = async (rows: Array<{
  matchId: string;
  walletAddress: string;
  playerName: string;
  placement: number;
  ratingBefore: number;
  ratingAfter: number;
  ratingDelta: number;
  cash: number;
  roi: number;
}>) => {
  if (!db || rows.length === 0) return;
  await runQuery(
    db.insert(rankedMatchPlayers).values(rows.map((row) => ({
      matchId: row.matchId,
      walletAddress: row.walletAddress,
      playerName: row.playerName,
      placement: row.placement,
      ratingBefore: row.ratingBefore,
      ratingAfter: row.ratingAfter,
      ratingDelta: row.ratingDelta,
      cash: row.cash.toFixed(2),
      roi: row.roi.toFixed(2),
    }))),
    'insertRankedMatchPlayers',
  );
};

export const fetchRankedLeaderboard = async (seasonId: string, limit: number): Promise<PlayerRatingRow[]> => {
  if (!db) {
    const entries = Array.from(memoryRatings.values())
      .filter((row) => row.seasonId === seasonId)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit);
    return entries;
  }
  const rows = await runQuery(
    db.select()
      .from(playerRatings)
      .where(eq(playerRatings.seasonId, seasonId))
      .orderBy(desc(playerRatings.rating))
      .limit(limit),
    'fetchRankedLeaderboard',
  );
  if (!rows) return [];
  return rows.map((row) => ({
    seasonId: row.seasonId,
    walletAddress: row.walletAddress,
    playerName: row.playerName,
    rating: row.rating,
    matchesPlayed: row.matchesPlayed,
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : Date.now(),
  }));
};

export const listPacks = async (): Promise<EventPackSummary[]> => {
  if (!db) {
    return [{
      id: CORE_PACK.id,
      name: CORE_PACK.name,
      description: CORE_PACK.description,
      version: CORE_PACK.version,
      personalEventCount: CORE_PACK.personalEvents.length,
      marketEventCount: CORE_PACK.marketEvents.length,
      updatedAt: null,
      isCore: true,
    }];
  }

  const rows = await runQuery(
    db.select().from(eventPacks).orderBy(desc(eventPacks.updatedAt)),
    'listPacks',
  );
  if (!rows) return [];
  const summaries = rows.map((row) => {
    const data = row.data as EventPackInput;
    return toPackSummary(row, data);
  });

  summaries.unshift({
    id: CORE_PACK.id,
    name: CORE_PACK.name,
    description: CORE_PACK.description,
    version: CORE_PACK.version,
    personalEventCount: CORE_PACK.personalEvents.length,
    marketEventCount: CORE_PACK.marketEvents.length,
    updatedAt: null,
    isCore: true,
  });

  return summaries;
};

export const getPackById = async (packId: string): Promise<{ data: EventPackInput; summary: EventPackSummary; editToken?: string | null } | null> => {
  if (packId === CORE_PACK.id) {
    return {
      data: {
        name: CORE_PACK.name,
        description: CORE_PACK.description,
        settings: CORE_PACK.settings,
        personalEvents: CORE_PACK.personalEvents,
        marketEvents: CORE_PACK.marketEvents,
        dailyExpenses: CORE_PACK.dailyExpenses,
      },
      summary: {
        id: CORE_PACK.id,
        name: CORE_PACK.name,
        description: CORE_PACK.description,
        version: CORE_PACK.version,
        personalEventCount: CORE_PACK.personalEvents.length,
        marketEventCount: CORE_PACK.marketEvents.length,
        updatedAt: null,
        isCore: true,
      },
    };
  }

  if (!db) return null;
  const rows = await runQuery(
    db.select().from(eventPacks).where(eq(eventPacks.id, packId)),
    'getPackById',
  );
  const row = rows?.[0];
  if (!row) return null;
  const data = row.data as EventPackInput;
  return {
    data,
    summary: toPackSummary(row, data),
    editToken: row.editToken,
  };
};

export const createPack = async (pack: EventPackInput, options: { userId?: string | null; walletAddress?: string | null; editToken?: string | null }) => {
  if (!db) return null;
  const rows = await runQuery(
    db.insert(eventPacks)
      .values({
        name: pack.name,
        description: pack.description,
        data: pack,
        creatorUserId: options.userId ?? null,
        creatorWallet: options.walletAddress ?? null,
        editToken: options.editToken ?? null,
      })
      .returning(),
    'createPack',
  );
  const row = rows?.[0];
  if (!row) return null;
  return {
    summary: toPackSummary(row, pack),
    editToken: row.editToken,
  };
};

export const updatePack = async (packId: string, pack: EventPackInput) => {
  if (!db) return null;
  const rows = await runQuery(
    db.update(eventPacks)
      .set({
        name: pack.name,
        description: pack.description,
        data: pack,
        version: sql`version + 1`,
        updatedAt: new Date(),
      })
      .where(eq(eventPacks.id, packId))
      .returning(),
    'updatePack',
  );
  const row = rows?.[0];
  if (!row) return null;
  return toPackSummary(row, pack);
};

export const deletePack = async (packId: string) => {
  if (!db) return false;
  const rows = await runQuery(
    db.delete(eventPacks).where(eq(eventPacks.id, packId)).returning(),
    'deletePack',
  );
  return Boolean(rows && rows.length > 0);
};

export const getPackRow = async (packId: string) => {
  if (!db) return null;
  const rows = await runQuery(
    db.select().from(eventPacks).where(eq(eventPacks.id, packId)),
    'getPackRow',
  );
  return rows?.[0] ?? null;
};

export const closeDb = async () => {
  if (pool) {
    await pool.end();
  }
};
