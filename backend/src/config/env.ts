import dotenv from 'dotenv';
import path from 'node:path';
import { z } from 'zod';

// Load environment variables from .env if present
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config(); // Fallback to current working directory

const envSchema = z.object({
  PORT: z.coerce.number().default(5000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_PREFIX: z.string().default('/api/v1'),
  CLIENT_URL: z.string().default('http://localhost:5173'),

  // Persistence
  MONGODB_URI: z.string().default('mongodb://localhost:27017/flowdesk'),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(16).default('development_jwt_access_secret_key_min_32_chars!'),
  JWT_REFRESH_SECRET: z.string().min(16).default('development_jwt_refresh_secret_key_min_32_chars!'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),

  // Messaging
  MESSAGING_PROVIDER: z.enum(['mock', 'meta']).default('mock'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().default('mock_verify_token'),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),

  // AI
  AI_PROVIDER: z.enum(['mock', 'gemini', 'openai']).default('mock'),
  GEMINI_API_KEY: z.string().optional().default(''),
  OPENAI_API_KEY: z.string().optional().default(''),
  AI_MODEL: z.string().default('gemini-2.0-flash'),

  // Microsoft Graph
  MS_GRAPH_MOCK_MODE: z.coerce.boolean().default(true),
  MS_GRAPH_TENANT_ID: z.string().optional().default(''),
  MS_GRAPH_CLIENT_ID: z.string().optional().default(''),
  MS_GRAPH_CLIENT_SECRET: z.string().optional().default(''),
  MS_GRAPH_DRIVE_ID: z.string().optional().default(''),
  MS_GRAPH_WORKBOOK_ITEM_ID: z.string().optional().default(''),
  MS_GRAPH_WORKSHEET_NAME: z.string().default('Responses'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  OUTBOUND_DISPATCH_RATE_PER_SEC: z.coerce.number().default(20)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', JSON.stringify(parsed.error.format(), null, 2));
  throw new Error('Environment configuration validation failed');
}

export const env = parsed.data;
