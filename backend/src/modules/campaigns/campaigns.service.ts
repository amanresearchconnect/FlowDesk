import mongoose, { Types } from 'mongoose';
import { Campaign, ICampaignDocument, ICampaignStats } from '../../models/campaign.model.js';
import { ContactList } from '../../models/contact-list.model.js';
import { Contact } from '../../models/contact.model.js';
import { Message } from '../../models/message.model.js';
import { getMessagingProvider } from '../../providers/messaging/messaging.factory.js';
import { interpolateTemplate } from '../../utils/template.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface CreateCampaignInput {
  name: string;
  description?: string;
  contactListId: string;
  messageTemplate: string;
  throttleRatePerSecond?: number;
}

export class CampaignsService {
  public static async createCampaign(
    input: CreateCampaignInput,
    createdById: string
  ): Promise<ReturnType<ICampaignDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(input.contactListId)) {
      throw new ValidationError('Invalid contact list ID format');
    }

    const contactList = await ContactList.findById(input.contactListId);
    if (!contactList) {
      throw new NotFoundError('Contact list not found');
    }

    const campaign = await Campaign.create({
      name: input.name,
      description: input.description || '',
      contactListId: new Types.ObjectId(input.contactListId),
      messageTemplate: input.messageTemplate,
      status: 'draft',
      throttleRatePerSecond: input.throttleRatePerSecond || 20,
      createdById: new Types.ObjectId(createdById),
      stats: {
        totalContacts: 0,
        dispatched: 0,
        delivered: 0,
        read: 0,
        replied: 0,
        failed: 0
      }
    });

    logger.info('Campaign created in draft', { campaignId: campaign._id.toString(), name: campaign.name });
    return campaign.toSafeObject();
  }

  public static async launchCampaign(campaignId: string): Promise<{
    campaignId: string;
    status: string;
    totalEnrolled: number;
    dispatched: number;
  }> {
    if (!mongoose.isValidObjectId(campaignId)) {
      throw new ValidationError('Invalid campaign ID format');
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    if (campaign.status !== 'draft' && campaign.status !== 'paused') {
      throw new ValidationError(`Cannot launch campaign with status '${campaign.status}'`);
    }

    // Retrieve all opted-in contacts belonging to the target list
    const contacts = await Contact.find({
      contactListIds: campaign.contactListId,
      optInStatus: 'opted_in'
    });

    if (contacts.length === 0) {
      throw new ValidationError('The target contact list has zero opted-in contacts to message');
    }

    campaign.status = 'running';
    campaign.startedAt = new Date();
    campaign.stats.totalContacts = contacts.length;
    await campaign.save();

    const provider = getMessagingProvider();
    let dispatchedCount = 0;
    let failedCount = 0;

    // Dispatch messages to contacts
    for (const contact of contacts) {
      const personalizedBody = interpolateTemplate(campaign.messageTemplate, contact.toObject());

      try {
        const sendResult = await provider.sendMessage(contact.phone, {
          text: personalizedBody
        });

        await Message.create({
          contactId: contact._id,
          campaignId: campaign._id,
          direction: 'outbound',
          senderType: 'system',
          provider: 'mock',
          providerMessageId: sendResult.providerMessageId,
          type: 'text',
          content: { body: personalizedBody },
          status: sendResult.status,
          sentAt: sendResult.timestamp
        });

        dispatchedCount++;
      } catch (err: any) {
        failedCount++;
        logger.error('Failed to dispatch campaign message', {
          contactId: contact._id.toString(),
          phone: contact.phone,
          error: err.message
        });
      }
    }

    campaign.stats.dispatched = dispatchedCount;
    campaign.stats.failed = failedCount;
    await campaign.save();

    logger.info('Campaign launched successfully', {
      campaignId: campaign._id.toString(),
      dispatched: dispatchedCount,
      total: contacts.length
    });

    return {
      campaignId: campaign._id.toString(),
      status: campaign.status,
      totalEnrolled: contacts.length,
      dispatched: dispatchedCount
    };
  }

  public static async getCampaignStats(campaignId: string): Promise<{
    campaignId: string;
    status: string;
    stats: ICampaignStats;
  }> {
    if (!mongoose.isValidObjectId(campaignId)) {
      throw new ValidationError('Invalid campaign ID format');
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    return {
      campaignId: campaign._id.toString(),
      status: campaign.status,
      stats: campaign.stats
    };
  }

  public static async listCampaigns(page = 1, limit = 25): Promise<{
    campaigns: ReturnType<ICampaignDocument['toSafeObject']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;
    const [campaigns, total] = await Promise.all([
      Campaign.find()
        .populate('contactListId', 'name totalCount validCount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Campaign.countDocuments()
    ]);

    return {
      campaigns: campaigns.map((c) => c.toSafeObject()),
      total,
      page,
      limit
    };
  }

  public static async getCampaignById(
    campaignId: string
  ): Promise<ReturnType<ICampaignDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(campaignId)) {
      throw new ValidationError('Invalid campaign ID format');
    }

    const campaign = await Campaign.findById(campaignId).populate('contactListId', 'name totalCount validCount');
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    return campaign.toSafeObject();
  }
}
