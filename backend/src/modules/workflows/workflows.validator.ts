import { z } from 'zod';

const workflowBranchSchema = z.object({
  conditionType: z.enum(['equals', 'regex', 'contains', 'default']),
  conditionValue: z.string().optional(),
  targetStepId: z.string().min(1, 'Target step ID is required')
});

const workflowNodeSchema = z.object({
  id: z.string().min(1, 'Node ID is required'),
  type: z.enum([
    'trigger',
    'send_message',
    'wait_for_reply',
    'condition',
    'delay',
    'verify_data',
    'update_record',
    'ai_conversation',
    'human_handoff',
    'terminate'
  ]),
  name: z.string().min(1, 'Node name is required'),
  config: z.record(z.any()).default({}),
  nextStepId: z.string().nullable().optional(),
  branches: z.array(workflowBranchSchema).optional().default([])
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(2, 'Workflow name must be at least 2 characters').max(150),
  description: z.string().trim().optional(),
  nodes: z.array(workflowNodeSchema).min(1, 'Workflow must contain at least one node')
});

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  description: z.string().trim().optional(),
  nodes: z.array(workflowNodeSchema).optional(),
  isPublished: z.boolean().optional()
});

export const triggerWorkflowTestSchema = z.object({
  phone: z.string().min(8, 'Valid phone number is required'),
  variables: z.record(z.any()).optional().default({})
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;

