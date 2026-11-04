import { IMessagingProvider } from './messaging.interface.js';
import { mockWhatsAppProvider } from './mock-whatsapp.provider.js';
import { metaWhatsAppProvider } from './meta-whatsapp.provider.js';
import { env } from '../../config/env.js';

export function getMessagingProvider(): IMessagingProvider {
  // Always use mock provider in automated test runs to isolate external network calls
  if (env.NODE_ENV === 'test' || env.MESSAGING_PROVIDER === 'mock') {
    return mockWhatsAppProvider;
  }

  return metaWhatsAppProvider;
}
