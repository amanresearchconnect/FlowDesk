import mongoose, { Types } from 'mongoose';
import { Contact, IContactDocument } from '../../models/contact.model.js';
import { ContactList, IContactListDocument } from '../../models/contact-list.model.js';
import { SpreadsheetService, SpreadsheetPreview } from '../../services/spreadsheet.service.js';
import { tempFileStore } from '../../utils/temp-store.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import { ImportContactsInput, ListContactsQuery, CreateContactInput, CreateContactListInput } from './contacts.validator.js';

export interface UploadPreviewResult extends SpreadsheetPreview {
  fileToken: string;
  originalFileName: string;
}

export interface ImportSummary {
  contactListId: string;
  listName: string;
  totalRows: number;
  validCount: number;
  duplicateCount: number;
  errorCount: number;
  sampleErrors: Array<{ row: number; error: string; rawValue: any }>;
}

export class ContactsService {
  public static async createUploadPreview(
    file: Express.Multer.File
  ): Promise<UploadPreviewResult> {
    if (!file || !file.buffer) {
      throw new ValidationError('No file uploaded or file buffer is empty');
    }

    const preview = SpreadsheetService.getPreview(file.buffer);
    const fileToken = tempFileStore.save(file.buffer, file.originalname);

    return {
      fileToken,
      originalFileName: file.originalname,
      ...preview
    };
  }

  public static async processImport(
    input: ImportContactsInput,
    createdById: string
  ): Promise<ImportSummary> {
    const stored = tempFileStore.get(input.fileToken);
    if (!stored) {
      throw new ValidationError(
        'Upload session expired or token is invalid. Please upload the spreadsheet again.'
      );
    }

    const rows = SpreadsheetService.parseBuffer(stored.buffer);
    const { phone: phoneCol, firstName: firstCol, lastName: lastCol, email: emailCol, customFields: customColMap } =
      input.mappings;

    const seenPhonesInBatch = new Set<string>();
    const validRecords: Array<{
      phone: string;
      firstName: string;
      lastName: string;
      email?: string | null;
      customFields: Record<string, any>;
    }> = [];

    const sampleErrors: Array<{ row: number; error: string; rawValue: any }> = [];
    let duplicateCount = 0;
    let errorCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 1;
      const row = rows[i];
      const rawPhone = row[phoneCol];

      if (!rawPhone) {
        errorCount++;
        if (sampleErrors.length < 10) {
          sampleErrors.push({ row: rowNum, error: `Missing value in phone column '${phoneCol}'`, rawValue: '' });
        }
        continue;
      }

      const phoneResult = normalizePhoneNumber(rawPhone, input.countryCode);
      if (!phoneResult.isValid || !phoneResult.e164) {
        errorCount++;
        if (sampleErrors.length < 10) {
          sampleErrors.push({
            row: rowNum,
            error: phoneResult.error || 'Invalid phone format',
            rawValue: rawPhone
          });
        }
        continue;
      }

      const e164 = phoneResult.e164;
      if (seenPhonesInBatch.has(e164)) {
        duplicateCount++;
        continue;
      }
      seenPhonesInBatch.add(e164);

      // Extract custom fields according to user mapping
      const customFields: Record<string, any> = {};
      if (customColMap) {
        for (const [targetKey, sourceColumn] of Object.entries(customColMap)) {
          if (row[sourceColumn] !== undefined) {
            customFields[targetKey] = row[sourceColumn];
          }
        }
      }

      validRecords.push({
        phone: e164,
        firstName: firstCol && row[firstCol] ? String(row[firstCol]).trim() : '',
        lastName: lastCol && row[lastCol] ? String(row[lastCol]).trim() : '',
        email: emailCol && row[emailCol] ? String(row[emailCol]).trim().toLowerCase() : null,
        customFields
      });
    }

    // Determine source type from file extension
    const isCsv = stored.originalFileName.toLowerCase().endsWith('.csv');
    const sourceType = isCsv ? 'csv_upload' : 'excel_upload';

