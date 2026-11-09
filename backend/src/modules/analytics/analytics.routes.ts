import { Router } from 'express';
import { AnalyticsController } from './analytics.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth);

analyticsRouter.get('/overview', AnalyticsController.getOverview);
analyticsRouter.get('/funnel', AnalyticsController.getFunnel);
analyticsRouter.get('/step-dropoff', AnalyticsController.getStepDropOff);
analyticsRouter.post('/recalculate', AnalyticsController.recalculate);

