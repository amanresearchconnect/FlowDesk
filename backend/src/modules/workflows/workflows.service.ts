import mongoose, { Types } from 'mongoose';
import { Workflow, IWorkflowDocument } from '../../models/workflow.model.js';
import {
  WorkflowExecution,
  IWorkflowExecutionDocument
} from '../../models/workflow-execution.model.js';
import { CreateWorkflowInput } from './workflows.validator.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';

export class WorkflowsService {
  public static async createWorkflow(
    input: CreateWorkflowInput,
    createdById: string
  ): Promise<ReturnType<IWorkflowDocument['toSafeObject']>> {
    const workflow = await Workflow.create({
      name: input.name,
      description: input.description || '',
      version: 1,
      isPublished: false,
      nodes: input.nodes,
      createdById: new Types.ObjectId(createdById)
    });

    return workflow.toSafeObject();
  }

  public static async getWorkflowById(
    id: string
  ): Promise<ReturnType<IWorkflowDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid workflow ID format');
    }

    const workflow = await Workflow.findById(id);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }

    return workflow.toSafeObject();
  }

  public static async listWorkflows(page = 1, limit = 25): Promise<{
    workflows: ReturnType<IWorkflowDocument['toSafeObject']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const [workflows, total] = await Promise.all([
      Workflow.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Workflow.countDocuments()
    ]);

    return {
      workflows: workflows.map((w) => w.toSafeObject()),
      total,
      page,
      limit
    };
  }

  public static async publishWorkflow(
    id: string
  ): Promise<ReturnType<IWorkflowDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid workflow ID format');
    }

    const workflow = await Workflow.findById(id);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }

    workflow.isPublished = true;
    await workflow.save();

    return workflow.toSafeObject();
  }

  public static async listExecutions(
    workflowId: string,
    page = 1,
    limit = 25
  ): Promise<{
    executions: ReturnType<IWorkflowExecutionDocument['toSafeObject']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!mongoose.isValidObjectId(workflowId)) {
      throw new ValidationError('Invalid workflow ID format');
    }

    const skip = (page - 1) * limit;
    const filter = { workflowId: new Types.ObjectId(workflowId) };

    const [executions, total] = await Promise.all([
      WorkflowExecution.find(filter)
        .populate('contactId', 'phone firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit),
      WorkflowExecution.countDocuments(filter)
    ]);

    return {
      executions: executions.map((e) => e.toSafeObject()),
      total,
      page,
      limit
    };
  }
}
