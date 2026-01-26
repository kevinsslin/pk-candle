import { z } from 'zod';

const effectSchema = z.object({
  cash: z.number().optional(),
});

const phaseSchema = z.enum(['IDLE', 'Accumulation', 'PUMP', 'DUMP', 'MOON', 'RUG']);

const conditionSchema = z.object({
  minCash: z.number().optional(),
  maxCash: z.number().optional(),
  minStress: z.number().optional(),
  maxStress: z.number().optional(),
  minDay: z.number().int().optional(),
  maxDay: z.number().int().optional(),
  phaseIn: z.array(phaseSchema).optional(),
});

const personalEventSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(300),
  conditions: conditionSchema.optional(),
  choices: z.array(z.object({
    id: z.string().min(1).max(12),
    text: z.string().min(1).max(160),
    effect: effectSchema,
  })).min(2).max(4),
});

const marketEventSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(300),
  conditions: conditionSchema.optional(),
  effect: z.object({
    phase: phaseSchema.optional(),
    volatilityDelta: z.number().optional(),
    priceMultiplier: z.number().optional(),
  }),
});

const expenseSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  cost: z.number().min(0),
});

export const packSchema = z.object({
  name: z.string().min(1).max(64),
  description: z.string().min(1).max(200),
  settings: z.object({
    personalEventMinMs: z.number().int().min(10000).max(180000),
    personalEventMaxMs: z.number().int().min(15000).max(240000),
    marketEventMinMs: z.number().int().min(10000).max(180000),
    marketEventMaxMs: z.number().int().min(15000).max(240000),
  }),
  personalEvents: z.array(personalEventSchema).min(4).max(200),
  marketEvents: z.array(marketEventSchema).min(2).max(200),
  dailyExpenses: z.array(expenseSchema).min(3).max(200),
});
