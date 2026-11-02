import { Request, Response, NextFunction } from 'express';
import { MessagingService } from '../messaging/messaging.service.js';
import { mockWhatsAppProvider } from '../../providers/messaging/mock-whatsapp.provider.js';
import { ValidationError } from '../../utils/errors.js';

export class MockWhatsAppController {
  public static async simulateIncoming(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { fromPhone, text } = req.body;
      if (!fromPhone || !text) {
        throw new ValidationError("Both 'fromPhone' and 'text' are required");
      }

      const result = await MessagingService.handleIncomingMessage(fromPhone, text);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async simulateStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { providerMessageId, status } = req.body;
      if (!providerMessageId || !status) {
        throw new ValidationError("Both 'providerMessageId' and 'status' are required");
      }

      const message = await MessagingService.handleStatusUpdate(providerMessageId, status);

      res.status(200).json({
        success: true,
        data: message ? message.toSafeObject() : null
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getOutboundMessages(
    _req: Request,
    res: Response
  ): Promise<void> {
    const messages = mockWhatsAppProvider.getOutboundMessages();

    res.status(200).json({
      success: true,
      data: messages
    });
  }
}
