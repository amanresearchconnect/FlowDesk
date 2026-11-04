import mongoose, { Types } from 'mongoose';
import { env } from '../../config/env.js';
import { Conversation, IConversationDocument, ConversationStatus } from '../../models/conversation.model.js';
import { Contact } from '../../models/contact.model.js';
import { Message, IMessageDocument } from '../../models/message.model.js';
import { getMessagingProvider } from '../../providers/messaging/messaging.factory.js';
import { emitToConversation, emitToTeam } from '../../socket/socket.server.js';
import { NotFoundError, ValidationError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export interface ListConversationsQuery {
  page?: number;
  limit?: number;
  status?: ConversationStatus;
  assignedUserId?: string;
  search?: string;
}

export class ConversationsService {
  public static async getOrCreateConversation(
    contactId: Types.ObjectId | string,
    activeCampaignId?: Types.ObjectId | string | null
  ): Promise<IConversationDocument> {
    const contactObjId = new Types.ObjectId(contactId);

    let conversation = await Conversation.findOne({ contactId: contactObjId });
    if (!conversation) {
      conversation = await Conversation.create({
        contactId: contactObjId,
        channel: 'whatsapp',
        status: 'bot',
        activeCampaignId: activeCampaignId ? new Types.ObjectId(activeCampaignId) : null,
        lastMessageAt: new Date(),
        unreadCount: 0
      });
    }

    return conversation;
  }

  public static async listConversations(query: ListConversationsQuery): Promise<{
    conversations: any[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = query.page || 1;
    const limit = query.limit || 25;
    const skip = (page - 1) * limit;

    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.assignedUserId) {
      filter.assignedUserId = new Types.ObjectId(query.assignedUserId);
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      const matchingContacts = await Contact.find({
        $or: [{ firstName: searchRegex }, { lastName: searchRegex }, { phone: searchRegex }]
      }).select('_id');

      filter.contactId = { $in: matchingContacts.map((c) => c._id) };
    }

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate('contactId', 'firstName lastName phone email customFields tags')
        .populate('assignedUserId', 'name email role')
        .sort({ lastMessageAt: -1 })
        .skip(skip)
        .limit(limit),
      Conversation.countDocuments(filter)
    ]);

    return {
      conversations: conversations.map((c) => c.toSafeObject()),
      total,
      page,
      limit
    };
  }

  public static async getConversationById(id: string): Promise<any> {
    if (!mongoose.isValidObjectId(id)) {
      throw new ValidationError('Invalid conversation ID format');
    }

    const conversation = await Conversation.findById(id)
      .populate('contactId', 'firstName lastName phone email customFields tags optInStatus')
      .populate('assignedUserId', 'name email role');

    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    return conversation.toSafeObject();
  }

  public static async getMessages(
    conversationId: string,
    page = 1,
    limit = 50
  ): Promise<{
    messages: ReturnType<IMessageDocument['toSafeObject']>[];
    total: number;
    page: number;
    limit: number;
  }> {
    if (!mongoose.isValidObjectId(conversationId)) {
      throw new ValidationError('Invalid conversation ID format');
    }

    const convObjId = new Types.ObjectId(conversationId);
    const skip = (page - 1) * limit;

    // Reset unread count when messages are retrieved
    await Conversation.updateOne({ _id: convObjId }, { $set: { unreadCount: 0 } });

    const [messages, total] = await Promise.all([
      Message.find({ conversationId: convObjId })
        .populate('senderUserId', 'name email role')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit),
      Message.countDocuments({ conversationId: convObjId })
    ]);

    return {
      messages: messages.map((m) => m.toSafeObject()),
      total,
      page,
      limit
    };
  }

  public static async sendAgentMessage(
    conversationId: string,
    text: string,
    agentUserId: string
  ): Promise<ReturnType<IMessageDocument['toSafeObject']>> {
    if (!mongoose.isValidObjectId(conversationId)) {
      throw new ValidationError('Invalid conversation ID format');
    }

    if (!text || !text.trim()) {
      throw new ValidationError('Message text cannot be empty');
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    const contact = await Contact.findById(conversation.contactId);
    if (!contact) {
      throw new NotFoundError('Contact associated with conversation not found');
    }

    const provider = getMessagingProvider();
    const sendResult = await provider.sendMessage(contact.phone, { text: text.trim() });

    const message = await Message.create({
      conversationId: conversation._id,
      contactId: contact._id,
      campaignId: conversation.activeCampaignId || null,
      direction: 'outbound',
      senderType: 'agent',
      senderUserId: new Types.ObjectId(agentUserId),
      provider: env.MESSAGING_PROVIDER,
      providerMessageId: sendResult.providerMessageId,
      type: 'text',
      content: { body: text.trim() },
      status: sendResult.status,
      sentAt: sendResult.timestamp
    });

    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = text.trim().substring(0, 100);
    conversation.status = 'agent_assigned';
    conversation.assignedUserId = new Types.ObjectId(agentUserId);
    conversation.unreadCount = 0;
    await conversation.save();

    const safeMessage = message.toSafeObject();

    // Broadcast real-time message via Socket.IO
    emitToConversation(conversationId, 'message:received', safeMessage);
    emitToTeam('message:received', { conversationId, message: safeMessage });

    logger.info('Agent manual WhatsApp message dispatched', {
      conversationId,
      agentUserId,
      phone: contact.phone
    });

    return safeMessage;
  }

  public static async takeoverConversation(
    conversationId: string,
    agentUserId: string
  ): Promise<any> {
    if (!mongoose.isValidObjectId(conversationId)) {
      throw new ValidationError('Invalid conversation ID format');
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    conversation.status = 'agent_assigned';
    conversation.assignedUserId = new Types.ObjectId(agentUserId);
    await conversation.save();

    const payload = {
      conversationId,
      assignedUserId: agentUserId,
      status: 'agent_assigned'
    };

    emitToTeam('conversation:assigned', payload);
    emitToConversation(conversationId, 'conversation:status_changed', payload);

    logger.info('Conversation taken over by agent', { conversationId, agentUserId });
    return conversation.toSafeObject();
  }

  public static async releaseToBot(conversationId: string): Promise<any> {
    if (!mongoose.isValidObjectId(conversationId)) {
      throw new ValidationError('Invalid conversation ID format');
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    conversation.status = 'bot';
    conversation.assignedUserId = undefined;
    await conversation.save();

    const payload = { conversationId, status: 'bot' };
    emitToTeam('conversation:status_changed', payload);
    emitToConversation(conversationId, 'conversation:status_changed', payload);

    logger.info('Conversation released back to automated bot', { conversationId });
    return conversation.toSafeObject();
  }

  public static async closeConversation(conversationId: string): Promise<any> {
    if (!mongoose.isValidObjectId(conversationId)) {
      throw new ValidationError('Invalid conversation ID format');
    }

    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new NotFoundError('Conversation not found');
    }

    conversation.status = 'closed';
    await conversation.save();

    const payload = { conversationId, status: 'closed' };
    emitToTeam('conversation:status_changed', payload);
    emitToConversation(conversationId, 'conversation:status_changed', payload);

    logger.info('Conversation closed', { conversationId });
    return conversation.toSafeObject();
  }
}

