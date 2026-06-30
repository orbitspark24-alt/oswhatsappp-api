// Mirrors the "enum-like" String columns in prisma/schema.prisma. SQLite has no native enum
// support, so these statuses are plain strings at the DB layer — this file is the single
// source of truth for valid values at the application layer. Update both together.
import { z } from "zod";

export const ClientStatus = z.enum(["ACTIVE", "SUSPENDED", "CANCELLED"]);
export type ClientStatus = z.infer<typeof ClientStatus>;

export const WhatsAppProviderType = z.enum(["CLOUD_API", "MOCK"]);
export type WhatsAppProviderType = z.infer<typeof WhatsAppProviderType>;

export const AccountStatus = z.enum(["PENDING", "ACTIVE", "SUSPENDED", "DEPROVISIONED"]);
export type AccountStatus = z.infer<typeof AccountStatus>;

export const HealthStatus = z.enum(["UNKNOWN", "HEALTHY", "UNHEALTHY"]);
export type HealthStatus = z.infer<typeof HealthStatus>;

export const SubscriptionStatus = z.enum(["ACTIVE", "PAST_DUE", "SUSPENDED", "CANCELLED"]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatus>;

export const InvoiceStatus = z.enum(["DRAFT", "ISSUED", "PAID", "OVERDUE", "VOID"]);
export type InvoiceStatus = z.infer<typeof InvoiceStatus>;

export const PaymentStatus = z.enum(["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const MessageDirection = z.enum(["INBOUND", "OUTBOUND"]);
export type MessageDirection = z.infer<typeof MessageDirection>;

export const MessageStatus = z.enum(["QUEUED", "SENT", "DELIVERED", "READ", "FAILED"]);
export type MessageStatus = z.infer<typeof MessageStatus>;

export const TemplateStatus = z.enum(["PENDING", "APPROVED", "REJECTED", "DISABLED"]);
export type TemplateStatus = z.infer<typeof TemplateStatus>;

export const OptInStatus = z.enum(["UNKNOWN", "OPTED_IN", "OPTED_OUT"]);
export type OptInStatus = z.infer<typeof OptInStatus>;

export const ApiKeyStatus = z.enum(["ACTIVE", "REVOKED"]);
export type ApiKeyStatus = z.infer<typeof ApiKeyStatus>;

export const WebhookEndpointStatus = z.enum(["ACTIVE", "DISABLED"]);
export type WebhookEndpointStatus = z.infer<typeof WebhookEndpointStatus>;

export const AutomationType = z.enum(["WELCOME", "KEYWORD", "AWAY", "OPT_OUT", "AI"]);
export type AutomationType = z.infer<typeof AutomationType>;
