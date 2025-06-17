import { EventEmitter } from "events";

export enum EventType {
  NEW_LEAD = "new_lead",
  CLICK = "click",
}

/**
 * Global event bus used across the application so that different parts of the
 * system can emit and listen to high-level domain events without tight
 * coupling.  It is intentionally very small – only `emitEvent` and `onEvent`
 * helpers – so that we keep a single source of truth for event names.
 */
class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Type–safe helper around `emit` so that we always emit known events.
   */
  public emitEvent<T = any>(type: EventType, payload: T): void {
    this.emit(type, payload);
  }

  /**
   * Type–safe helper around `on` so that we always listen to known events.
   */
  public onEvent<T = any>(
    type: EventType,
    listener: (payload: T) => void
  ): void {
    this.on(type, listener);
  }
}

export const eventBus = EventBus.getInstance();
