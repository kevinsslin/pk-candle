import { pgTable, text, timestamp, uuid, integer, numeric, jsonb, boolean } from 'drizzle-orm/pg-core';

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

export const rankedSeasons = pgTable('ranked_seasons', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  startsAt: timestamp('starts_at', { withTimezone: true }).defaultNow().notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
});

export const playerRatings = pgTable('player_ratings', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: text('season_id').notNull(),
  walletAddress: text('wallet_address').notNull(),
  playerName: text('player_name').notNull(),
  rating: integer('rating').notNull(),
  matchesPlayed: integer('matches_played').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const rankedMatches = pgTable('ranked_matches', {
  id: uuid('id').primaryKey().defaultRandom(),
  seasonId: text('season_id').notNull(),
  roomId: text('room_id').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  playerCount: integer('player_count').notNull(),
});

export const rankedMatchPlayers = pgTable('ranked_match_players', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchId: uuid('match_id').notNull(),
  walletAddress: text('wallet_address').notNull(),
  playerName: text('player_name').notNull(),
  placement: integer('placement').notNull(),
  ratingBefore: integer('rating_before').notNull(),
  ratingAfter: integer('rating_after').notNull(),
  ratingDelta: integer('rating_delta').notNull(),
  cash: numeric('cash', { precision: 18, scale: 2 }).notNull(),
  roi: numeric('roi', { precision: 8, scale: 2 }).notNull(),
});
