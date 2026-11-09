import { z } from 'zod';

const categoryEnum = z.enum(['recruitment', 'survey', 'sales', 'support', 'onboarding', 'general']);

export const createArticleSchema = z.object({
  category: categoryEnum,
  title: z.string().min(3).max(250),
  content: z.string().min(10),
  keywords: z.array(z.string().min(1)).optional().default([]),
  isActive: z.boolean().optional().default(true)
});

export const updateArticleParamsSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid article ID')
});

export const updateArticleBodySchema = z.object({
  category: categoryEnum.optional(),
  title: z.string().min(3).max(250).optional(),
  content: z.string().min(10).optional(),
  keywords: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional()
});

export const queryArticleSchema = z.object({
  category: categoryEnum.optional(),
  search: z.string().optional(),
  isActive: z
    .string()
    .optional()
    .transform((val) => (val === undefined ? undefined : val === 'true')),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20)
});
