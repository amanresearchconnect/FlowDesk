import { Types } from 'mongoose';
import {
  KnowledgeArticle,
  KnowledgeCollection,
  IKnowledgeArticle,
  IKnowledgeCollection,
  IKnowledgeArticleDocument,
  IKnowledgeCollectionDocument,
  KnowledgeCategory
} from '../../models/knowledge-base.model.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { PDFParse } from 'pdf-parse';
import { getAIProvider } from '../../providers/ai/ai.factory.js';

export interface CreateArticleInput {
  collectionId?: string;
  sourceFileName?: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  keywords?: string[];
  isActive?: boolean;
}

export interface UpdateArticleInput {
  collectionId?: string;
  category?: KnowledgeCategory;
  title?: string;
  content?: string;
  keywords?: string[];
  isActive?: boolean;
}

export interface ListArticlesQuery {
  category?: KnowledgeCategory;
  collectionId?: string;
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

    if (query.collectionId && Types.ObjectId.isValid(query.collectionId)) {
      filter.collectionId = new Types.ObjectId(query.collectionId);
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
   * Used by the AI Agent ContextBuilder, optionally scoped by collectionId
   */
  public static async searchRelevantArticles(
    queryText: string,
    category?: KnowledgeCategory,
    limit = 5,
    collectionId?: string
  ): Promise<Array<IKnowledgeArticle & { id: string }>> {
    const filter: Record<string, any> = { isActive: true };
    if (category) {
      filter.category = category;
    }
    if (collectionId && Types.ObjectId.isValid(collectionId)) {
      filter.collectionId = new Types.ObjectId(collectionId);
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
   * Parse uploaded PDF (e.g. Job Description, Company Policy) and ingest into a KnowledgeCollection
   */
  public static async parseAndIngestPdf(
    fileBuffer: Buffer,
    originalName: string,
    collectionName?: string,
    category: KnowledgeCategory = 'recruitment',
    description?: string,
    userId?: string
  ): Promise<{
    collection: IKnowledgeCollection & { id: string };
    articles: Array<IKnowledgeArticle & { id: string }>;
  }> {
    if (!fileBuffer || fileBuffer.length === 0) {
      throw new ValidationError('Uploaded PDF buffer is empty');
    }

    let rawText = '';
    try {
      if ((PDFParse as any).prototype?.getText) {
        const parser = new (PDFParse as any)({ data: fileBuffer });
        const result = await parser.getText();
        rawText = typeof result === 'string' ? result : (result?.text || String(result || ''));
      } else if (typeof PDFParse === 'function') {
        const res = await (PDFParse as any)(fileBuffer);
        rawText = res?.text || '';
      }
      rawText = rawText.trim();
    } catch (err: any) {
      logger.error('Failed to parse PDF with PDFParse', { error: err.message });
      throw new ValidationError(`Failed to parse PDF: ${err.message}`);
    }

    if (!rawText || rawText.length < 20) {
      throw new ValidationError('Could not extract readable text from PDF. The document might be empty or scanned images.');
    }

    const safeCollectionName = (collectionName?.trim() || originalName.replace(/\.pdf$/i, '')).substring(0, 150);

    interface ParsedChunk {
      title: string;
      content: string;
      keywords: string[];
    }

    let chunks: ParsedChunk[] = [];

    // Attempt AI-assisted structured extraction using available provider
    try {
      const ai = getAIProvider();
      const prompt = `You are a Document Understanding Assistant.
The user uploaded a reference document named "${originalName}" for category "${category}".
Here is the text extracted from the document:
---
${rawText.slice(0, 12000)}
---

Task: Extract 3 to 10 discrete, high-value Q&A or knowledge articles from this document (e.g. key specifications, FAQ answers, operational procedures, policies, or domain context).
Output ONLY a JSON array in the exact schema without extra commentary or markdown:
[
  {
    "title": "Clear Section Title",
    "content": "Comprehensive detailed text of this section.",
    "keywords": ["keyword1", "keyword2", "keyword3"]
  }
]`;

      const aiResponse = await ai.chat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1
      });

      if (aiResponse.content) {
        const cleaned = aiResponse.content.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed) && parsed.length > 0) {
          chunks = parsed.map((c: any) => ({
            title: String(c.title || 'Overview').trim(),
            content: String(c.content || '').trim(),
            keywords: Array.isArray(c.keywords) ? c.keywords.map((k: any) => String(k).toLowerCase().trim()) : []
          })).filter((c) => c.content.length > 10);
        }
      }
    } catch (aiErr: any) {
      logger.warn('AI chunking failed or not available, falling back to heuristic sectioning', {
        error: aiErr.message
      });
    }

