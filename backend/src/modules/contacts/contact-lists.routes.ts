import { Router } from 'express';
import { ContactsController } from './contacts.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, ContactsController.listContactLists);

export const contactListsRouter = router;

