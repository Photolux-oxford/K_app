import { useState, useEffect, useRef, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const WS_BASE = import.meta.env.VITE_WS_URL ?? 'ws://localhost:8000';

export interface ChatMessage {
  id: number | null;
  is_system: boolean;
  sender_email: string | null;
  body: string;
  timestamp: string | null;
  is_own: boolean;
}

export function useChat(
  threadType: 'booking' | 'editing',
  threadId: number,
  token: string | null
): {
  messages: ChatMessage[];
  sendMessage: (body: string) => void;
  connected: boolean;
  loading: boolean;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  // Fetch initial message history and mark as read
  useEffect(() => {
    if (!token || !threadId) return;
    setLoading(true);

    const fetchAndMark = async () => {
      try {
        const [histResp] = await Promise.all([
          fetch(`${API_BASE}/messages/?thread_type=${threadType}&thread_id=${threadId}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          // Mark as read in parallel
          fetch(`${API_BASE}/messages/read/`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ thread_type: threadType, thread_id: threadId }),
          }),
        ]);
        if (histResp.ok) {
          const data: ChatMessage[] = await histResp.json();
          setMessages(data);
        }
      } catch {
        // network error — messages stay empty
      } finally {
        setLoading(false);
      }
    };

    fetchAndMark();
  }, [threadType, threadId, token]);

  // Open WebSocket with reconnect
  useEffect(() => {
    if (!token || !threadId) return;

    let ws: WebSocket | null = null;
    let retryMs = 1000;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (cancelled) return;
      ws = new WebSocket(`${WS_BASE}/ws/chat/${threadType}/${threadId}/?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retryMs = 1000;
      };
      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) {
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 30000);
        }
      };
      ws.onerror = () => ws?.close();

      ws.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.type === 'message') {
            setMessages(prev => {
              // Avoid duplicates if HTTP path already added this id
              if (frame.message?.id != null && prev.some(m => m.id === frame.message.id)) {
                return prev;
              }
              return [...prev, { ...frame.message, is_system: false }];
            });
          }
        } catch {
          // ignore
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      ws?.close();
    };
  }, [threadType, threadId, token]);

  const sendViaHttp = useCallback(async (body: string) => {
    const auth = tokenRef.current;
    if (!auth) return;
    const resp = await fetch(`${API_BASE}/messages/send/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        thread_type: threadType,
        thread_id: threadId,
        body,
      }),
    });
    if (!resp.ok) return;
    const data = await resp.json();
    setMessages(prev => {
      if (data.id != null && prev.some(m => m.id === data.id)) return prev;
      return [
        ...prev,
        {
          id: data.id,
          is_system: false,
          sender_email: data.sender_email ?? null,
          body: data.body,
          timestamp: data.timestamp ?? null,
          is_own: true,
        },
      ];
    });
  }, [threadType, threadId]);

  const sendMessage = useCallback((body: string) => {
    const trimmed = body.trim();
    if (!trimmed) return;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ body: trimmed }));
      return;
    }
    // Redis/WS down — still persist via REST so messaging works locally
    void sendViaHttp(trimmed);
  }, [sendViaHttp]);

  return { messages, sendMessage, connected, loading };
}
