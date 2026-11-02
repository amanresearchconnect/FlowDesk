import { Types } from 'mongoose';
import { Message, IMessageDocument } from '../../models/message.model.js';
import { Contact } from '../../models/contact.model.js';
import { Campaign } from '../../models/campaign.model.js';
import { mockWhatsAppProvider } from '../../providers/messaging/mock-whatsapp.provider.js';
import { normalizePhoneNumber } from '../../utils/phone.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export class MessagingService {
  private static isInitialized = false;

  public static initialize(): void {
    if (this.isInitialized) return;

    // Listen to mock provider status callbacks (delivered, read)
    mockWhatsAppProvider.onStatusUpdate(async (providerMessageId, status) => {
      try {
        await this.handleStatusUpdate(providerMessageId, status);
      } catch (err: any) {
        logger.error('Failed to process message status callback', {
          providerMessageId,
          status,
          error: err.message
        });
      }
    });

    this.isInitialized = true;
    logger.info('MessagingService initialized with provider callbacks');
  }

  public static async handleStatusUpdate(
    providerMessageId: string,
    status: 'delivered' | 'read'
  ): Promise<IMessageDocument | null> {
    const updateField = status === 'delivered' ? { deliveredAt: new Date() } : { readAt: new Date() };

    const message = await Message.findOneAndUpdate(
      { providerMessageId },
      {
        $set: {
          status,
          ...updateField,
          updatedAt: new Date()
        }
      },
      { new: true }
    );

    if (!message) {
      return null;
    }

    // Update campaign counters if this message is tied to a campaign
    if (message.campaignId) {
      const incField = status === 'delivered' ? { 'stats.delivered': 1 } : { 'stats.read': 1 };
      await Campaign.updateOne({ _id: message.campaignId }, { $inc: incField });
    }

    return message;
  }

  public static async handleIncomingMessage(
    rawFromPhone: string,
    text: string
  ): Promise<{
    message: ReturnType<IMessageDocument['toSafeObject']>;
    contact: any;
    campaignId?: string;
  }> {
    if (!text || !text.trim()) {
      throw new ValidationError('Incoming message text cannot be empty');
    }

    const phoneResult = normalizePhoneNumber(rawFromPhone);
    if (!phoneResult.isValid || !phoneResult.e164) {
      throw new ValidationError(`Invalid phone number: ${rawFromPhone}`);
    }

    const phone = phoneResult.e164;
    let contact = await Contact.findOne({ phone });

    // If contact does not exist, create an untagged contact
    if (!contact) {
      contact = await Contact.create({
        phone,
        optInStatus: 'opted_in',
        lastInteractionAt: new Date()
      });
    } else {
      contact.lastInteractionAt = new Date();
      await contact.save();
    }

    // Locate the most recent outbound message sent to this contact to find active campaign
    const lastOutbound = await Message.findOne({
      contactId: contact._id,
      direction: 'outbound',
      campaignId: { $ne: null }
    }).sort({ createdAt: -1 });

    const campaignId = lastOutbound?.campaignId;

    // Create inbound message
    const message = await Message.create({
      contactId: contact._id,
      campaignId: campaignId || null,
      direction: 'inbound',
      senderType: 'contact',
      provider: 'mock',
      type: 'text',
      content: { body: text.trim() },
      status: 'delivered',
      deliveredAt: new Date()
    });

    // If linked to a campaign, increment the 'replied' stat
    if (campaignId) {
      await Campaign.updateOne({ _id: campaignId }, { $inc: { 'stats.replied': 1 } });
    }

    logger.info('Inbound WhatsApp message processed', {
      phone,
      text: text.trim(),
      campaignId: campaignId?.toString()
    });

    return {
      message: message.toSafeObject(),
      contact: contact.toSafeObject(),
      campaignId: campaignId?.toString()
    };
  }
}

// Auto-initialize provider listeners
MessagingService.initialize();
