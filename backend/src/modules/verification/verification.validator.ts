import { z } from 'zod';

export const manualVerifySchema = z.object({
  phone: z.string().min(6, 'Candidate phone number is required'),
  surveyId: z.string().optional(),
  providerName: z.enum(['mock', 'google_sheets', 'microsoft_graph', 'internal_db']).optional(),
  skipCache: z.boolean().optional()
});

