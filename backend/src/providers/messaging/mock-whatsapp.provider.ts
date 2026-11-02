import crypto from 'node:crypto';
import {
  IMessagingProvider,
  IMessageContent,
  ISendResult,
  IParsedWebhookEvent
} from './messaging.interface.js';
import { logger } from '../../utils/logger.js';

export interface StoredMockMessage {
  providerMessageId: string;
  toPhone: string;
  content: IMessageContent;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  sentAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

export type StatusUpdateCallback = (providerMessageId: string, status: 'delivered' | 'read') => Promise<void>;

export class MockWhatsAppProvider implements IMessagingProvider {
  private outboundBuffer: StoredMockMessage[] = [];
  private statusListeners: StatusUpdateCallback[] = [];
  public autoSimulateDelivery = true;
  public simulationDelayMs = 50; // Fast for testing; can be configured

  public onStatusUpdate(callback: StatusUpdateCallback): void {
    this.statusListeners.push(callback);
  }

  public async sendMessage(toPhone: string, content: IMessageContent): Promise<ISendResult> {
    const providerMessageId = `mock_msg_${crypto.randomUUID().substring(0, 12)}`;
    const now = new Date();

    const record: StoredMockMessage = {
      providerMessageId,
      toPhone,
      content,
      status: 'sent',
      sentAt: now
    };

    this.outboundBuffer.push(record);
    logger.info('Mock WhatsApp outbound message dispatched', {
      providerMessageId,
      toPhone,
      textPreview: content.text?.substring(0, 50)
    });

    if (this.autoSimulateDelivery) {
      this.scheduleMockStatusTransitions(providerMessageId);
    }

    return {
      providerMessageId,
      status: 'sent',
      timestamp: now
    };
  }

  private scheduleMockStatusTransitions(providerMessageId: string): void {
    // 1. Simulate 'delivered'
    setTimeout(async () => {
      const msg = this.outboundBuffer.find((m) => m.providerMessageId === providerMessageId);
      if (msg) {
        msg.status = 'delivered';
        msg.deliveredAt = new Date();
      }
      for (const listener of this.statusListeners) {
        try {
          await listener(providerMessageId, 'delivered');
        } catch (err: any) {
          logger.warn('Error in mock status listener', { error: err.message });
        }
      }
    }, this.simulationDelayMs).unref();

    // 2. Simulate 'read'
    setTimeout(async () => {
      const msg = this.outboundBuffer.find((m) => m.providerMessageId === providerMessageId);
      if (msg) {
        msg.status = 'read';
        msg.readAt = new Date();
      }
      for (const listener of this.statusListeners) {
        try {
          await listener(providerMessageId, 'read');
        } catch (err: any) {
          logger.warn('Error in mock status listener', { error: err.message });
        }
      }
    }, this.simulationDelayMs * 2).unref();
  }

  public verifyWebhookSignature(_headers: Record<string, string>, _rawPayload: Buffer | string): boolean {
    return true; // Mock mode always accepts simulated payloads
  }

  public parseWebhookPayload(payload: any): IParsedWebhookEvent[] {
    if (!payload) return [];

    if (payload.eventType === 'message' || payload.text) {
      return [
        {
          eventType: 'message',
          providerMessageId: payload.providerMessageId || `mock_inbound_${crypto.randomUUID().substring(0, 8)}`,
          fromPhone: payload.fromPhone,
          text: payload.text,
          timestamp: new Date(),
          rawPayload: payload
        }
      ];
    }

    if (payload.eventType === 'status_update' || payload.status) {
      return [
        {
          eventType: 'status_update',
          providerMessageId: payload.providerMessageId,
          status: payload.status,
          timestamp: new Date(),
          rawPayload: payload
        }
      ];
    }

    return [];
  }

  public getOutboundMessages(): StoredMockMessage[] {
    return [...this.outboundBuffer];
  }

  public clearBuffer(): void {
    this.outboundBuffer = [];
  }
}

// Export singleton instance for mock operations
export const mockWhatsAppProvider = new MockWhatsAppProvider();
