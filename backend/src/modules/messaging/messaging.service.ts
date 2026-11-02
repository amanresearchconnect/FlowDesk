import { Types } from 'mongoose';
import { Message, IMessageDocument } from '../../models/message.model.js';
import { Contact } from '../../models/contact.model.js';
import { Campaign } from '../../models/campaign.model.js';
import { Conversation } from '../../models/conversation.model.js';
import { WorkflowEngine } from '../workflows/workflow.engine.js';
import { AIAgentService } from '../ai-agent/ai-agent.service.js';
import { emitToConversation, emitToTeam } from '../../socket/socket.server.js';
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

    // Broadcast status update via Socket.IO
    if (message.conversationId) {
      emitToConversation(message.conversationId.toString(), 'message:status_updated', {
        messageId: message._id.toString(),
        providerMessageId,
        status
      });
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

    // Find or create Conversation thread for contact
    let conversation = await Conversation.findOne({ contactId: contact._id });
    if (!conversation) {
      conversation = await Conversation.create({
        contactId: contact._id,
        channel: 'whatsapp',
        status: 'bot',
        activeCampaignId: campaignId || null,
        lastMessageAt: new Date(),
        lastMessagePreview: text.trim().substring(0, 100),
        unreadCount: 1
      });
    } else {
      conversation.lastMessageAt = new Date();
      conversation.lastMessagePreview = text.trim().substring(0, 100);
      conversation.unreadCount = (conversation.unreadCount || 0) + 1;
      if (campaignId) conversation.activeCampaignId = campaignId;
      await conversation.save();
    }

    // Create inbound message
    const message = await Message.create({
      conversationId: conversation._id,
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

    const safeMessage = message.toSafeObject();

    // Broadcast live event via Socket.IO
    emitToConversation(conversation._id.toString(), 'message:received', safeMessage);
    emitToTeam('message:received', {
      conversationId: conversation._id.toString(),
      message: safeMessage,
      contact: contact.toSafeObject()
    });

    // If linked to a campaign, increment the 'replied' stat
    if (campaignId) {
      await Campaign.updateOne({ _id: campaignId }, { $inc: { 'stats.replied': 1 } });
    }

    // Trigger workflow engine if contact is waiting for reply
    const workflowResult = await WorkflowEngine.handleContactReply(contact._id, text.trim());

    // If workflow did not consume this message and conversation is bot-managed, pass to AI Agent
    if (!workflowResult.handled) {
      const freshConv = await Conversation.findById(conversation._id);
      if (freshConv && freshConv.status === 'bot') {
        try {
          await AIAgentService.handleCandidateMessage({
            conversationId: freshConv._id,
            contactId: contact._id,
            text: text.trim()
          });
        } catch (aiErr: any) {
          logger.error('Error during AI Agent message handling', {
            conversationId: freshConv._id.toString(),
            error: aiErr.message
          });
        }
      }
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

