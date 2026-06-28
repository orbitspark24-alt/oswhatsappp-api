import { WhatsAppProvider } from "./WhatsAppProvider.interface";
import { CloudApiProvider } from "./CloudApiProvider";
import { MockProvider } from "./MockProvider";

export * from "./WhatsAppProvider.interface";
export { CloudApiProvider } from "./CloudApiProvider";
export { MockProvider } from "./MockProvider";

const providers: Record<string, WhatsAppProvider> = {
  CLOUD_API: new CloudApiProvider(),
  MOCK: new MockProvider(),
};

/** providerType matches the Prisma WhatsAppProviderType enum ("CLOUD_API" | "MOCK"). */
export function getWhatsAppProvider(providerType: string): WhatsAppProvider {
  const provider = providers[providerType];
  if (!provider) {
    throw new Error(`Unknown WhatsApp provider type: ${providerType}`);
  }
  return provider;
}
