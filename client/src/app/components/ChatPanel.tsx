import { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat, type ChatMessage } from '../hooks/useChat';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

interface PaymentMeta {
  id: number;
  status: string;
  amount: string;
  currency: string;
  payment_link_url: string | null;
}

interface ThreadMeta {
  thread_type: 'booking' | 'editing';
  thread_id: number;
  subject: string;
  customer_email?: string;
  customer_name?: string;
  status?: string;
  quoted_price?: string | null;
  payment?: PaymentMeta | null;
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
  const [priceInput, setPriceInput] = useState('');
  const [sendingPayment, setSendingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadMeta = useCallback(() => {
    if (!token || !threadId || !isAdmin) return;

    if (threadType === 'editing') {
      fetch(`${API_BASE}/admin/editing-requests/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((items: Array<{
          id: number; customer_email: string; customer_name?: string; style_notes?: string;
          status: string; quoted_price?: string | null;
          payment?: PaymentMeta | null;
        }>) => {
          const item = items.find(i => i.id === threadId);
          if (item) {
            setMeta({
              thread_type: threadType,
              thread_id: threadId,
              subject: (item.style_notes ?? '').slice(0, 60),
              customer_email: item.customer_email,
              customer_name: item.customer_name,
              status: item.status,
              quoted_price: item.quoted_price,
              payment: item.payment ?? null,
            });
            setPriceInput(item.quoted_price ?? '');
          }
        })
        .catch(() => {});
    } else {
      fetch(`${API_BASE}/admin/bookings/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then((items: Array<{
          id: number; customer_email: string; customer_name?: string;
          session_type?: string; location?: string; status: string;
          quoted_price?: string | null;
          payment?: PaymentMeta | null;
        }>) => {
          const item = items.find(i => i.id === threadId);
          if (item) {
            setMeta({
              thread_type: threadType,
              thread_id: threadId,
              subject: `${item.session_type ?? ''} · ${item.location ?? ''}`,
              customer_email: item.customer_email,
              customer_name: item.customer_name,
              status: item.status,
              quoted_price: item.quoted_price ?? null,
              payment: item.payment ?? null,
            });
            setPriceInput(item.quoted_price ?? '');
          }
        })
        .catch(() => {});
    }
  }, [threadType, threadId, token, isAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => { loadMeta(); }, [loadMeta]);

  const handleSendPayment = useCallback(async () => {
    if (!token) return;
    const price = parseFloat(priceInput);
    if (!price || price <= 0) {
      setPaymentError('Enter a valid price.');
      return;
    }
    setSendingPayment(true);
    setPaymentError('');

    const url = threadType === 'editing'
      ? `${API_BASE}/admin/editing-requests/${threadId}/send-payment/`
      : `${API_BASE}/admin/bookings/${threadId}/send-payment/`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quoted_price: price }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setPaymentError(data.error ?? 'Failed to send payment request.');
        return;
      }
      setMeta(prev => prev ? {
        ...prev,
        status: data.status,
        quoted_price: data.quoted_price,
        payment: data.payment ?? null,
      } : prev);
      setPriceInput(data.quoted_price ?? String(price));
      loadMeta();
    } catch {
      setPaymentError('Failed to send payment request.');
    } finally {
      setSendingPayment(false);
    }
  }, [token, threadType, threadId, priceInput, loadMeta]);

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

  const lastOwnIndex = chatMessages.reduce((acc, m, i) => m.is_own ? i : acc, -1);
  const firstUnreadIndex = lastOwnIndex >= 0
    ? chatMessages.findIndex((m, i) => i > lastOwnIndex && !m.is_own)
    : chatMessages.findIndex(m => !m.is_own);

  const paymentPaid = meta?.payment?.status === 'paid';
  const paymentPending = meta?.payment?.status === 'pending';
  const terminalStatuses = threadType === 'editing'
    ? ['declined', 'delivered']
    : ['declined', 'cancelled', 'completed'];
  const canSendPayment = isAdmin
    && !terminalStatuses.includes(meta?.status ?? '')
    && !paymentPaid;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: FONT }}>

      {/* Thread header */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid #e5e7eb', background: '#fff', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#aaa', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
          {threadType === 'editing' ? 'Editing' : 'Booking'} Request #{threadId}
          {isAdmin && (meta?.customer_name || meta?.customer_email) && ` · ${meta.customer_name || meta.customer_email}`}
        </div>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>
          {meta?.subject ?? '…'}
        </div>
        {(meta?.status || meta?.quoted_price || meta?.payment) && (
          <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
            {meta.status && `Status: ${meta.status}`}
            {meta.status && meta.quoted_price && ' · '}
            {meta.quoted_price && `Quote: £${meta.quoted_price}`}
            {paymentPaid && ' · Paid'}
            {paymentPending && !paymentPaid && meta.payment?.amount && ` · Payment pending — £${meta.payment.amount}`}
          </div>
        )}
      </div>

      {/* Admin payment / quote bar */}
      {canSendPayment && (
        <div style={{
          padding: '12px 24px',
          borderBottom: '1px solid #e5e7eb',
          background: '#fafafa',
          display: 'flex',
          gap: 10,
          alignItems: 'center',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}>
          <label style={{ fontSize: 11, color: '#666', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Price (£)
          </label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={priceInput}
            onChange={e => setPriceInput(e.target.value)}
            placeholder="0.00"
            style={{
              width: 88,
              border: '1px solid #e5e7eb',
              padding: '8px 10px',
              fontSize: 12,
              fontFamily: FONT,
              borderRadius: 2,
              outline: 'none',
            }}
          />
          <button
            onClick={handleSendPayment}
            disabled={sendingPayment || !priceInput.trim()}
            style={{
              background: sendingPayment || !priceInput.trim() ? '#ccc' : '#111',
              color: '#fff',
              padding: '8px 14px',
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              border: 'none',
              borderRadius: 2,
              cursor: sendingPayment || !priceInput.trim() ? 'not-allowed' : 'pointer',
              fontFamily: FONT,
            }}
          >
            {paymentPending ? 'Resend payment request' : 'Send payment request'}
          </button>
          {paymentError && (
            <span style={{ fontSize: 11, color: '#b91c1c' }}>{paymentError}</span>
          )}
        </div>
      )}

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
          disabled={!inputValue.trim()}
          style={{
            background: inputValue.trim() ? '#111' : '#ccc',
            color: '#fff',
            padding: '10px 18px',
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            border: 'none',
            borderRadius: 2,
            cursor: inputValue.trim() ? 'pointer' : 'not-allowed',
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
