import { Request, Response, NextFunction } from 'express';
import { WorkflowsService } from './workflows.service.js';
import { UnauthorizedError } from '../../utils/errors.js';

export class WorkflowsController {
  public static async createWorkflow(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const workflow = await WorkflowsService.createWorkflow(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: workflow
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getWorkflow(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const workflow = await WorkflowsService.getWorkflowById(req.params.id);

      res.status(200).json({
        success: true,
        data: workflow
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listWorkflows(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;

      const result = await WorkflowsService.listWorkflows(page, limit);

      res.status(200).json({
        success: true,
        data: result.workflows,
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

  public static async publishWorkflow(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const workflow = await WorkflowsService.publishWorkflow(req.params.id);

      res.status(200).json({
        success: true,
        data: workflow
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listExecutions(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;

      const result = await WorkflowsService.listExecutions(req.params.id, page, limit);

      res.status(200).json({
        success: true,
        data: result.executions,
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
}

