import mongoose, { Document, Schema, Types } from 'mongoose';

export type WorkflowNodeType =
  | 'trigger'
  | 'send_message'
  | 'wait_for_reply'
  | 'condition'
  | 'delay'
  | 'verify_data'
  | 'update_record'
  | 'ai_conversation'
  | 'human_handoff'
  | 'terminate';

export interface IWorkflowBranch {
  conditionType: 'equals' | 'regex' | 'contains' | 'default';
  conditionValue?: string;
  targetStepId: string;
}

export interface IWorkflowNode {
  id: string; // e.g. 'step_1'
  type: WorkflowNodeType;
  name: string;
  config: Record<string, any>;
  nextStepId?: string;
  branches?: IWorkflowBranch[];
}

export interface IWorkflow {
  name: string;
  description?: string;
  version: number;
  isPublished: boolean;
  nodes: IWorkflowNode[];
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowDocument extends IWorkflow, Document {
  toSafeObject(): IWorkflow & { id: string };
}

const workflowBranchSchema = new Schema<IWorkflowBranch>(
  {
    conditionType: {
      type: String,
      enum: ['equals', 'regex', 'contains', 'default'],
      default: 'default'
    },
    conditionValue: { type: String, default: null },
    targetStepId: { type: String, required: true }
  },
  { _id: false }
);

const workflowNodeSchema = new Schema<IWorkflowNode>(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: [
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
      ],
      required: true
    },
    name: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    nextStepId: { type: String, default: null },
    branches: [workflowBranchSchema]
  },
  { _id: false }
);

const workflowSchema = new Schema<IWorkflowDocument>(
  {
    name: {
      type: String,
      required: [true, 'Workflow name is required'],
      trim: true,
      maxlength: [150, 'Workflow name must not exceed 150 characters']
    },
    description: {
      type: String,
      trim: true,
      default: ''
    },
    version: {
      type: Number,
      default: 1
    },
    isPublished: {
      type: Boolean,
      default: false
    },
    nodes: [workflowNodeSchema],
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, any>) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    }
  }
);

workflowSchema.index({ name: 1, version: -1 });
workflowSchema.index({ isPublished: 1 });
workflowSchema.index({ createdById: 1 });

workflowSchema.methods.toSafeObject = function (): IWorkflow & { id: string } {
  return this.toJSON() as any;
};

export const Workflow = mongoose.model<IWorkflowDocument>('Workflow', workflowSchema);

