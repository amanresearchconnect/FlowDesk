import { Router } from 'express';
import { VerificationController } from './verification.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { manualVerifySchema } from './verification.validator.js';

const router = Router();

router.use(requireAuth);
router.use(requireRole(['admin', 'manager']));

// Google Sheets endpoints
router.get('/google-sheets/status', VerificationController.getGoogleSheetsStatus);
router.post('/google-sheets/test-connection', VerificationController.testGoogleSheetsConnection);

// Microsoft Graph endpoints
router.get('/microsoft-graph/status', VerificationController.getMicrosoftGraphStatus);
router.post('/microsoft-graph/test-connection', VerificationController.testMicrosoftGraphConnection);

// Unified verification tester
router.post(
  '/verify',
  validateRequest({ body: manualVerifySchema }),
  VerificationController.manualVerify
);

export const integrationsRouter = router;

