import mongoose, { Document, Schema, Types } from 'mongoose';

export type ConversationStatus = 'bot' | 'human_needed' | 'agent_assigned' | 'closed';

export interface IConversation {
  contactId: Types.ObjectId;
  channel: 'whatsapp';
  assignedUserId?: Types.ObjectId;
  status: ConversationStatus;
  lastMessageAt?: Date;
  lastMessagePreview?: string;
  unreadCount: number;
  activeCampaignId?: Types.ObjectId;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IConversationDocument extends IConversation, Document {
  toSafeObject(): IConversation & { id: string };
}

const conversationSchema = new Schema<IConversationDocument>(
  {
    contactId: {
      type: Schema.Types.ObjectId,
      ref: 'Contact',
      required: true,
      unique: true
    },
    channel: {
      type: String,
      enum: ['whatsapp'],
      default: 'whatsapp'
    },
    assignedUserId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    status: {
      type: String,
      enum: ['bot', 'human_needed', 'agent_assigned', 'closed'],
      default: 'bot'
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    },
    lastMessagePreview: {
      type: String,
      default: ''
    },
    unreadCount: {
      type: Number,
      default: 0
    },
    activeCampaignId: {
      type: Schema.Types.ObjectId,
      ref: 'Campaign',
      default: null
    },
    tags: [
      {
        type: String,
        trim: true
      }
    ]
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

conversationSchema.index({ status: 1, lastMessageAt: -1 });
conversationSchema.index({ assignedUserId: 1, status: 1 });
conversationSchema.index({ lastMessageAt: -1 });

conversationSchema.methods.toSafeObject = function (): IConversation & { id: string } {
  return this.toJSON() as any;
};

export const Conversation = mongoose.model<IConversationDocument>('Conversation', conversationSchema);
