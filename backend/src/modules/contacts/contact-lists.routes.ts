import { Router } from 'express';
import { ContactsController } from './contacts.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import { createContactListSchema } from './contacts.validator.js';

const router = Router();

router.get('/', requireAuth, ContactsController.listContactLists);

router.post(
  '/',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  validateRequest({ body: createContactListSchema }),
  ContactsController.createContactList
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  ContactsController.deleteContactList
);

export const contactListsRouter = router;

