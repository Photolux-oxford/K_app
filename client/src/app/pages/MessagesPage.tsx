import { useState, useEffect } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThreadList, type ThreadSummary } from '../components/ThreadList';
import { ChatPanel } from '../components/ChatPanel';
import { Header } from '../components/Header';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";
const MOBILE_MQ = '(max-width: 768px)';

/** Normalize ?thread=booking_12 | booking-12 | booking:12 → booking_12 */
function normalizeThreadKey(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(booking|editing)[-_:](\d+)$/i);
  if (!m) return null;
  return `${m[1].toLowerCase()}_${m[2]}`;
}

function parseThreadKey(key: string): { threadType: 'booking' | 'editing'; threadId: number } | null {
  const m = key.match(/^(booking|editing)_(\d+)$/);
  if (!m) return null;
  return { threadType: m[1] as 'booking' | 'editing', threadId: parseInt(m[2], 10) };
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

export function MessagesPage() {
  const { token, user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialKey = normalizeThreadKey(searchParams.get('thread'));
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [loading, setLoading] = useState(true);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (user?.is_staff || !token) return;

    const fetchThreads = async () => {
      try {
        const resp = await fetch(`${API_BASE}/messages/threads/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const editing: ThreadSummary[] = (data.editing ?? []).map((t: ThreadSummary) => ({
            ...t, thread_type: 'editing' as const,
          }));
          const booking: ThreadSummary[] = (data.booking ?? []).map((t: ThreadSummary) => ({
            ...t, thread_type: 'booking' as const,
          }));
          setThreads([...editing, ...booking]);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };

    fetchThreads();
  }, [token, user?.is_staff]);

  // Staff should use the admin inbox — customer API shape differs
  if (user?.is_staff) {
    const thread = normalizeThreadKey(searchParams.get('thread'));
    const to = thread ? `/admin/messages?thread=${thread}` : '/admin/messages';
    return <Navigate to={to} replace />;
  }

  const selectedThread = selectedKey ? parseThreadKey(selectedKey) : null;
  const showList = !isMobile || !selectedThread;
  const showChat = !isMobile || !!selectedThread;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: FONT }}>
      <Header />
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        marginTop: 64,
        overflow: 'hidden',
      }}>
        {showList && (
          <div style={{
            width: isMobile ? '100%' : 260,
            flexShrink: 0,
            borderRight: isMobile ? 'none' : '1px solid #e5e7eb',
            background: '#fafafa',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <div style={{
              padding: '16px 16px 12px',
              fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              color: '#111', borderBottom: '1px solid #e5e7eb',
              flexShrink: 0,
            }}>
              Messages
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {loading ? (
                <div style={{ padding: 20, fontSize: 12, color: '#bbb' }}>Loading…</div>
              ) : (
                <ThreadList
                  grouped
                  threads={threads}
                  selectedKey={selectedKey}
                  onSelect={key => setSelectedKey(key)}
                />
              )}
            </div>
          </div>
        )}

        {showChat && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {isMobile && selectedThread && (
              <button
                type="button"
                onClick={() => setSelectedKey(null)}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '12px 16px',
                  background: '#fff',
                  border: 'none',
                  borderBottom: '1px solid #e5e7eb',
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 500,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: '#111',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                ← Back to messages
              </button>
            )}
            {selectedThread ? (
              <ChatPanel
                threadType={selectedThread.threadType}
                threadId={selectedThread.threadId}
                isAdmin={false}
              />
            ) : (
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#bbb', fontSize: 13,
              }}>
                Select a conversation to start messaging
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
