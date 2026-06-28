// Domain events emitted by services. Future modules and the CRM (via outbound webhooks)
// subscribe to these without the emitting code knowing who listens.

export interface DomainEvents {
  "message.sent": { clientId: string; accountId: string; messageId: string; to: string; type: string };
  "message.inbound": {
    clientId: string;
    accountId: string;
    messageId: string;
    from: string;
    type: string;
    content: unknown;
  };
  "message.status": { clientId: string; accountId: string; waMessageId: string; status: string };
  "invoice.created": { clientId: string; invoiceId: string; amountCents: number };
  "invoice.paid": { clientId: string; invoiceId: string };
  "account.suspended": { clientId: string; accountId: string };
  "subscription.suspended": { clientId: string; subscriptionId: string };
}

export type DomainEventName = keyof DomainEvents;