    // Create the ContactList record
    const contactList = await ContactList.create({
      name: input.listName,
      description: input.description || '',
      sourceType,
      originalFileName: stored.originalFileName,
      totalCount: rows.length,
      validCount: validRecords.length,
      duplicateCount,
      errorCount,
      createdById: new Types.ObjectId(createdById)
    });

    // Bulk upsert valid contacts
    if (validRecords.length > 0) {
      const bulkOps = validRecords.map((record) => ({
        updateOne: {
          filter: { phone: record.phone },
          update: {
            $set: {
              firstName: record.firstName,
              lastName: record.lastName,
              ...(record.email ? { email: record.email } : {}),
              customFields: record.customFields,
              updatedAt: new Date()
            },
            $addToSet: {
              contactListIds: contactList._id,
              ...(input.tags.length > 0 ? { tags: { $each: input.tags } } : {})
            },
            $setOnInsert: {
              optInStatus: 'opted_in' as const,
              createdAt: new Date()
            }
          },
          upsert: true
        }
      }));

      await Contact.bulkWrite(bulkOps as any, { ordered: false });
    }

    // Clean up temporary file token
    tempFileStore.delete(input.fileToken);

    return {
      contactListId: contactList._id.toString(),
      listName: contactList.name,
      totalRows: rows.length,
      validCount: validRecords.length,
      duplicateCount,
      errorCount,
      sampleErrors
    };
  }

  public static async listContacts(query: ListContactsQuery): Promise<{
    contacts: ReturnType<IContactDocument['toSafeObject']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const filter: Record<string, any> = {};

    if (query.contactListId) {
      filter.contactListIds = new Types.ObjectId(query.contactListId);
    }

    if (query.tag) {
      filter.tags = query.tag;
    }

    if (query.optInStatus) {
      filter.optInStatus = query.optInStatus;
    }

    if (query.search) {
      const regex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ firstName: regex }, { lastName: regex }, { phone: regex }, { email: regex }];
    }

    const skip = (query.page - 1) * query.limit;
    const [contacts, total] = await Promise.all([
      Contact.find(filter).sort({ createdAt: -1 }).skip(skip).limit(query.limit),
      Contact.countDocuments(filter)
    ]);

    return {
      contacts: contacts.map((c) => c.toSafeObject()),
      total,
      page: query.page,
      limit: query.limit
    };
  }

  public static async getContactById(
    id: string
  ): Promise<ReturnType<IContactDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid contact ID format');
    }

    const contact = await Contact.findById(id).populate('contactListIds', 'name createdAt');
    if (!contact) {
      throw new NotFoundError('Contact not found');
    }

    return contact.toSafeObject();
  }

  public static async listContactLists(
    page = 1,
    limit = 25
  ): Promise<{
    lists: ReturnType<IContactListDocument['toSafeObject']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const [lists, total] = await Promise.all([
      ContactList.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      ContactList.countDocuments()
    ]);

    return {
      lists: lists.map((l) => l.toSafeObject()),
      total,
      page,
      limit
    };
  }

  public static async createContact(
    input: CreateContactInput,
    _createdById: string
  ): Promise<ReturnType<IContactDocument['toSafeObject']>> {
    const phoneResult = normalizePhoneNumber(input.phone, input.countryCode || 'IN');
    if (!phoneResult.isValid || !phoneResult.e164) {
      throw new ValidationError(phoneResult.error || 'Invalid phone number format');
    }

    const e164 = phoneResult.e164;
    let listObjectId: Types.ObjectId | null = null;
    if (input.contactListId) {
      if (!mongoose.isValidObjectId(input.contactListId)) {
        throw new ValidationError('Invalid contact list ID format');
      }
      const listExists = await ContactList.findById(input.contactListId);
      if (!listExists) {
        throw new NotFoundError('Target contact list not found');
      }
      listObjectId = new Types.ObjectId(input.contactListId);
    }

    let contact = await Contact.findOne({ phone: e164 });
    const isNew = !contact;

    if (!contact) {
      contact = new Contact({
        phone: e164,
        firstName: input.firstName || '',
        lastName: input.lastName || '',
        email: input.email || undefined,
        contactListIds: listObjectId ? [listObjectId] : [],
        tags: input.tags || [],
        customFields: input.customFields || {},
        optInStatus: 'opted_in'
      });
    } else {
      if (input.firstName !== undefined) contact.firstName = input.firstName;
      if (input.lastName !== undefined) contact.lastName = input.lastName;
      if (input.email !== undefined) contact.email = input.email || undefined;
      if (input.customFields) {
        contact.customFields = { ...(contact.customFields || {}), ...input.customFields };
      }
      if (input.tags && input.tags.length > 0) {
        const set = new Set([...contact.tags, ...input.tags]);
        contact.tags = Array.from(set);
      }
      if (listObjectId && !contact.contactListIds.some((id) => id.toString() === listObjectId!.toString())) {
        contact.contactListIds.push(listObjectId);
      }
    }

    await contact.save();

    if (listObjectId && isNew) {
      await ContactList.updateOne(
        { _id: listObjectId },
        { $inc: { totalCount: 1, validCount: 1 } }
      );
    }

    return contact.toSafeObject();
  }

  public static async deleteContact(
    id: string,
    contactListId?: string
  ): Promise<{ success: boolean; message: string; deletedCompletely: boolean }> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid contact ID format');
    }

    const contact = await Contact.findById(id);
    if (!contact) {
      throw new NotFoundError('Contact not found');
    }

    if (contactListId) {
      if (!mongoose.isValidObjectId(contactListId)) {
        throw new ValidationError('Invalid contact list ID format');
      }

      contact.contactListIds = contact.contactListIds.filter(
        (lId) => lId.toString() !== contactListId
      );

      await ContactList.updateOne(
        { _id: new Types.ObjectId(contactListId) },
        { $inc: { totalCount: -1, validCount: -1 } }
      );

      if (contact.contactListIds.length === 0) {
        await contact.deleteOne();
        return {
          success: true,
          message: 'Contact removed from list and deleted permanently',
          deletedCompletely: true
        };
      } else {
        await contact.save();
        return {
          success: true,
          message: 'Contact removed from list',
          deletedCompletely: false
        };
      }
    } else {
      if (contact.contactListIds && contact.contactListIds.length > 0) {
        await ContactList.updateMany(
          { _id: { $in: contact.contactListIds } },
          { $inc: { totalCount: -1, validCount: -1 } }
        );
      }
      await contact.deleteOne();
      return {
        success: true,
        message: 'Contact permanently deleted',
        deletedCompletely: true
      };
    }
  }

  public static async createContactList(
    input: CreateContactListInput,
    createdById: string
  ): Promise<ReturnType<IContactListDocument['toSafeObject']>> {
    const userObjectId = mongoose.isValidObjectId(createdById)
      ? new Types.ObjectId(createdById)
      : new Types.ObjectId();

    const list = await ContactList.create({
      name: input.name,
      description: input.description || '',
      sourceType: 'manual',
      totalCount: 0,
      validCount: 0,
      duplicateCount: 0,
      errorCount: 0,
      createdById: userObjectId
    });

    return list.toSafeObject();
  }

  public static async deleteContactList(
    id: string
  ): Promise<{ success: boolean; message: string; deletedContactsCount: number }> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid contact list ID format');
    }

    const list = await ContactList.findById(id);
    if (!list) {
      throw new NotFoundError('Contact list not found');
    }

    const listObjectId = new Types.ObjectId(id);

    // Delete contacts whose only list was this one
    const deleteContactsResult = await Contact.deleteMany({
      contactListIds: [listObjectId]
    });

    // Remove list reference from contacts belonging to multiple lists
    await Contact.updateMany(
      { contactListIds: listObjectId },
      { $pull: { contactListIds: listObjectId } }
    );

    // Delete the ContactList document
    await list.deleteOne();

    return {
      success: true,
      message: `Contact database '${list.name}' and ${deleteContactsResult.deletedCount} associated contacts permanently deleted`,
      deletedContactsCount: deleteContactsResult.deletedCount
    };
  }
}
