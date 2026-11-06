import { z } from 'zod';

export const createCampaignSchema = z.object({
  name: z.string().trim().min(2, 'Campaign name must be at least 2 characters').max(150),
  description: z.string().trim().max(500).optional(),
  contactListId: z.string().min(1, 'Contact list ID is required'),
  workflowId: z.string().optional().nullable(),
  messageTemplate: z.string().trim().optional().default('[Workflow Driven]'),
  buttons: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(20, 'Button title max 20 chars')
      })
    )
    .optional(),
  throttleRatePerSecond: z.number().int().positive().max(100).optional()
});

export const listCampaignsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25)
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

