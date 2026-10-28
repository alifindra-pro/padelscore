"use client";

import { useEffect, useState, useRef, useEffectEvent } from "react";

export interface UseSSEOptions<T = unknown, U = unknown> {
  url: string;
  onInitialState?: (data: T) => void;
  onUpdate?: (data: U) => void;
  enabled?: boolean;
}

export function useSSE<T = unknown, U = unknown>({
  url,
  onInitialState,
  onUpdate,
  enabled = true,
}: UseSSEOptions<T, U>) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const receiveInitial = useEffectEvent((data: T) => onInitialState?.(data));
  const receiveUpdate = useEffectEvent((data: U) => onUpdate?.(data));

  useEffect(() => {
    if (!enabled || !url) return;

    let isSubscribed = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!isSubscribed) return;

      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onopen = () => {
        if (!isSubscribed) return;
        setIsConnected(true);
        setError(null);
      };

      es.addEventListener("initial-state", (event) => {
        if (!isSubscribed) return;
        try {
          const data = JSON.parse(event.data);
          receiveInitial(data);
        } catch (e) {
          console.error("Failed to parse SSE initial state:", e);
        }
      });

      es.addEventListener("score-update", (event) => {
        if (!isSubscribed) return;
        try {
          const data = JSON.parse(event.data);
          receiveUpdate(data);
        } catch (e) {
          console.error("Failed to parse SSE score update:", e);
        }
      });

      es.addEventListener("match-update", (event) => {
        if (!isSubscribed) return;
        try {
          const data = JSON.parse(event.data);
          receiveUpdate(data);
        } catch (e) {
          console.error("Failed to parse SSE match update:", e);
        }
      });

      es.onerror = () => {
        if (!isSubscribed) return;
        setIsConnected(false);
        es.close();
        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      isSubscribed = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      setIsConnected(false);
    };
  }, [url, enabled]);

  return { isConnected, error };
}
