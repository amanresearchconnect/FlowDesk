import { IMessagingProvider } from './messaging.interface.js';
import { mockWhatsAppProvider } from './mock-whatsapp.provider.js';
import { env } from '../../config/env.js';

export function getMessagingProvider(): IMessagingProvider {
  if (env.MESSAGING_PROVIDER === 'mock') {
    return mockWhatsAppProvider;
  }

  // MetaWhatsAppProvider will be loaded when MESSAGING_PROVIDER=meta
  return mockWhatsAppProvider;
}
