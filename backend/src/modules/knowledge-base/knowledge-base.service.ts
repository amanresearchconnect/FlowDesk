import { Types } from 'mongoose';
import {
  KnowledgeArticle,
  IKnowledgeArticle,
  IKnowledgeArticleDocument,
  KnowledgeCategory
} from '../../models/knowledge-base.model.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface CreateArticleInput {
  category: KnowledgeCategory;
  title: string;
  content: string;
  keywords?: string[];
  isActive?: boolean;
}

export interface UpdateArticleInput {
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  keywords?: string[];
  isActive?: boolean;
}

export interface ListArticlesQuery {
  category?: KnowledgeCategory;
  search?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}

export class KnowledgeBaseService {
  public static async createArticle(
    input: CreateArticleInput,
    userId: string
  ): Promise<IKnowledgeArticle & { id: string }> {
    const article = await KnowledgeArticle.create({
      ...input,
      keywords: (input.keywords || []).map((k) => k.toLowerCase().trim()),
      createdById: new Types.ObjectId(userId)
    });

    logger.info('Knowledge base article created', {
      articleId: article._id.toString(),
      title: article.title,
      category: article.category
    });

    return article.toSafeObject();
  }

  public static async listArticles(query: ListArticlesQuery): Promise<{
    articles: Array<IKnowledgeArticle & { id: string }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const filter: Record<string, any> = {};

    if (query.category) {
      filter.category = query.category;
    }

    if (query.isActive !== undefined) {
      filter.isActive = query.isActive;
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      filter.$or = [
        { title: { $regex: term, $options: 'i' } },
        { content: { $regex: term, $options: 'i' } },
        { keywords: { $in: [new RegExp(term, 'i')] } }
      ];
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    const skip = (page - 1) * limit;

    const [articles, total] = await Promise.all([
      KnowledgeArticle.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      KnowledgeArticle.countDocuments(filter)
    ]);

    return {
      articles: articles.map((a) => a.toSafeObject()),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    };
  }

  public static async getArticleById(id: string): Promise<IKnowledgeArticle & { id: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid article ID');
    }

    const article = await KnowledgeArticle.findById(id);
    if (!article) {
      throw new NotFoundError('Knowledge base article not found');
    }

    return article.toSafeObject();
  }

  public static async updateArticle(
    id: string,
    input: UpdateArticleInput
  ): Promise<IKnowledgeArticle & { id: string }> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid article ID');
    }

    const article = await KnowledgeArticle.findById(id);
    if (!article) {
      throw new NotFoundError('Knowledge base article not found');
    }

    if (input.category !== undefined) article.category = input.category;
    if (input.title !== undefined) article.title = input.title.trim();
    if (input.content !== undefined) article.content = input.content.trim();
    if (input.isActive !== undefined) article.isActive = input.isActive;
    if (input.keywords !== undefined) {
      article.keywords = input.keywords.map((k) => k.toLowerCase().trim());
    }

    article.version = (article.version || 1) + 1;
    await article.save();

    logger.info('Knowledge base article updated', {
      articleId: article._id.toString(),
      version: article.version
    });

    return article.toSafeObject();
  }

  public static async deleteArticle(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid article ID');
    }

    const result = await KnowledgeArticle.deleteOne({ _id: new Types.ObjectId(id) });
    if (result.deletedCount === 0) {
      throw new NotFoundError('Knowledge base article not found');
    }

    logger.info('Knowledge base article deleted', { articleId: id });
  }

  /**
   * Search active knowledge articles relevant to a user query
   * Used by the AI Agent ContextBuilder
   */
  public static async searchRelevantArticles(
    queryText: string,
    category?: KnowledgeCategory,
    limit = 5
  ): Promise<Array<IKnowledgeArticle & { id: string }>> {
    const filter: Record<string, any> = { isActive: true };
    if (category) {
      filter.category = category;
    }

    // Tokenize query into words (ignoring short stopwords)
    const tokens = queryText
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2);

    if (tokens.length === 0) {
      const articles = await KnowledgeArticle.find(filter).sort({ createdAt: -1 }).limit(limit);
      return articles.map((a) => a.toSafeObject());
    }

    // Match keywords or regex in title/content
    filter.$or = [
      { keywords: { $in: tokens } },
      ...tokens.map((token) => ({ title: { $regex: token, $options: 'i' } })),
      ...tokens.map((token) => ({ content: { $regex: token, $options: 'i' } }))
    ];

    const articles = await KnowledgeArticle.find(filter).limit(limit);
    return articles.map((a) => a.toSafeObject());
  }

  /**
   * Lookup job details by jobCode or role title
   */
  public static async getJobDetails(jobCode: string): Promise<{
    found: boolean;
    jobCode: string;
    title?: string;
    description?: string;
  }> {
    const cleanCode = jobCode.trim();
    const article = await KnowledgeArticle.findOne({
      category: 'recruitment',
      isActive: true,
      $or: [
        { keywords: cleanCode.toLowerCase() },
        { title: { $regex: cleanCode, $options: 'i' } }
      ]
    });

    if (!article) {
      return { found: false, jobCode: cleanCode };
    }

    return {
      found: true,
      jobCode: cleanCode,
      title: article.title,
      description: article.content
    };
  }
}

