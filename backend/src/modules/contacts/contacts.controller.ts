import { Request, Response, NextFunction } from 'express';
import { ContactsService } from './contacts.service.js';
import { ValidationError, UnauthorizedError } from '../../utils/errors.js';

export class ContactsController {
  public static async uploadPreview(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.file) {
        throw new ValidationError('Please upload a CSV or Excel file');
      }

      const preview = await ContactsService.createUploadPreview(req.file);

      res.status(200).json({
        success: true,
        data: preview
      });
    } catch (error) {
      next(error);
    }
  }

  public static async importContacts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const summary = await ContactsService.processImport(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listContacts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await ContactsService.listContacts(req.query as any);

      res.status(200).json({
        success: true,
        data: result.contacts,
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

  public static async getContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const contact = await ContactsService.getContactById(req.params.id);

      res.status(200).json({
        success: true,
        data: contact
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listContactLists(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;

      const result = await ContactsService.listContactLists(page, limit);

      res.status(200).json({
        success: true,
        data: result.lists,
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

  public static async createContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const contact = await ContactsService.createContact(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: contact
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const contactListId = req.query.contactListId as string | undefined;
      const result = await ContactsService.deleteContact(req.params.id, contactListId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async createContactList(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const list = await ContactsService.createContactList(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: list
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteContactList(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await ContactsService.deleteContactList(req.params.id);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

