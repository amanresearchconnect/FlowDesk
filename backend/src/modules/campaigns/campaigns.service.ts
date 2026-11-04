import mongoose, { Types } from 'mongoose';
import { Campaign, ICampaignDocument, ICampaignStats } from '../../models/campaign.model.js';
import { ContactList } from '../../models/contact-list.model.js';
import { Contact } from '../../models/contact.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { Message } from '../../models/message.model.js';
import { getMessagingProvider } from '../../providers/messaging/messaging.factory.js';
import { interpolateTemplate } from '../../utils/template.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';

export interface CreateCampaignInput {
  name: string;
  description?: string;
  contactListId: string;
  workflowId?: string | null;
  messageTemplate: string;
  buttons?: Array<{ id: string; title: string }>;
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
      workflowId: input.workflowId && mongoose.isValidObjectId(input.workflowId)
        ? new Types.ObjectId(input.workflowId)
        : null,
      messageTemplate: input.messageTemplate,
      buttons: input.buttons || [],
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

    logger.info('Campaign created in draft', {
      campaignId: campaign._id.toString(),
      name: campaign.name,
      workflowId: campaign.workflowId?.toString(),
      hasButtons: (campaign.buttons?.length || 0) > 0
    });
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

    // Allow launching if in draft, paused, or if previous launch experienced failures
    const hasFailures = (campaign.stats?.failed || 0) > 0;
    if (campaign.status !== 'draft' && campaign.status !== 'paused' && !hasFailures) {
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

    // Dispatch messages or launch automated workflow
    if (campaign.workflowId) {
      const { WorkflowEngine } = await import('../workflows/workflow.engine.js');
      for (const contact of contacts) {
        try {
          await WorkflowEngine.startExecution(
            campaign.workflowId.toString(),
            contact._id.toString(),
            campaign._id.toString(),
            contact.toObject()
          );
          dispatchedCount++;
        } catch (err: any) {
          failedCount++;
          logger.error('Failed to start workflow execution for contact', {
            contactId: contact._id.toString(),
            phone: contact.phone,
            error: err.message
          });
        }
      }
    } else {
      const buttons = campaign.buttons && campaign.buttons.length > 0 ? campaign.buttons : undefined;
      for (const contact of contacts) {
        const personalizedBody = interpolateTemplate(campaign.messageTemplate, contact.toObject());

        try {
          const sendResult = await provider.sendMessage(contact.phone, {
            text: personalizedBody,
            buttons
          });

          let conversation = await Conversation.findOne({ contactId: contact._id });
          if (!conversation) {
            conversation = await Conversation.create({
              contactId: contact._id,
              channel: 'whatsapp',
              status: 'bot',
              activeCampaignId: campaign._id,
              lastMessageAt: new Date(),
              lastMessagePreview: personalizedBody.substring(0, 100),
              unreadCount: 0
            });
          } else {
            conversation.lastMessageAt = new Date();
            conversation.lastMessagePreview = personalizedBody.substring(0, 100);
            conversation.activeCampaignId = campaign._id;
            await conversation.save();
          }

          const messageType = buttons && buttons.length > 0 ? 'interactive' : 'text';
          await Message.create({
            conversationId: conversation._id,
            contactId: contact._id,
            campaignId: campaign._id,
            direction: 'outbound',
            senderType: 'system',
            provider: env.MESSAGING_PROVIDER === 'meta' ? 'meta' : 'mock',
            providerMessageId: sendResult.providerMessageId,
            type: messageType,
            content: {
              body: personalizedBody,
              buttons: buttons || []
            },
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
    }

    await Campaign.updateOne(
      { _id: campaign._id },
      {
        $set: {
          status: 'active',
          'stats.dispatched': dispatchedCount,
          'stats.failed': failedCount
        }
      }
    );

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

  public static async deleteCampaign(campaignId: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(campaignId)) {
      throw new ValidationError('Invalid campaign ID format');
    }
    const result = await Campaign.findByIdAndDelete(campaignId);
    if (!result) {
      throw new NotFoundError('Campaign not found');
    }
    return true;
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
        .populate('workflowId', 'name isPublished')
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

    const campaign = await Campaign.findById(campaignId)
      .populate('contactListId', 'name totalCount validCount')
      .populate('workflowId', 'name isPublished');
    if (!campaign) {
      throw new NotFoundError('Campaign not found');
    }

    return campaign.toSafeObject();
  }
}
