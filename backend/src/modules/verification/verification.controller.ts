import { Request, Response, NextFunction } from 'express';
import { VerificationService } from './verification.service.js';

export class VerificationController {
  public static async getGoogleSheetsStatus(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = await VerificationService.testConnection('google_sheets');
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  }

  public static async testGoogleSheetsConnection(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = await VerificationService.testConnection('google_sheets');
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getMicrosoftGraphStatus(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = await VerificationService.testConnection('microsoft_graph');
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  }

  public static async testMicrosoftGraphConnection(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const status = await VerificationService.testConnection('microsoft_graph');
      res.status(200).json({
        success: true,
        data: status
      });
    } catch (error) {
      next(error);
    }
  }

  public static async manualVerify(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { phone, surveyId, providerName, skipCache } = req.body;
      const result = await VerificationService.verifyCandidateSubmission({
        phone,
        surveyId,
        providerName,
        skipCache
      });

      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}

