import { Router } from 'express';
import { ConversationsController } from './conversations.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';

const router = Router();

router.get('/', requireAuth, ConversationsController.listConversations);
router.get('/:id', requireAuth, ConversationsController.getConversation);
router.get('/:id/messages', requireAuth, ConversationsController.getMessages);
router.post('/:id/messages', requireAuth, ConversationsController.sendMessage);
router.post('/:id/takeover', requireAuth, ConversationsController.takeover);
router.post('/:id/release-to-bot', requireAuth, ConversationsController.releaseToBot);
router.post('/:id/close', requireAuth, ConversationsController.close);

export const conversationsRouter = router;

