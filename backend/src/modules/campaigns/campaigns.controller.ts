import { Request, Response, NextFunction } from 'express';
import { CampaignsService } from './campaigns.service.js';
import { UnauthorizedError } from '../../utils/errors.js';

export class CampaignsController {
  public static async createCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      if (!req.user) {
        throw new UnauthorizedError('User authentication context missing');
      }

      const campaign = await CampaignsService.createCampaign(req.body, req.user.id);

      res.status(201).json({
        success: true,
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }

  public static async launchCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await CampaignsService.launchCampaign(req.params.id);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async deleteCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      await CampaignsService.deleteCampaign(req.params.id);

      res.status(200).json({
        success: true,
        message: 'Campaign deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const result = await CampaignsService.getCampaignStats(req.params.id);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listCampaigns(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 25;

      const result = await CampaignsService.listCampaigns(page, limit);

      res.status(200).json({
        success: true,
        data: result.campaigns,
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

  public static async getCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const campaign = await CampaignsService.getCampaignById(req.params.id);

      res.status(200).json({
        success: true,
        data: campaign
      });
    } catch (error) {
      next(error);
    }
  }
}
