import { Router } from 'express';
import { WorkflowsController } from './workflows.controller.js';
import { requireAuth } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/rbac.middleware.js';
import { validateRequest } from '../../middlewares/validate.middleware.js';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  triggerWorkflowTestSchema
} from './workflows.validator.js';

const router = Router();

router.post(
  '/',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  validateRequest({ body: createWorkflowSchema }),
  WorkflowsController.createWorkflow
);

router.put(
  '/:id',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  validateRequest({ body: updateWorkflowSchema }),
  WorkflowsController.updateWorkflow
);

router.delete(
  '/:id',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  WorkflowsController.deleteWorkflow
);

router.post(
  '/:id/trigger-test',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  validateRequest({ body: triggerWorkflowTestSchema }),
  WorkflowsController.triggerTest
);

router.post(
  '/:id/publish',
  requireAuth,
  requireRole(['admin', 'manager', 'agent']),
  WorkflowsController.publishWorkflow
);

router.get('/:id/executions', requireAuth, WorkflowsController.listExecutions);
router.post('/executions/:executionId/pause', requireAuth, WorkflowsController.pauseExecution);
router.post('/executions/:executionId/resume', requireAuth, WorkflowsController.resumeExecution);
router.post('/executions/:executionId/advance', requireAuth, WorkflowsController.advanceExecution);
router.get('/:id', requireAuth, WorkflowsController.getWorkflow);
router.get('/', requireAuth, WorkflowsController.listWorkflows);

export const workflowsRouter = router;

