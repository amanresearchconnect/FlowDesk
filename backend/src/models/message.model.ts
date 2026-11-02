import mongoose, { Document, Schema, Types } from 'mongoose';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageSenderType = 'system' | 'agent' | 'contact' | 'ai';
export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
export type MessageType = 'text' | 'template' | 'interactive';

export interface IMessage {
  contactId: Types.ObjectId;
  campaignId?: Types.ObjectId;
  workflowExecutionId?: Types.ObjectId;
  direction: MessageDirection;
  senderType: MessageSenderType;
  senderUserId?: Types.ObjectId;
  provider: 'mock' | 'meta';
  providerMessageId?: string;
  type: MessageType;
  content: {
    body?: string;
    templateName?: string;
    templateParams?: Record<string, any>;
    mediaUrl?: string;
  };
  status: MessageStatus;
  errorMessage?: string;
  sentAt?: Date;
  deliveredAt?: Date;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMessageDocument extends IMessage, Document {
  toSafeObject(): IMessage & { id: string };
}

const messageSchema = new Schema<IMessageDocument>(
  {
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: true
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null
    },
    workflowExecutionId: {
      type: Schema.Types.ObjectId,
      ref: 'WorkflowExecution',
      default: null
    },
    direction: {
      type: String,
      enum: ['inbound', 'outbound'],
      required: true
    },
    senderType: {
      type: String,
      enum: ['system', 'agent', 'contact', 'ai'],
      default: 'system'
    },
    senderUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    provider: {
      type: String,
      enum: ['mock', 'meta'],
      default: 'mock'
    },
    providerMessageId: {
      type: String,
      sparse: true,
      index: true
    },
    type: {
      type: String,
      enum: ['text', 'template', 'interactive'],
      default: 'text'
    },
    content: {
      body: { type: String, default: '' },
      templateName: { type: String, default: null },
      templateParams: { type: Schema.Types.Mixed, default: {} },
      mediaUrl: { type: String, default: null }
    },
    status: {
      type: String,
      enum: ['queued', 'sent', 'delivered', 'read', 'failed'],
      default: 'queued'
    },
    errorMessage: {
      type: String,
      default: null
    },
    sentAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null }
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

messageSchema.index({ contactId: 1, createdAt: -1 });
messageSchema.index({ campaignId: 1, status: 1 });
messageSchema.index({ status: 1, createdAt: 1 });

messageSchema.methods.toSafeObject = function (): IMessage & { id: string } {
  return this.toJSON() as any;
};

export const Message = mongoose.model<IMessageDocument>('Message', messageSchema);
