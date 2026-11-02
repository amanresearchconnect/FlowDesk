import { Router } from 'express';
import { MockWhatsAppController } from './mock.controller.js';

const router = Router();

router.post('/incoming', MockWhatsAppController.simulateIncoming);
router.post('/status', MockWhatsAppController.simulateStatus);
router.get('/outbound', MockWhatsAppController.getOutboundMessages);

export const mockWhatsAppRouter = router;
