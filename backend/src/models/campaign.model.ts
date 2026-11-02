import mongoose, { Document, Schema, Types } from 'mongoose';

export type CampaignStatus = 'draft' | 'running' | 'paused' | 'completed' | 'cancelled';

export interface ICampaignStats {
  totalContacts: number;
  dispatched: number;
  delivered: number;
  read: number;
  replied: number;
  failed: number;
}

export interface ICampaign {
  name: string;
  description?: string;
  contactListId: Types.ObjectId;
  workflowId?: Types.ObjectId;
  messageTemplate: string;
  status: CampaignStatus;
  stats: ICampaignStats;
  throttleRatePerSecond: number;
  createdById: Types.ObjectId;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaignDocument extends ICampaign, Document {
  toSafeObject(): ICampaign & { id: string };
}

const campaignSchema = new Schema<ICampaignDocument>(
  {
    name: {
      type: String,
      required: [true, 'Campaign name is required'],
      trim: true,
      maxlength: [150, 'Campaign name must not exceed 150 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters'],
      default: ''
    },
    contactListId: {
      type: Schema.Types.ObjectId,
      ref: 'ContactList',
      required: [true, 'Contact list ID is required']
    },
    workflowId: {
      type: Schema.Types.ObjectId,
      ref: 'Workflow',
      default: null
    },
    messageTemplate: {
      type: String,
      required: [true, 'Message template is required'],
      trim: true
    },
    status: {
      type: String,
      enum: ['draft', 'running', 'paused', 'completed', 'cancelled'],
      default: 'draft'
    },
    stats: {
      totalContacts: { type: Number, default: 0 },
      dispatched: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      replied: { type: Number, default: 0 },
      failed: { type: Number, default: 0 }
    },
    throttleRatePerSecond: {
      type: Number,
      default: 20
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null }
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

campaignSchema.index({ status: 1, createdAt: -1 });
campaignSchema.index({ contactListId: 1 });
campaignSchema.index({ createdById: 1, createdAt: -1 });

campaignSchema.methods.toSafeObject = function (): ICampaign & { id: string } {
  return this.toJSON() as any;
};

export const Campaign = mongoose.model<ICampaignDocument>('Campaign', campaignSchema);

