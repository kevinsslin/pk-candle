import { pgTable, text, timestamp, uuid, integer, numeric, jsonb } from 'drizzle-orm/pg-core';

export const eventPacks = pgTable('event_packs', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  version: integer('version').notNull().default(1),
  data: jsonb('data').notNull(),
  creatorUserId: text('creator_user_id'),
  creatorWallet: text('creator_wallet'),
  editToken: text('edit_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: text('room_id').notNull(),
  packId: text('pack_id'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
});

export const leaderboardEntries = pgTable('leaderboard_entries', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id'),
  roomId: text('room_id').notNull(),
  playerName: text('player_name').notNull(),
  handle: text('handle'),
  avatarUrl: text('avatar_url'),
  role: text('role').notNull(),
  cash: numeric('cash', { precision: 18, scale: 2 }).notNull(),
  peakCash: numeric('peak_cash', { precision: 18, scale: 2 }).notNull(),
  roi: numeric('roi', { precision: 8, scale: 2 }).notNull(),
  daysSurvived: integer('days_survived').notNull(),
  walletAddress: text('wallet_address'),
  userId: text('user_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
