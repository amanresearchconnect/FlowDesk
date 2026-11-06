import { Router } from 'express';
import { ContactsController } from './contacts.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { uploadSpreadsheet } from '../../middlewares/upload.middleware.js';
import {
  importContactsSchema,
  listContactsQuerySchema,
  createContactSchema
} from './contacts.validator.js';

const router = Router();

// Ingestion endpoints
router.post(
  '/upload-preview',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  uploadSpreadsheet,
  ContactsController.uploadPreview
);

router.post(
  '/import',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  validateRequest({ body: importContactsSchema }),
  ContactsController.importContacts
);

// Manual contact creation
router.post(
  '/',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  validateRequest({ body: createContactSchema }),
  ContactsController.createContact
);

// Delete contact
router.delete(
  '/:id',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  ContactsController.deleteContact
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

