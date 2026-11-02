import { z } from 'zod';

export const importContactsSchema = z.object({
  fileToken: z.string().min(1, 'File token is required'),
  listName: z.string().trim().min(2, 'List name must be at least 2 characters').max(150),
  description: z.string().trim().max(500).optional(),
  countryCode: z.string().trim().default('IN'),
  tags: z.array(z.string().trim()).optional().default([]),
  mappings: z.object({
    phone: z.string().min(1, 'Phone column mapping is required'),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().optional(),
    customFields: z.record(z.string()).optional().default({})
  })
});

export const listContactsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().optional(),
  contactListId: z.string().optional(),
  tag: z.string().optional(),
  optInStatus: z.enum(['opted_in', 'opted_out', 'unknown']).optional()
});

export const listContactListsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
  search: z.string().optional()
});

export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type ListContactsQuery = z.infer<typeof listContactsQuerySchema>;
