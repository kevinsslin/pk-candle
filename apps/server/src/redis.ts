import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;
const REDIS_CONNECT_TIMEOUT_MS = Number(process.env.REDIS_CONNECT_TIMEOUT_MS ?? 3000);
const REDIS_OP_TIMEOUT_MS = Number(process.env.REDIS_OP_TIMEOUT_MS ?? 2000);
let client: ReturnType<typeof createClient> | null = null;
let connecting: Promise<void> | null = null;

const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  if (!REDIS_OP_TIMEOUT_MS || REDIS_OP_TIMEOUT_MS <= 0) return promise;
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Redis timeout: ${label}`)), REDIS_OP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const ensureClient = async () => {
  if (!redisUrl) return null;
  if (!client) {
    client = createClient({
      url: redisUrl,
      socket: { connectTimeout: REDIS_CONNECT_TIMEOUT_MS },
    });
    client.on('error', (err) => {
      console.warn('[redis] client error', err);
    });
  }
  if (!client.isOpen) {
    if (!connecting) {
      connecting = withTimeout(client.connect(), 'connect').then(() => undefined).finally(() => {
        connecting = null;
      });
    }
    try {
      await connecting;
    } catch (err) {
      console.warn('[redis] connect failed', err);
      return null;
    }
  }
  return client;
};

export const getCachedLeaderboard = async () => {
  try {
    const redis = await ensureClient();
    if (!redis) return null;
    const data = await withTimeout(redis.get('leaderboard:global'), 'get');
    return data ? JSON.parse(data) : null;
  } catch (err) {
    console.warn('[redis] get failed', err);
    return null;
  }
};

export const setCachedLeaderboard = async (entries: unknown) => {
  try {
    const redis = await ensureClient();
    if (!redis) return;
    await withTimeout(redis.set('leaderboard:global', JSON.stringify(entries), { EX: 60 }), 'set');
  } catch (err) {
    console.warn('[redis] set failed', err);
  }
};

export const closeRedis = async () => {
  if (client && client.isOpen) {
    await client.quit();
  }
};
