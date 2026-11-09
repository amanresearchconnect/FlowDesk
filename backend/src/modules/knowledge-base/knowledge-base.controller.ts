import { Request, Response, NextFunction } from 'express';
import { KnowledgeBaseService } from './knowledge-base.service.js';

export class KnowledgeBaseController {
  public static async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = (req as any).user.id;
      const article = await KnowledgeBaseService.createArticle(req.body, userId);
      res.status(201).json({
        success: true,
        data: article
      });
    } catch (error) {
      next(error);
    }
  }

  public static async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = req.query as any;
      const result = await KnowledgeBaseService.listArticles({
        category: query.category,
        collectionId: query.collectionId,
        search: query.search,
        isActive: query.isActive,
        page: query.page ? Number(query.page) : 1,
        limit: query.limit ? Number(query.limit) : 20
      });

      res.status(200).json({
        success: true,
        data: result.articles,
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: result.totalPages
        }
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const article = await KnowledgeBaseService.getArticleById(req.params.id);
      res.status(200).json({
        success: true,
        data: article
      });
    } catch (error) {
      next(error);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const article = await KnowledgeBaseService.updateArticle(req.params.id, req.body);
      res.status(200).json({
        success: true,
        data: article
      });
    } catch (error) {
      next(error);
    }
  }

  public static async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await KnowledgeBaseService.deleteArticle(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Knowledge base article deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }

  public static async uploadPdf(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          success: false,
          message: 'No PDF file uploaded. Field name must be "pdf".'
        });
        return;
      }

      const userId = (req as any).user?.id;
      const { name, category, description } = req.body;

      const result = await KnowledgeBaseService.parseAndIngestPdf(
        file.buffer,
        file.originalname,
        name,
        category || 'recruitment',
        description,
        userId
      );

      res.status(201).json({
        success: true,
        message: `Successfully parsed and ingested ${result.articles.length} knowledge articles from ${file.originalname}`,
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  public static async listCollections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { category, search } = req.query as any;
      const collections = await KnowledgeBaseService.listCollections({
        category,
        search
      });

      res.status(200).json({
        success: true,
        data: collections
      });
    } catch (error) {
      next(error);
    }
  }

  public static async removeCollection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await KnowledgeBaseService.deleteCollection(req.params.id);
      res.status(200).json({
        success: true,
        message: 'Knowledge collection and all its articles deleted successfully'
      });
    } catch (error) {
      next(error);
    }
  }
}

