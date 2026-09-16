import { BASE_URL, getInitData } from "./api";

export type EventCallback<T = unknown> = (data: T) => void;

class ServerEventStream {
  private eventSource: EventSource | null = null;
  private listeners: Map<string, Set<EventCallback<any>>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      // Pause connection while tab is hidden to save battery & backend resources
      this.closeEventSource();
    } else {
      // Immediately resume when tab becomes visible if there are active listeners
      if (this.getTotalListenersCount() > 0) {
        this.reconnectAttempts = 0;
        this.connect();
      }
    }
  };

  private getTotalListenersCount(): number {
    let count = 0;
    for (const callbacks of this.listeners.values()) {
      count += callbacks.size;
    }
    return count;
  }

  public subscribe<T = unknown>(eventType: string, callback: EventCallback<T>): () => void {
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
      if (this.eventSource) {
        this.attachEventListener(eventType);
      }
    }

    this.listeners.get(eventType)!.add(callback as EventCallback<any>);

    if (!this.eventSource && !document.hidden) {
      this.connect();
    }

    return () => {
      this.unsubscribe(eventType, callback as EventCallback<any>);
    };
  }

  private unsubscribe(eventType: string, callback: EventCallback<any>) {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.listeners.delete(eventType);
      }
    }

    // If no more listeners remain across any event types, gracefully disconnect after 3s
    if (this.getTotalListenersCount() === 0) {
      if (this.disconnectTimer) {
        clearTimeout(this.disconnectTimer);
      }
      this.disconnectTimer = setTimeout(() => {
        if (this.getTotalListenersCount() === 0) {
          this.disconnect();
        }
      }, 3000);
    }
  }

  public connect() {
    if (this.eventSource) {
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    this.isExplicitlyClosed = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const initData = getInitData();
    let streamUrl = `${BASE_URL}/api/events`;
    if (initData) {
      const separator = streamUrl.includes("?") ? "&" : "?";
      streamUrl += `${separator}init_data=${encodeURIComponent(initData)}`;
    }

    try {
      this.eventSource = new EventSource(streamUrl);

      this.eventSource.onopen = () => {
        this.reconnectAttempts = 0;
      };

      this.eventSource.onerror = () => {
        this.closeEventSource();
        this.scheduleReconnect();
      };

      // Attach all currently registered custom event types
      for (const eventType of this.listeners.keys()) {
        this.attachEventListener(eventType);
      }
    } catch (err) {
      console.warn("SSE connection initiation failed:", err);
      this.scheduleReconnect();
    }
  }

  private attachEventListener(eventType: string) {
    if (!this.eventSource) return;

    this.eventSource.addEventListener(eventType, (event: MessageEvent) => {
      let data: unknown = null;
      try {
        data = event.data ? JSON.parse(event.data) : null;
      } catch {
        data = event.data;
      }

      const callbacks = this.listeners.get(eventType);
      if (callbacks) {
        callbacks.forEach((cb) => {
          try {
            cb(data);
          } catch (callbackError) {
            console.error(`Error in SSE listener for "${eventType}":`, callbackError);
          }
        });
      }
    });
  }

  private scheduleReconnect() {
    if (this.isExplicitlyClosed || (typeof document !== "undefined" && document.hidden)) {
      return;
    }
    if (this.getTotalListenersCount() === 0) {
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, max 15s
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private closeEventSource() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }
    this.closeEventSource();
  }
}

export const eventStream = new ServerEventStream();
