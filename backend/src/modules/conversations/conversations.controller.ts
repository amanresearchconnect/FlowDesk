import { Request, Response, NextFunction } from 'express';
import { ConversationsService } from './conversations.service.js';
import { UnauthorizedError } from '../../utils/errors.js';

export class ConversationsController {
  public static async listConversations(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;
      const status = req.query.status as any;
      const assignedUserId = req.query.assignedUserId as string;
      const search = req.query.search as string;

      const result = await ConversationsService.listConversations({
        page,
        limit,
        status,
        assignedUserId,
        search
      });

      res.status(200).json({
        success: true,
        data: result.conversations,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total
        }
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getConversation(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const conversation = await ConversationsService.getConversationById(req.params.id);

      res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMessages(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      const result = await ConversationsService.getMessages(req.params.id, page, limit);

      res.status(200).json({
        success: true,
        data: result.messages,
        meta: {
          page: result.page,
          limit: result.limit,
          total: result.total
        }
      });
    } catch (error) {
      next(error);
    }
  }

  public static async sendMessage(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const text = req.body.body || req.body.text;
      const message = await ConversationsService.sendAgentMessage(
        req.params.id,
        text,
        req.user.id
      );

      res.status(201).json({
        success: true,
        data: message
      });
    } catch (error) {
      next(error);
    }
  }

  public static async takeover(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const conversation = await ConversationsService.takeoverConversation(
        req.params.id,
        req.user.id
      );

      res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  public static async releaseToBot(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const conversation = await ConversationsService.releaseToBot(req.params.id);

      res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }

  public static async close(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const conversation = await ConversationsService.closeConversation(req.params.id);

      res.status(200).json({
        success: true,
        data: conversation
      });
    } catch (error) {
      next(error);
    }
  }
}

