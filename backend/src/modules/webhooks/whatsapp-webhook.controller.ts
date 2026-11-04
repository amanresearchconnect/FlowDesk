import { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { metaWhatsAppProvider } from '../../providers/messaging/meta-whatsapp.provider.js';
import { MessagingService } from '../messaging/messaging.service.js';
import { logger } from '../../utils/logger.js';

export class WhatsAppWebhookController {
  /**
   * GET /api/v1/webhooks/whatsapp
   * Responds to Meta's Webhook verification challenge during webhook setup.
   */
  public static verifyWebhook(req: Request, res: Response): void {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
      logger.info('Meta WhatsApp Webhook subscription verified successfully');
      res.status(200).send(challenge);
      return;
    }

    logger.warn('Meta WhatsApp Webhook verification failed: verify token mismatch', {
      receivedToken: token,
      expectedToken: env.WHATSAPP_WEBHOOK_VERIFY_TOKEN
    });

    res.status(403).json({ error: 'Webhook verification token mismatch' });
  }

  /**
   * POST /api/v1/webhooks/whatsapp
   * Ingests real-time events from Meta: inbound candidate messages, delivery receipts, read receipts.
   */
  public static async handleWebhookEvent(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info('Meta WhatsApp Webhook POST received', {
        object: req.body?.object,
        entryCount: req.body?.entry?.length
      });

      // 1. Acknowledge Meta immediately with 200 OK
      res.status(200).json({ status: 'EVENT_RECEIVED' });

      // 2. Parse payload using MetaWhatsAppProvider
      const events = metaWhatsAppProvider.parseWebhookPayload(req.body);

      for (const event of events) {
        if (event.eventType === 'message' && event.fromPhone && event.text) {
          logger.info('Received live inbound WhatsApp message from candidate', {
            from: event.fromPhone,
            text: event.text,
            providerMessageId: event.providerMessageId
          });

          await MessagingService.handleIncomingMessage(event.fromPhone, event.text);
        } else if (event.eventType === 'status_update' && event.status) {
          logger.info('Received live delivery status update from Meta', {
            providerMessageId: event.providerMessageId,
            status: event.status
          });

          if (event.status === 'delivered' || event.status === 'read') {
            await MessagingService.handleStatusUpdate(event.providerMessageId, event.status);
          }
        }
      }
    } catch (error: any) {
      logger.error('Error processing Meta WhatsApp webhook payload', {
        error: error.message,
        body: req.body
      });
      // Do not rethrow to avoid Meta webhook backoff retries when response is already sent
    }
  }
}

