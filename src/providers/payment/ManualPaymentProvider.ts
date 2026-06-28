import { PaymentProvider, ChargeRequest, ChargeResult } from "./PaymentProvider.interface";

// Offline payment provider: the operator confirms payment was received out-of-band (bank
// transfer, cash, etc.) and this records it as succeeded. The clean slot for real gateways.
export class ManualPaymentProvider implements PaymentProvider {
  readonly name = "manual";

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    return {
      success: true,
      status: "SUCCEEDED",
      reference: request.reference ?? "manually-marked-paid",
    };
  }
}
