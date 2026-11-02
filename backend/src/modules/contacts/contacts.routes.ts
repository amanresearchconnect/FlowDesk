import { Router } from 'express';
import { ContactsController } from './contacts.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { uploadSpreadsheet } from '../../middlewares/upload.middleware.js';
import { importContactsSchema, listContactsQuerySchema } from './contacts.validator.js';

const router = Router();

// Ingestion endpoints (restricted to admin & manager)
router.post(
  '/upload-preview',
  requireAuth,
  requireRole(['admin', 'manager']),
  uploadSpreadsheet,
  ContactsController.uploadPreview
);

router.post(
  '/import',
  requireAuth,
  requireRole(['admin', 'manager']),
  validateRequest({ body: importContactsSchema }),
  ContactsController.importContacts
);

// Query endpoints (accessible to all authenticated roles)
router.get(
  '/',
  requireAuth,
  validateRequest({ query: listContactsQuerySchema }),
  ContactsController.listContacts
);

router.get(
  '/:id',
  requireAuth,
  ContactsController.getContact
);

export const contactsRouter = router;
