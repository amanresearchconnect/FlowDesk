import { Router } from 'express';
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

const router = Router();

router.use(requireAuth);

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
