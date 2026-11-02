import mongoose, { Document, Schema, Types } from 'mongoose';

export type KnowledgeCategory = 'recruitment' | 'survey' | 'onboarding' | 'general';

export interface IKnowledgeArticle {
  category: KnowledgeCategory;
  title: string;
  content: string;
  keywords: string[];
  isActive: boolean;
  version: number;
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKnowledgeArticleDocument extends Document, Omit<IKnowledgeArticle, 'createdById'> {
  createdById: Types.ObjectId;
  toSafeObject(): IKnowledgeArticle & { id: string };
}

const knowledgeArticleSchema = new Schema<IKnowledgeArticleDocument>(
  {
    category: {
      type: String,
      enum: ['recruitment', 'survey', 'onboarding', 'general'],
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    keywords: {
      type: [String],
      default: [],
      index: true
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    version: {
      type: Number,
      default: 1
    },
    createdById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  {
    timestamps: true
  }
);

// Compound and text indexes
knowledgeArticleSchema.index({ category: 1, isActive: 1 });
knowledgeArticleSchema.index({ title: 'text', content: 'text' });

knowledgeArticleSchema.methods.toSafeObject = function (): IKnowledgeArticle & { id: string } {
  const obj = this.toObject();
  const id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return {
    ...obj,
    id
  };
};

export const KnowledgeArticle = mongoose.model<IKnowledgeArticleDocument>(
  'KnowledgeArticle',
  knowledgeArticleSchema
);

