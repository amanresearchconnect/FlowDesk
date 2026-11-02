import mongoose, { Document, Schema, Types } from 'mongoose';

export type WorkflowExecutionStatus =
  | 'running'
  | 'waiting_for_reply'
  | 'delayed'
  | 'completed'
  | 'failed'
  | 'paused_for_human';

export interface IWorkflowExecutionLog {
  stepId: string;
  stepType: string;
  status: 'started' | 'completed' | 'failed' | 'skipped';
  inputPayload?: any;
  outputPayload?: any;
  error?: string;
  timestamp: Date;
}

export interface IWorkflowExecution {
  workflowId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  contactId: Types.ObjectId;
  status: WorkflowExecutionStatus;
  currentStepId: string;
  variables: Record<string, any>;
  stepLogs: IWorkflowExecutionLog[];
  waitingForReplyUntil?: Date;
  delayUntil?: Date;
  errorDetails?: string;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IWorkflowExecutionDocument extends IWorkflowExecution, Document {
  toSafeObject(): IWorkflowExecution & { id: string };
}

const executionLogSchema = new Schema<IWorkflowExecutionLog>(
  {
    stepId: { type: String, required: true },
    stepType: { type: String, required: true },
    status: {
      type: String,
      enum: ['started', 'completed', 'failed', 'skipped'],
      required: true
    },
    inputPayload: { type: Schema.Types.Mixed, default: null },
    outputPayload: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    timestamp: { type: Date, default: Date.now }
  },
  { _id: false }
);

const workflowExecutionSchema = new Schema<IWorkflowExecutionDocument>(
  {
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow',
      required: true
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null
    },
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: true
    },
    status: {
      type: String,
      enum: [
        'running',
        'waiting_for_reply',
        'delayed',
        'completed',
        'failed',
        'paused_for_human'
      ],
      default: 'running'
    },
    currentStepId: {
      type: String,
      required: true
    },
    variables: {
      type: Schema.Types.Mixed,
      default: {}
    },
    stepLogs: [executionLogSchema],
    waitingForReplyUntil: { type: Date, default: null },
    delayUntil: { type: Date, default: null },
    errorDetails: { type: String, default: null },
    retryCount: { type: Number, default: 0 }
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

workflowExecutionSchema.index({ campaignId: 1, contactId: 1 });
workflowExecutionSchema.index({ contactId: 1, status: 1 });
workflowExecutionSchema.index({ status: 1, waitingForReplyUntil: 1 });

workflowExecutionSchema.methods.toSafeObject = function (): IWorkflowExecution & { id: string } {
  return this.toJSON() as any;
};

export const WorkflowExecution = mongoose.model<IWorkflowExecutionDocument>(
  'WorkflowExecution',
  workflowExecutionSchema
);
