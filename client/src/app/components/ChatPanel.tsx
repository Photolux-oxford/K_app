import { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat, type ChatMessage } from '../hooks/useChat';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface ThreadMeta {
  thread_type: 'booking' | 'editing';
  thread_id: number;
  subject: string;
  customer_email?: string;
  status?: string;
  quoted_price?: string | null;
}

interface ChatPanelProps {
  threadType: 'booking' | 'editing';
  threadId: number;
  isAdmin: boolean;
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
}

export function ChatPanel({ threadType, threadId, isAdmin }: ChatPanelProps) {
  const { token } = useAuth();
  const { messages, sendMessage, connected, loading } = useChat(threadType, threadId, token);
  const [meta, setMeta] = useState<ThreadMeta | null>(null);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!token || !threadId || !isAdmin) return;
    const endpoint = threadType === 'editing'
      ? `${API_BASE}/admin/editing-requests/`
      : `${API_BASE}/admin/bookings/`;

    fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then((items: Array<{
        id: number; customer_email: string; style_notes?: string;
        session_type?: string; location?: string; status: string; quoted_price?: string | null;
      }>) => {
        const item = items.find(i => i.id === threadId);
        if (item) {
          const subject = threadType === 'editing'
            ? (item.style_notes ?? '').slice(0, 60)
            : `${item.session_type ?? ''} · ${item.location ?? ''}`;
          setMeta({
            thread_type: threadType,
            thread_id: threadId,
            subject,
            customer_email: item.customer_email,
            status: item.status,
            quoted_price: item.quoted_price,
          });
        }
      })
      .catch(() => {});
  }, [threadType, threadId, token, isAdmin]);

  const handleSend = useCallback(() => {
    const body = inputValue.trim();
    if (!body) return;
    sendMessage(body);
    setInputValue('');
    textareaRef.current?.focus();
  }, [inputValue, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const systemMessage = messages.find(m => m.is_system);
  const chatMessages = messages.filter(m => !m.is_system);

  // Find first unread message index (for "New" divider)
  // On initial load, messages sent by others that weren't read are "new"
  // We mark thread as read on mount, so treat all non-own messages after the last own message as "new"
  const lastOwnIndex = chatMessages.reduce((acc, m, i) => m.is_own ? i : acc, -1);
  const firstUnreadIndex = lastOwnIndex >= 0
    ? chatMessages.findIndex((m, i) => i > lastOwnIndex && !m.is_own)
    : -1;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FONT }}>

      {/* Thread header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          {threadType === 'editing' ? 'Editing' : 'Booking'} Request #{threadId}
          {isAdmin && meta?.customer_email && ` · ${meta.customer_email}`}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>
          {meta?.subject ?? '…'}
        </div>
        {(meta?.status || meta?.quoted_price) && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
            {meta.status && `Status: ${meta.status}`}
            {meta.status && meta.quoted_price && ' · '}
            {meta.quoted_price && `Quote: £${meta.quoted_price}`}
          </div>
        )}
      </div>

      {/* Auto-opener system message */}
      {systemMessage && (
        <div style={{
          margin: '14px 24px 6px',
          padding: '11px 14px',
          background: '#f3f4f6',
          border: '1px solid #e5e7eb',
          borderRadius: 3,
          fontSize: 12, color: '#555', lineHeight: 1.5,
          flexShrink: 0,
        }}>
          {systemMessage.body}
        </div>
      )}

      {/* Message list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#bbb', fontSize: 12, marginTop: 24 }}>Loading…</div>
        )}
        {!loading && chatMessages.map((m, i) => {
          const showDivider = i === firstUnreadIndex && firstUnreadIndex >= 0;
          return (
            <div key={m.id ?? `msg-${i}`} style={{ display: 'contents' }}>
              {showDivider && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  <div style={{ fontSize: 10, color: '#aaa', letterSpacing: '0.06em', textTransform: 'uppercase' }}>New</div>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                </div>
              )}
              <div style={{ alignSelf: m.is_own ? 'flex-end' : 'flex-start', maxWidth: '60%', display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  background: m.is_own ? '#111' : '#f3f4f6',
                  color: m.is_own ? '#fff' : '#111',
                  padding: '10px 13px',
                  borderRadius: 3,
                  fontSize: 12,
                  lineHeight: 1.5,
                  wordBreak: 'break-word',
                }}>
                  {m.body}
                </div>
                <div style={{
                  fontSize: 10, color: '#bbb', marginTop: 3,
                  textAlign: m.is_own ? 'right' : 'left',
                }}>
                  {m.is_own
                    ? `You · ${formatTimestamp(m.timestamp)}`
                    : `${isAdmin ? (m.sender_email ?? 'Customer') : 'Kay'} · ${formatTimestamp(m.timestamp)}`
                  }
                </div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '14px 24px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex', gap: 10, alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          style={{
            flex: 1,
            background: '#f9f9f9',
            border: '1px solid #e5e7eb',
            padding: '10px 12px',
            fontSize: 12,
            fontFamily: FONT,
            color: '#111',
            borderRadius: 2,
            resize: 'none',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!connected || !inputValue.trim()}
          style={{
            background: connected ? '#111' : '#ccc',
            color: '#fff',
            padding: '10px 18px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 2,
            cursor: connected ? 'pointer' : 'not-allowed',
            flexShrink: 0,
            fontFamily: FONT,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
