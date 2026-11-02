export interface IAIToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>; // JSON Schema
}

export interface IAIChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

export interface IAIChatOptions {
  messages: IAIChatMessage[];
  tools?: IAIToolDefinition[];
  temperature?: number;
  maxTokens?: number;
}

export interface IAIChatResponse {
  content?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
  confidenceScore?: number;
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter';
}

export interface IAIProvider {
  chat(options: IAIChatOptions): Promise<IAIChatResponse>;
}

