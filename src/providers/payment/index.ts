import { PaymentProvider } from "./PaymentProvider.interface";
import { ManualPaymentProvider } from "./ManualPaymentProvider";

export * from "./PaymentProvider.interface";
export { ManualPaymentProvider } from "./ManualPaymentProvider";

// Keyed registry so a subscription/invoice can name its payment provider. Add new gateways
// here (e.g. "stripe": new StripeProvider()) without touching billing logic.
const providers: Record<string, PaymentProvider> = {
  manual: new ManualPaymentProvider(),
};

export function getPaymentProvider(key: string): PaymentProvider {
  const provider = providers[key];
  if (!provider) {
    throw new Error(`Unknown payment provider: ${key}`);
  }
  return provider;
}
