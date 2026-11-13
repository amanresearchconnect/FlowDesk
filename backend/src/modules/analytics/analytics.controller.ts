import { Request, Response, NextFunction } from 'express';
import { AnalyticsService } from './analytics.service.js';

export class AnalyticsController {
  public static async getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = req.query.campaignId as string | undefined;
      const timeRange = req.query.timeRange as string | undefined;

      const metrics = await AnalyticsService.getOverviewMetrics(campaignId, timeRange);

      res.status(200).json({
        success: true,
        data: metrics
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getFunnel(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = req.query.campaignId as string | undefined;

      const funnel = await AnalyticsService.getFunnel(campaignId);

      res.status(200).json({
        success: true,
        data: funnel
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getStepDropOff(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = req.query.campaignId as string;
      if (!campaignId) {
        res.status(400).json({ success: false, error: 'campaignId query parameter is required' });
        return;
      }

      const result = await AnalyticsService.getWorkflowStepDropOff(campaignId);

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getRecipients(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = req.query.campaignId as string | undefined;

      const recipients = await AnalyticsService.getCampaignRecipients(campaignId);

      res.status(200).json({
        success: true,
        data: recipients
      });
    } catch (err) {
      next(err);
    }
  }

  public static async recalculate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const campaignId = req.body?.campaignId as string | undefined;

      const result = await AnalyticsService.recalculateCampaignStats(campaignId);

      res.status(200).json({
        success: true,
        data: {
          message: 'Campaign stats recalculated and synchronized successfully',
          ...result
        }
      });
    } catch (err) {
      next(err);
    }
  }
}

