import mongoose, { Document, Model, Schema, Types } from 'mongoose';

export type OptInStatus = 'opted_in' | 'opted_out' | 'unknown';

export interface IContact {
  phone: string; // E.164 normalized (+919876543210)
  firstName?: string;
  lastName?: string;
  email?: string;
  contactListIds: Types.ObjectId[];
  tags: string[];
  customFields: Record<string, any>;
  optInStatus: OptInStatus;
  optInUpdatedAt?: Date;
  lastInteractionAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IContactDocument extends IContact, Document {
  toSafeObject(): IContact & { id: string };
}

const contactSchema = new Schema<IContactDocument>(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [/^\+[1-9]\d{1,14}$/, 'Phone number must conform to E.164 format (e.g. +919876543210)']
    },
    firstName: {
      type: String,
      trim: true,
      maxlength: [100, 'First name must not exceed 100 characters'],
      default: ''
    },
    lastName: {
      type: String,
      trim: true,
      maxlength: [100, 'Last name must not exceed 100 characters'],
      default: ''
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: [150, 'Email must not exceed 150 characters'],
      default: null
    },
    contactListIds: [
      {
        type: Schema.Types.ObjectId,
        ref: 'ContactList'
      }
    ],
    tags: [
      {
        type: String,
        trim: true
      }
    ],
    customFields: {
      type: Schema.Types.Mixed,
      default: {}
    },
    optInStatus: {
      type: String,
      enum: ['opted_in', 'opted_out', 'unknown'],
      default: 'opted_in'
    },
    optInUpdatedAt: {
      type: Date,
      default: Date.now
    },
    lastInteractionAt: {
      type: Date,
      default: null
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

contactSchema.index({ contactListIds: 1 });
contactSchema.index({ tags: 1 });
contactSchema.index({ optInStatus: 1 });

contactSchema.methods.toSafeObject = function (): IContact & { id: string } {
  return this.toJSON() as any;
};

export const Contact = mongoose.model<IContactDocument>('Contact', contactSchema);

