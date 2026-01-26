import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { desc, eq, sql } from 'drizzle-orm';
import type { EventPackInput, EventPackSummary, LeaderboardEntry } from '@pk-candle/shared';
import { CORE_PACK } from '@pk-candle/shared';
import { eventPacks, leaderboardEntries, sessions } from './schema';

const databaseUrl = process.env.DATABASE_URL;

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

if (databaseUrl) {
  pool = new Pool({ connectionString: databaseUrl });
  db = drizzle(pool);
}

export const isDbReady = () => Boolean(db);

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
  const [row] = await db
    .insert(sessions)
    .values({ roomId, packId })
    .returning();
  return row?.id ?? null;
};

export const endSession = async (sessionId: string) => {
  if (!db) return;
  await db
    .update(sessions)
    .set({ endedAt: new Date() })
    .where(eq(sessions.id, sessionId));
};

export const insertLeaderboardEntry = async (entry: Omit<LeaderboardEntry, 'id' | 'createdAt'> & {
  sessionId?: string | null;
  roomId: string;
  userId?: string | null;
}) => {
  if (!db) return null;
  const [row] = await db
    .insert(leaderboardEntries)
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
    .returning();

  return row ? toLeaderboardEntry(row) : null;
};

export const fetchLeaderboard = async (limit: number) => {
  if (!db) return [] as LeaderboardEntry[];
  const rows = await db
    .select()
    .from(leaderboardEntries)
    .orderBy(desc(leaderboardEntries.roi))
    .limit(limit);
  return rows.map(toLeaderboardEntry);
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

  const rows = await db.select().from(eventPacks).orderBy(desc(eventPacks.updatedAt));
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
  const [row] = await db.select().from(eventPacks).where(eq(eventPacks.id, packId));
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
  const [row] = await db
    .insert(eventPacks)
    .values({
      name: pack.name,
      description: pack.description,
      data: pack,
      creatorUserId: options.userId ?? null,
      creatorWallet: options.walletAddress ?? null,
      editToken: options.editToken ?? null,
    })
    .returning();
  if (!row) return null;
  return {
    summary: toPackSummary(row, pack),
    editToken: row.editToken,
  };
};

export const updatePack = async (packId: string, pack: EventPackInput) => {
  if (!db) return null;
  const [row] = await db
    .update(eventPacks)
    .set({
      name: pack.name,
      description: pack.description,
      data: pack,
      version: sql`version + 1`,
      updatedAt: new Date(),
    })
    .where(eq(eventPacks.id, packId))
    .returning();
  if (!row) return null;
  return toPackSummary(row, pack);
};

export const deletePack = async (packId: string) => {
  if (!db) return false;
  const rows = await db.delete(eventPacks).where(eq(eventPacks.id, packId)).returning();
  return rows.length > 0;
};

export const getPackRow = async (packId: string) => {
  if (!db) return null;
  const [row] = await db.select().from(eventPacks).where(eq(eventPacks.id, packId));
  return row ?? null;
};

export const closeDb = async () => {
  if (pool) {
    await pool.end();
  }
};
