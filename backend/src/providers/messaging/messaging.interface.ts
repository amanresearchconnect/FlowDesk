export interface IMessageButton {
  id: string;
  title: string;
}

export interface IMessageContent {
  text?: string;
  templateName?: string;
  templateParams?: Record<string, any>;
  mediaUrl?: string;
  buttons?: IMessageButton[];
}

export interface ISendResult {
  providerMessageId: string;
  status: 'queued' | 'sent';
  timestamp: Date;
}

export interface IParsedWebhookEvent {
  eventType: 'message' | 'status_update';
  providerMessageId: string;
  fromPhone?: string;
  toPhone?: string;
  timestamp: Date;
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string;
  text?: string;
  rawPayload: any;
}

export interface IMessagingProvider {
  sendMessage(toPhone: string, content: IMessageContent): Promise<ISendResult>;
  verifyWebhookSignature(headers: Record<string, string>, rawPayload: Buffer | string): boolean;
  parseWebhookPayload(payload: any): IParsedWebhookEvent[];
}
