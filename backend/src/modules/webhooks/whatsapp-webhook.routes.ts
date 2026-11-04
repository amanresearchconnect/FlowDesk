import { Router } from 'express';
import { WhatsAppWebhookController } from './whatsapp-webhook.controller.js';

const router = Router();

// GET challenge verification from Meta
router.get('/whatsapp', WhatsAppWebhookController.verifyWebhook);

// POST real-time inbound events from Meta
router.post('/whatsapp', WhatsAppWebhookController.handleWebhookEvent);

export const whatsappWebhookRouter = router;

