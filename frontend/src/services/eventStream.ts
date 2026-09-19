import { BASE_URL, getInitData } from "./api";

export type EventCallback<T = unknown> = (data: T) => void;

class ServerEventStream {
  private abortController: AbortController | null = null;
  private listeners: Map<string, Set<EventCallback<unknown>>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private isExplicitlyClosed = false;
  private isConnected = false;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private handleVisibilityChange = () => {
    if (document.hidden) {
      // Pause connection while tab is hidden to save battery & backend resources
      this.closeStream();
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
    }

    this.listeners.get(eventType)!.add(callback as EventCallback<unknown>);

    if (!this.isConnected && !this.abortController && (typeof document === "undefined" || !document.hidden)) {
      this.connect();
    }

    return () => {
      this.unsubscribe(eventType, callback as EventCallback<unknown>);
    };
  }

  private unsubscribe(eventType: string, callback: EventCallback<unknown>) {
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
    if (this.abortController || this.isConnected) {
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
    const abortController = new AbortController();
    this.abortController = abortController;

    void this.startStream(initData, abortController);
  }

  private async startStream(initData: string, controller: AbortController) {
    const { signal } = controller;
    try {
      const response = await fetch(`${BASE_URL}/api/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Telegram-Init-Data": initData,
        },
        body: JSON.stringify({ init_data: initData }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`SSE request failed with status ${response.status}`);
      }
      if (!response.body) {
        throw new Error("ReadableStream not supported on response body");
      }

      this.isConnected = true;
      this.reconnectAttempts = 0;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Split by SSE event boundaries (\n\n or \r\n\r\n)
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() ?? "";

        for (const block of parts) {
          if (!block.trim()) continue;
          let eventType = "message";
          const dataLines: string[] = [];

          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith(":")) {
              // Comment / keep-alive, ignore
              continue;
            }
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }

          if (dataLines.length > 0) {
            const rawData = dataLines.join("\n");
            let parsedData: unknown = null;
            try {
              parsedData = JSON.parse(rawData);
            } catch {
              parsedData = rawData;
            }
            this.dispatchEvent(eventType, parsedData);
          }
        }
      }
    } catch (err: unknown) {
      if (signal.aborted) {
        // Closed intentionally, do not log or reconnect
        return;
      }
      console.warn("SSE stream connection failed or interrupted:", err);
    } finally {
      this.isConnected = false;
      if (this.abortController === controller) {
        this.abortController = null;
      }
      if (!signal.aborted) {
        this.scheduleReconnect();
      }
    }
  }

  private dispatchEvent(eventType: string, data: unknown) {
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

  private closeStream() {
    this.isConnected = false;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
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
    this.closeStream();
  }
}

export const eventStream = new ServerEventStream();
