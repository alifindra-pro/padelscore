import { z } from 'zod';

export const createTournamentSchema = z.object({
  name: z.string().min(3, 'Tournament name must be at least 3 characters').max(100),
  slug: z.string()
    .min(3, 'Slug must be at least 3 characters')
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung').optional(),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  timezone: z.string().default('Asia/Jakarta'),
  startDate: z.string().datetime({ message: 'Invalid start date format' }),
  endDate: z.string().datetime({ message: 'Invalid end date format' }),
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  { message: 'End date must be after start date', path: ['endDate'] }
);

export const updateTournamentSchema = z.object({
  name: z.string().min(3).max(100).optional(),
  slug: z.string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional(),
  description: z.string().max(2000).optional().nullable(),
  location: z.string().max(200).optional().nullable(),
  timezone: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export const changeTournamentStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'REGISTRATION',
    'PUBLISHED',
    'IN_PROGRESS',
    'COMPLETED',
    'ARCHIVED',
  ]),
});

export const createCategorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
  description: z.string().max(500).optional().nullable(),
  format: z.enum([
    'SINGLE_ELIMINATION',
    'DOUBLE_ELIMINATION',
    'ROUND_ROBIN',
    'GROUP_KNOCKOUT',
    'LEAGUE',
    'AMERICANO',
    'MEXICANO',
  ]),
  maxEntries: z.number().int().min(2).optional().nullable(),
});

export const updateCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  format: z.enum([
    'SINGLE_ELIMINATION',
    'DOUBLE_ELIMINATION',
    'ROUND_ROBIN',
    'GROUP_KNOCKOUT',
    'LEAGUE',
    'AMERICANO',
    'MEXICANO',
  ]).optional(),
  maxEntries: z.number().int().min(2).optional().nullable(),
});

export const createRulesetSchema = z.object({
  setsToWin: z.number().int().min(1).max(5).default(2),
  gamesPerSet: z.number().int().min(1).max(10).default(6),
  tiebreakAt: z.number().int().min(1).max(10).default(6),
  tiebreakPoints: z.number().int().min(1).max(15).default(7),
  goldenPoint: z.boolean().default(false),
  superTiebreak: z.boolean().default(false),
  superTiebreakPts: z.number().int().min(1).max(20).default(10),
  deuceType: z.enum(['ADVANTAGE', 'GOLDEN_POINT', 'NO_AD']).default('ADVANTAGE'),
});

export const createPlayerSchema = z.object({
  fullName: z.string().min(2, 'Full name must be at least 2 characters').max(100),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  rating: z.number().min(0).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const updatePlayerSchema = z.object({
  fullName: z.string().min(2).max(100).optional(),
  email: z.string().email().optional().nullable(),
  phone: z.string().max(20).optional().nullable(),
  rating: z.number().min(0).max(10).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const createEntrySchema = z.object({
  name: z.string().min(2, 'Entry name must be at least 2 characters').max(100),
  playerIds: z.array(z.string().uuid()).min(1).max(2),
  seed: z.number().int().min(1).optional().nullable(),
});

export const updateEntrySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  seed: z.number().int().min(1).optional().nullable(),
  status: z.enum(['REGISTERED', 'CONFIRMED', 'WITHDRAWN', 'DISQUALIFIED']).optional(),
});

export const createCourtSchema = z.object({
  name: z.string().min(1, 'Court name is required').max(50),
  isActive: z.boolean().default(true),
  priority: z.number().int().min(0).default(0),
});

export const updateCourtSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
});

export type CreateTournamentInput = z.infer<typeof createTournamentSchema>;
export type UpdateTournamentInput = z.infer<typeof updateTournamentSchema>;
export type ChangeTournamentStatusInput = z.infer<typeof changeTournamentStatusSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateRulesetInput = z.infer<typeof createRulesetSchema>;
export type CreatePlayerInput = z.infer<typeof createPlayerSchema>;
export type UpdatePlayerInput = z.infer<typeof updatePlayerSchema>;
export type CreateEntryInput = z.infer<typeof createEntrySchema>;
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>;
export type CreateCourtInput = z.infer<typeof createCourtSchema>;
export type UpdateCourtInput = z.infer<typeof updateCourtSchema>;
