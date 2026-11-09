import mongoose, { Document, Schema, Types } from 'mongoose';

export type KnowledgeCategory = 'recruitment' | 'survey' | 'sales' | 'support' | 'onboarding' | 'general';

export interface IKnowledgeCollection {
  name: string;
  description?: string;
  category: KnowledgeCategory;
  sourceFileName?: string;
  articlesCount: number;
  isActive: boolean;
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IKnowledgeCollectionDocument extends Document, Omit<IKnowledgeCollection, 'createdById'> {
  createdById: Types.ObjectId;
  toSafeObject(): IKnowledgeCollection & { id: string };
}

export interface IKnowledgeArticle {
  collectionId?: Types.ObjectId;
  sourceFileName?: string;
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
    collectionId: {
      type: Schema.Types.ObjectId,
      ref: 'KnowledgeCollection',
      index: true,
      default: null
    },
    sourceFileName: {
      type: String,
      trim: true
    },
    category: {
      type: String,
      enum: ['recruitment', 'survey', 'sales', 'support', 'onboarding', 'general'],
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

const knowledgeCollectionSchema = new Schema<IKnowledgeCollectionDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    category: {
      type: String,
      enum: ['recruitment', 'survey', 'sales', 'support', 'onboarding', 'general'],
      default: 'recruitment',
      index: true
    },
    sourceFileName: {
      type: String,
      trim: true
    },
    articlesCount: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
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

knowledgeCollectionSchema.methods.toSafeObject = function (): IKnowledgeCollection & { id: string } {
  const obj = this.toObject();
  const id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return {
    ...obj,
    id
  };
};

export const KnowledgeCollection = mongoose.model<IKnowledgeCollectionDocument>(
  'KnowledgeCollection',
  knowledgeCollectionSchema
);

