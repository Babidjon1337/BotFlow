import { useEffect, useRef } from "react";
import { eventStream, type EventCallback } from "../services/eventStream";

/**
 * Subscribes to a server-sent event (SSE) and executes the callback when an event arrives.
 *
 * Automatically manages listener cleanup on unmount or when `enabled` / `eventType` changes.
 * The handler ref ensures re-renders don't cause re-subscribing.
 */
export function useServerEvent<T = unknown>(
  eventType: string | null | undefined,
  handler: EventCallback<T>,
  enabled: boolean = true
): void {
  const handlerRef = useRef<EventCallback<T>>(handler);

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    if (!enabled || !eventType) {
      return;
    }

    const callback: EventCallback<T> = (data: T) => {
      handlerRef.current(data);
    };

    const unsubscribe = eventStream.subscribe<T>(eventType, callback);
    return () => {
      unsubscribe();
    };
  }, [eventType, enabled]);
}
