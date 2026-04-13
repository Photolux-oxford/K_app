import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ThreadList, type ThreadSummary } from '../components/ThreadList';
import { ChatPanel } from '../components/ChatPanel';
import { Header } from '../components/Header';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

export function MessagesPage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    searchParams.get('thread') ?? null
  );
  const [loading, setLoading] = useState(true);

  // Fetch thread list
  const fetchThreads = async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/messages/threads/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data = await resp.json();
        // Customer response is grouped: { editing: [...], booking: [...] }
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

  useEffect(() => { fetchThreads(); }, [token]);

  const selectedThread = selectedKey
    ? (() => {
        const [type, idStr] = selectedKey.split('_');
        return { threadType: type as 'booking' | 'editing', threadId: parseInt(idStr, 10) };
      })()
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: FONT }}>
      <Header />
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 64px)',
        marginTop: 64,
        overflow: 'hidden',
      }}>
        {/* Sidebar */}
        <div style={{
          width: 260,
          flexShrink: 0,
          borderRight: '1px solid #e5e7eb',
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
                onSelect={key => {
                  setSelectedKey(key);
                  fetchThreads(); // refresh unread counts
                }}
              />
            )}
          </div>
        </div>

        {/* Chat panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
      </div>
    </div>
  );
}