    // Heuristic Fallback if AI was unavailable or failed to return array
    if (chunks.length === 0) {
      const extractKeywordsFromText = (text: string, base: string[]): string[] => {
        const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
        const stopWords = new Set(['this', 'that', 'with', 'from', 'have', 'were', 'which', 'their', 'about', 'there', 'would', 'could', 'should', 'other', 'please', 'these', 'under']);
        const counts: Record<string, number> = {};
        for (const w of words) {
          if (!stopWords.has(w)) counts[w] = (counts[w] || 0) + 1;
        }
        const topWords = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([w]) => w);
        return Array.from(new Set([...base, ...topWords]));
      };

      const rawSections = rawText
        .split(/\n{2,}/)
        .map((s) => s.trim())
        .filter((s) => s.length > 40);

      if (rawSections.length === 0) {
        chunks.push({
          title: `${safeCollectionName} - Overview`,
          content: rawText,
          keywords: extractKeywordsFromText(rawText, [safeCollectionName.toLowerCase(), category])
        });
      } else {
        let currentChunk = '';
        let chunkIndex = 1;

        for (const sec of rawSections) {
          if (currentChunk.length + sec.length > 1200 && currentChunk.length > 200) {
            chunks.push({
              title: `${safeCollectionName} - Section ${chunkIndex++}`,
              content: currentChunk.trim(),
              keywords: extractKeywordsFromText(currentChunk, [safeCollectionName.toLowerCase(), category])
            });
            currentChunk = sec;
          } else {
            currentChunk += '\n\n' + sec;
          }
        }
        if (currentChunk.trim().length > 0) {
          chunks.push({
            title: `${safeCollectionName} - Section ${chunkIndex}`,
            content: currentChunk.trim(),
            keywords: extractKeywordsFromText(currentChunk, [safeCollectionName.toLowerCase(), category])
          });
        }
      }
    }

    // Create KnowledgeCollection
    const collection = await KnowledgeCollection.create({
      name: safeCollectionName,
      description: description?.trim() || `Ingested from ${originalName}`,
      category,
      sourceFileName: originalName,
      articlesCount: chunks.length,
      isActive: true,
      createdById: userId ? new Types.ObjectId(userId) : new Types.ObjectId()
    });

    // Create KnowledgeArticle documents
    const createdArticles: Array<IKnowledgeArticle & { id: string }> = [];
    for (const chunk of chunks) {
      const art = await KnowledgeArticle.create({
        collectionId: collection._id,
        sourceFileName: originalName,
        category,
        title: chunk.title,
        content: chunk.content,
        keywords: chunk.keywords,
        isActive: true,
        version: 1,
        createdById: userId ? new Types.ObjectId(userId) : new Types.ObjectId()
      });
      createdArticles.push(art.toSafeObject());
    }

    logger.info('PDF successfully ingested into Knowledge Base', {
      collectionId: collection._id.toString(),
      name: collection.name,
      articlesCount: createdArticles.length
    });

    return {
      collection: collection.toSafeObject(),
      articles: createdArticles
    };
  }

  /**
   * List Knowledge Collections (useful for campaign dropdown selector)
   */
  public static async listCollections(query?: {
    category?: KnowledgeCategory;
    search?: string;
  }): Promise<Array<IKnowledgeCollection & { id: string }>> {
    const filter: Record<string, any> = { isActive: true };
    if (query?.category) {
      filter.category = query.category;
    }
    if (query?.search?.trim()) {
      filter.name = { $regex: query.search.trim(), $options: 'i' };
    }
    const collections = await KnowledgeCollection.find(filter).sort({ createdAt: -1 });
    return collections.map((c) => c.toSafeObject());
  }

  /**
   * Delete a Knowledge Collection and its constituent articles
   */
  public static async deleteCollection(id: string): Promise<void> {
    if (!Types.ObjectId.isValid(id)) {
      throw new ValidationError('Invalid collection ID');
    }
    const collId = new Types.ObjectId(id);
    await KnowledgeArticle.deleteMany({ collectionId: collId });
    const res = await KnowledgeCollection.deleteOne({ _id: collId });
    if (res.deletedCount === 0) {
      throw new NotFoundError('Knowledge collection not found');
    }
    logger.info('Knowledge collection and its articles deleted', { collectionId: id });
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

