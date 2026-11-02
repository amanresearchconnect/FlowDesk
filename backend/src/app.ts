import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { contactsRouter } from './modules/contacts/contacts.routes.js';
import { contactListsRouter } from './modules/contacts/contact-lists.routes.js';
import { campaignsRouter } from './modules/campaigns/campaigns.routes.js';
import { mockWhatsAppRouter } from './modules/mock/mock.routes.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { NotFoundError } from './utils/errors.js';
import { requireAuth } from './middlewares/auth.middleware.js';
import { requireRole } from './middlewares/rbac.middleware.js';

export function createApp(): Express {
  const app = express();

  // Security and utilities middleware
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    })
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'flowdesk-api',
      timestamp: new Date().toISOString()
    });
  });

  // Base API router
  const apiRouter = express.Router();
  apiRouter.use('/auth', authRouter);
  apiRouter.use('/contacts', contactsRouter);
  apiRouter.use('/contact-lists', contactListsRouter);
  apiRouter.use('/campaigns', campaignsRouter);
  apiRouter.use('/mock/whatsapp', mockWhatsAppRouter);

  // RBAC test endpoint for verification
  apiRouter.get(
    '/test/rbac-manager',
    requireAuth,
    requireRole(['admin', 'manager']),
    (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        data: { message: 'Manager access granted', user: req.user }
      });
    }
  );

  apiRouter.get(
    '/test/rbac-admin',
    requireAuth,
    requireRole(['admin']),
    (req: Request, res: Response) => {
      res.status(200).json({
        success: true,
        data: { message: 'Admin access granted', user: req.user }
      });
    }
  );

  app.use(env.API_PREFIX, apiRouter);

  // 404 Not Found handler
  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  // Centralized Error handler
  app.use(errorHandler);

  return app;
}

