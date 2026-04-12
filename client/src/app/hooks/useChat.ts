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

  // Open WebSocket
  useEffect(() => {
    if (!token || !threadId) return;

    const ws = new WebSocket(
      `${WS_BASE}/ws/chat/${threadType}/${threadId}/?token=${token}`
    );
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onerror = () => ws.close();

    ws.onmessage = (event) => {
      try {
        const frame = JSON.parse(event.data);
        if (frame.type === 'message') {
          setMessages(prev => [...prev, { ...frame.message, is_system: false }]);
        }
      } catch {
        // ignore
      }
    };

    return () => {
      ws.close();
    };
  }, [threadType, threadId, token]);

  const sendMessage = useCallback((body: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ body }));
    }
  }, []);

  return { messages, sendMessage, connected, loading };
}
