import { Router } from 'express';
import { CampaignsController } from './campaigns.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { createCampaignSchema } from './campaigns.validator.js';

const router = Router();

// Campaign creation & launch (Admin & Manager)
router.post(
  '/',
  requireAuth,
  requireRole(['admin', 'manager']),
  validateRequest({ body: createCampaignSchema }),
  CampaignsController.createCampaign
);

router.post(
  '/:id/launch',
  requireAuth,
  requireRole(['admin', 'manager']),
  CampaignsController.launchCampaign
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(['admin', 'manager']),
  CampaignsController.deleteCampaign
);

// Campaign inspection & stats
router.get(
  '/:id/stats',
  requireAuth,
  CampaignsController.getStats
);

router.get(
  '/:id',
  requireAuth,
  CampaignsController.getCampaign
);

router.get(
  '/',
  requireAuth,
  CampaignsController.listCampaigns
);

export const campaignsRouter = router;
