import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type ContactListSourceType = 'csv_upload' | 'excel_upload' | 'manual' | 'api';

export interface IContactList {
  name: string;
  description?: string;
  sourceType: ContactListSourceType;
  originalFileName?: string;
  totalCount: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  createdById: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContactListDocument extends IContactList, Document {
  toSafeObject(): IContactList & { id: string };
}

const contactListSchema = new Schema<IContactListDocument>(
  {
    name: {
      type: String,
      required: [true, 'Contact list name is required'],
      trim: true,
      maxlength: [150, 'Name must not exceed 150 characters']
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description must not exceed 500 characters'],
      default: ''
    },
    sourceType: {
      type: String,
      enum: ['csv_upload', 'excel_upload', 'manual', 'api'],
      default: 'csv_upload'
    },
    originalFileName: {
      type: String,
      trim: true,
      default: null
    },
    totalCount: {
      type: Number,
      default: 0
    },
    validCount: {
      type: Number,
      default: 0
    },
    duplicateCount: {
      type: Number,
      default: 0
    },
    errorCount: {
      type: Number,
      default: 0
    },
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

contactListSchema.index({ name: 1 });
contactListSchema.index({ createdById: 1, createdAt: -1 });

contactListSchema.methods.toSafeObject = function (): IContactList & { id: string } {
  return this.toJSON() as any;
};

export const ContactList = mongoose.model<IContactListDocument>('ContactList', contactListSchema);

