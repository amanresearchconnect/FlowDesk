import crypto from 'crypto';
import {
  IMessagingProvider,
  IMessageContent,
  ISendResult,
  IParsedWebhookEvent
} from './messaging.interface.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export class MetaWhatsAppProvider implements IMessagingProvider {
  private readonly baseUrl = 'https://graph.facebook.com/v21.0';

  public async sendMessage(toPhone: string, content: IMessageContent): Promise<ISendResult> {
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID;
    const accessToken = env.WHATSAPP_ACCESS_TOKEN;

    if (!phoneNumberId || !accessToken) {
      throw new Error(
        'Meta WhatsApp credentials missing: WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_ACCESS_TOKEN not configured in .env'
      );
    }

    // Normalize phone number by removing plus and non-digits (Meta requires digits-only format, e.g. 919876543210)
    const cleanRecipient = toPhone.replace(/\D/g, '');

    const url = `${this.baseUrl}/${phoneNumberId}/messages`;

    // Construct Meta Cloud API payload
    let payload: Record<string, any>;

    if (content.templateName) {
      // Template-based message (Required for business-initiated campaigns)
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'template',
        template: {
          name: content.templateName,
          language: {
            code: content.templateParams?.languageCode || 'en_US'
          }
        }
      };

      // Append template component parameters if provided
      if (content.templateParams?.components) {
        payload.template.components = content.templateParams.components;
      }
    } else if (content.buttons && content.buttons.length > 0) {
      // Interactive Button Message (Native quick-reply buttons, e.g. YES / NO)
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: {
            text: content.text || 'Please select an option:'
          },
          action: {
            buttons: content.buttons.slice(0, 3).map((btn, idx) => ({
              type: 'reply',
              reply: {
                id: (btn.id || `btn_${idx + 1}`).slice(0, 256),
                title: btn.title.slice(0, 20)
              }
            }))
          }
        }
      };
    } else {
      // Freeform text message (Permitted within 24-hour service window after candidate replies)
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: cleanRecipient,
        type: 'text',
        text: {
          preview_url: false,
          body: content.text || ''
        }
      };
    }

    logger.info('Dispatching real outbound message via Meta WhatsApp Cloud API', {
      to: cleanRecipient,
      type: payload.type,
      templateName: content.templateName
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await response.json();

    if (!response.ok) {
      const errorDetail = data?.error?.message || data?.error?.error_user_msg || response.statusText;
      const errorCode = data?.error?.code;
      const errorSubcode = data?.error?.error_subcode;

      logger.error('Meta WhatsApp Cloud API error response', {
        status: response.status,
        code: errorCode,
        subcode: errorSubcode,
        message: errorDetail,
        payload
      });

      throw new Error(
        `Meta WhatsApp API dispatch failed (${response.status}): ${errorDetail} (code: ${errorCode || 'unknown'})`
      );
    }

    const providerMessageId = data?.messages?.[0]?.id || `meta_msg_${Date.now()}`;

    logger.info('Meta WhatsApp message dispatched successfully', {
      to: cleanRecipient,
      providerMessageId
    });

    return {
      providerMessageId,
      status: 'sent',
      timestamp: new Date()
    };
  }

  public verifyWebhookSignature(
    headers: Record<string, string>,
    rawPayload: Buffer | string
  ): boolean {
    const appSecret = env.WHATSAPP_APP_SECRET;

    // In development mode, if no secret is configured, bypass signature check
    if (!appSecret) {
      return true;
    }

    const signature = headers['x-hub-signature-256'] || headers['X-Hub-Signature-256'];
    if (!signature) {
      logger.warn('Incoming Meta webhook missing x-hub-signature-256 header');
      return false;
    }

    const expectedSignature = `sha256=${crypto
      .createHmac('sha256', appSecret)
      .update(typeof rawPayload === 'string' ? Buffer.from(rawPayload) : rawPayload)
      .digest('hex')}`;

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
    } catch {
      return false;
    }
  }

  public parseWebhookPayload(payload: any): IParsedWebhookEvent[] {
    const events: IParsedWebhookEvent[] = [];

    if (!payload || payload.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry)) {
      return events;
    }

    for (const entry of payload.entry) {
      const changes = entry.changes || [];
      for (const change of changes) {
        if (change.field !== 'messages' || !change.value) {
          continue;
        }

        const value = change.value;

        // 1. Parse Inbound Messages from Contacts
        if (Array.isArray(value.messages)) {
          for (const msg of value.messages) {
            let text = '';
            if (msg.type === 'text' && msg.text?.body) {
              text = msg.text.body;
            } else if (msg.type === 'button' && msg.button?.text) {
              text = msg.button.text;
            } else if (msg.type === 'interactive') {
              text =
                msg.interactive?.button_reply?.title ||
                msg.interactive?.list_reply?.title ||
                '';
            }

            events.push({
              eventType: 'message',
              providerMessageId: msg.id,
              fromPhone: `+${msg.from}`,
              timestamp: new Date(Number(msg.timestamp) * 1000 || Date.now()),
              text,
              rawPayload: msg
            });
          }
        }

        // 2. Parse Delivery Status Updates (sent, delivered, read, failed)
        if (Array.isArray(value.statuses)) {
          for (const statusObj of value.statuses) {
            const rawStatus = statusObj.status;
            let status: 'sent' | 'delivered' | 'read' | 'failed' | undefined;

            if (rawStatus === 'delivered') status = 'delivered';
            else if (rawStatus === 'read') status = 'read';
            else if (rawStatus === 'sent') status = 'sent';
            else if (rawStatus === 'failed') status = 'failed';

            events.push({
              eventType: 'status_update',
              providerMessageId: statusObj.id,
              toPhone: statusObj.recipient_id ? `+${statusObj.recipient_id}` : undefined,
              status,
              timestamp: new Date(Number(statusObj.timestamp) * 1000 || Date.now()),
              errorMessage: statusObj.errors?.[0]?.message,
              rawPayload: statusObj
            });
          }
        }
      }
    }

    return events;
  }
}

export const metaWhatsAppProvider = new MetaWhatsAppProvider();

