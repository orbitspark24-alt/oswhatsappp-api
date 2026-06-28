// Provider-agnostic payment contract. Start with a manual/offline provider; Stripe, Razorpay,
// PayPal, etc. drop in later by implementing this same interface and registering themselves.
import { PaymentStatus } from "../../types/enums";

export interface ChargeRequest {
  invoiceId: string;
  amountCents: number;
  currency: string;
  /** Free-form note or external transaction reference. */
  reference?: string;
}

export interface ChargeResult {
  success: boolean;
  status: PaymentStatus;
  reference?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly name: string;
  charge(request: ChargeRequest): Promise<ChargeResult>;
}
