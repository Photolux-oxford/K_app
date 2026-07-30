import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminLayout } from '../../components/admin/AdminLayout';
import { ThreadList, type ThreadSummary } from '../../components/ThreadList';
import { ChatPanel } from '../../components/ChatPanel';
import { useAuth } from '../../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api';
const FONT = "'Helvetica Neue', Arial, sans-serif";

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

export function AdminMessages() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    normalizeThreadKey(searchParams.get('thread'))
  );
  const [loading, setLoading] = useState(true);

  const fetchThreads = async () => {
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE}/messages/threads/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (resp.ok) {
        const data: ThreadSummary[] = await resp.json();
        setThreads(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchThreads(); }, [token]);

  const selectedThread = selectedKey ? parseThreadKey(selectedKey) : null;

  return (
    <AdminLayout activeTab="messages">
      <div style={{
        display: 'flex',
        height: 'calc(100vh - 64px - 80px)',
        overflow: 'hidden',
        margin: '-40px -32px',
        fontFamily: FONT,
      }}>
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
            Inbox
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {loading ? (
              <div style={{ padding: 20, fontSize: 12, color: '#bbb' }}>Loading…</div>
            ) : (
              <ThreadList
                grouped={false}
                threads={threads}
                selectedKey={selectedKey}
                onSelect={key => {
                  setSelectedKey(key);
                  fetchThreads();
                }}
              />
            )}
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {selectedThread ? (
            <ChatPanel
              threadType={selectedThread.threadType}
              threadId={selectedThread.threadId}
              isAdmin
            />
          ) : (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#bbb', fontSize: 13,
            }}>
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
