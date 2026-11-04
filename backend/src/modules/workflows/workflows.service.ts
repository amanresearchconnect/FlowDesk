import mongoose, { Types } from 'mongoose';
import { Workflow, IWorkflowDocument } from '../../models/workflow.model.js';
import {
  WorkflowExecution,
  IWorkflowExecutionDocument
} from '../../models/workflow-execution.model.js';
import { CreateWorkflowInput, UpdateWorkflowInput } from './workflows.validator.js';
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

  public static async updateWorkflow(
    id: string,
    input: UpdateWorkflowInput
  ): Promise<ReturnType<IWorkflowDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid workflow ID format');
    }

    const workflow = await Workflow.findById(id);
    if (!workflow) {
      throw new NotFoundError('Workflow not found');
    }

    if (input.name) workflow.name = input.name;
    if (input.description !== undefined) workflow.description = input.description;
    if (input.nodes) {
      workflow.nodes = input.nodes as any;
      workflow.version += 1;
    }
    if (input.isPublished !== undefined) workflow.isPublished = input.isPublished;

    await workflow.save();
    return workflow.toSafeObject();
  }

  public static async deleteWorkflow(id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid workflow ID format');
    }

    const result = await Workflow.findByIdAndDelete(id);
    if (!result) {
      throw new NotFoundError('Workflow not found');
    }

    return true;
  }

  public static async triggerWorkflowForContact(
    workflowId: string,
    phone: string,
    variables: Record<string, any> = {}
  ): Promise<ReturnType<IWorkflowExecutionDocument['toSafeObject']>> {
    const { normalizePhoneNumber } = await import('../../utils/phone.js');
    const { Contact } = await import('../../models/contact.model.js');
    const { WorkflowEngine } = await import('./workflow.engine.js');

    const phoneRes = normalizePhoneNumber(phone);
    if (!phoneRes.isValid || !phoneRes.e164) {
      throw new ValidationError(`Invalid recipient phone number: ${phone}`);
    }

    let contact = await Contact.findOne({ phone: phoneRes.e164 });
    if (!contact) {
      contact = await Contact.create({
        phone: phoneRes.e164,
        firstName: variables.firstName || 'Candidate',
        lastName: variables.lastName || '',
        tags: ['workflow_test']
      });
    }

    const execution = await WorkflowEngine.startExecution(
      workflowId,
      contact._id.toString(),
      undefined,
      {
        firstName: contact.firstName,
        phone: contact.phone,
        ...variables
      }
    );

    return execution.toSafeObject();
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

