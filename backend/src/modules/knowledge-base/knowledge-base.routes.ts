import { Router } from 'express';
import multer from 'multer';
import { KnowledgeBaseController } from './knowledge-base.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import {
  createArticleSchema,
  updateArticleParamsSchema,
  updateArticleBodySchema,
  queryArticleSchema
} from './knowledge-base.validator.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

const router = Router();

router.use(requireAuth);

// Collection routes (must precede /:id)
router.get('/collections', KnowledgeBaseController.listCollections);
router.delete(
  '/collections/:id',
  requireRole(['admin', 'manager']),
  KnowledgeBaseController.removeCollection
);

// PDF Document Upload & Ingest
router.post(
  '/upload-pdf',
  requireRole(['admin', 'manager']),
  upload.single('pdf'),
  KnowledgeBaseController.uploadPdf
);

router.get(
  '/',
  validateRequest({ query: queryArticleSchema }),
  KnowledgeBaseController.list
);

router.get(
  '/:id',
  validateRequest({ params: updateArticleParamsSchema }),
  KnowledgeBaseController.getById
);

// Admin and Manager can mutate knowledge base articles
router.post(
  '/',
  requireRole(['admin', 'manager']),
  validateRequest({ body: createArticleSchema }),
  KnowledgeBaseController.create
);

router.put(
  '/:id',
  requireRole(['admin', 'manager']),
  validateRequest({ params: updateArticleParamsSchema, body: updateArticleBodySchema }),
  KnowledgeBaseController.update
);

router.delete(
  '/:id',
  requireRole(['admin', 'manager']),
  validateRequest({ params: updateArticleParamsSchema }),
  KnowledgeBaseController.remove
);

export const knowledgeBaseRouter = router;
