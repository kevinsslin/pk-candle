import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL;
let client: ReturnType<typeof createClient> | null = null;
let connecting: Promise<void> | null = null;

const ensureClient = async () => {
  if (!redisUrl) return null;
  if (!client) {
    client = createClient({ url: redisUrl });
  }
  if (!client.isOpen) {
    if (!connecting) {
      connecting = client.connect().then(() => {
        connecting = null;
      });
    }
    await connecting;
  }
  return client;
};

export const getCachedLeaderboard = async () => {
  const redis = await ensureClient();
  if (!redis) return null;
  const data = await redis.get('leaderboard:global');
  return data ? JSON.parse(data) : null;
};

export const setCachedLeaderboard = async (entries: unknown) => {
  const redis = await ensureClient();
  if (!redis) return;
  await redis.set('leaderboard:global', JSON.stringify(entries), { EX: 60 });
};

export const closeRedis = async () => {
  if (client && client.isOpen) {
    await client.quit();
  }
};
