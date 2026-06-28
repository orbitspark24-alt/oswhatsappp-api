import { EventEmitter } from "events";
import { DomainEvents, DomainEventName } from "./types";
import { logger } from "../lib/logger";

// In-process typed event bus. Emits are fire-and-forget: a slow or failing subscriber never
// blocks or breaks the action that emitted the event. For multi-process deployments this can
// be backed by Redis pub/sub later without changing emit/on call sites.
class TypedEventBus {
  private emitter = new EventEmitter();

  constructor() {
    // Allow many independent subscribers without Node's default 10-listener warning.
    this.emitter.setMaxListeners(100);
  }

  emit<E extends DomainEventName>(event: E, payload: DomainEvents[E]): void {
    // Defer so emit() returns immediately and subscriber errors stay isolated.
    setImmediate(() => {
      try {
        this.emitter.emit(event, payload);
      } catch (err) {
        logger.error({ err, event }, "Event subscriber threw");
      }
    });
  }

  on<E extends DomainEventName>(event: E, handler: (payload: DomainEvents[E]) => void | Promise<void>): void {
    this.emitter.on(event, (payload: DomainEvents[E]) => {
      Promise.resolve(handler(payload)).catch((err) =>
        logger.error({ err, event }, "Async event handler rejected")
      );
    });
  }
}

export const eventBus = new TypedEventBus();
