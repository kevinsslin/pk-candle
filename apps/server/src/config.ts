const env = process.env;

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
};

export const PORT = toNumber(env.PORT, 8080);
export const TICK_INTERVAL_MS = toNumber(env.TICK_INTERVAL_MS, 1000);
export const SESSION_DURATION_MS = toNumber(env.SESSION_DURATION_MS, 3 * 60 * 1000);
export const COUNTDOWN_MS = 5 * 1000;
export const EVENT_PAUSE_MS = 5 * 1000;
export const DAYS_PER_SESSION = toNumber(env.DAYS_PER_SESSION, 6);
export const MAX_CHAT_HISTORY = toNumber(env.MAX_CHAT_HISTORY, 120);
export const MAX_LEADERBOARD = toNumber(env.MAX_LEADERBOARD, 50);
export const MAX_LEVERAGE = toNumber(env.MAX_LEVERAGE, 100);
export const REQUIRE_PRIVY_FOR_LEADERBOARD = toBool(env.REQUIRE_PRIVY_FOR_LEADERBOARD, false);
export const ALLOW_MEMORY_LEADERBOARD = toBool(env.ALLOW_MEMORY_LEADERBOARD, true);
export const AUTO_SUBMIT_LEADERBOARD = toBool(env.AUTO_SUBMIT_LEADERBOARD, false);
export const ALLOW_ANON_PACK_EDIT = toBool(env.ALLOW_ANON_PACK_EDIT, true);
// MVP: allow solo start; maxPlayers is the only meaningful constraint.
export const MIN_ROOM_PLAYERS = toNumber(env.MIN_ROOM_PLAYERS, 1);
export const MAX_ROOM_PLAYERS = toNumber(env.MAX_ROOM_PLAYERS, 6);
export const DEFAULT_ROOM_PLAYERS = toNumber(env.DEFAULT_ROOM_PLAYERS, 6);
