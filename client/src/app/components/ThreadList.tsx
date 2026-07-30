const FONT = "'Helvetica Neue', Arial, sans-serif";

export interface ThreadSummary {
  thread_type: 'booking' | 'editing';
  thread_id: number;
  subject: string;
  last_message_body: string;
  last_message_at: string | null;
  unread_count: number;
  customer_email?: string; // admin only
  customer_name?: string;  // admin only
}

interface ThreadListProps {
  grouped: boolean;
  threads: ThreadSummary[];
  selectedKey: string | null;
  onSelect: (key: string) => void;
}

function formatTime(isoString: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (msgDay.getTime() === today.getTime()) {
    return `Today ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  }
  if (msgDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return `${date.getDate()} ${date.toLocaleString('en-GB', { month: 'short' })}`;
}

function ThreadRow({
  thread,
  isActive,
  onSelect,
}: {
  thread: ThreadSummary;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: '12px 16px',
        background: isActive ? '#fff' : 'transparent',
        borderLeft: isActive ? '2px solid #111' : '2px solid transparent',
        borderBottom: '1px solid #f0f0f0',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}
      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = '#f7f7f7'; }}
      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {thread.customer_email ? (
          <div style={{
            fontSize: 10, color: '#aaa', textTransform: 'uppercase',
            letterSpacing: '0.07em', marginBottom: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {thread.thread_type === 'editing' ? 'Editing' : 'Booking'} #{thread.thread_id} · {thread.customer_name || thread.customer_email}
          </div>
        ) : (
          <div style={{
            fontSize: 10, color: '#aaa', letterSpacing: '0.04em', marginBottom: 2,
          }}>
            {thread.thread_type === 'editing' ? 'Editing' : 'Booking'} · #{thread.thread_id}
          </div>
        )}
        <div style={{
          fontWeight: 500, color: '#111', fontSize: 12, marginBottom: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {thread.subject || '(no subject)'}
        </div>
        <div style={{
          fontSize: 11, color: '#888',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {thread.last_message_body}
        </div>
        <div style={{ fontSize: 10, color: '#bbb', marginTop: 3 }}>
          {formatTime(thread.last_message_at)}
        </div>
      </div>
      {thread.unread_count > 0 && (
        <div style={{
          width: 17, height: 17,
          background: '#111', color: '#fff',
          borderRadius: '50%',
          fontSize: 9, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, marginLeft: 8, marginTop: 2,
        }}>
          {thread.unread_count}
        </div>
      )}
    </div>
  );
}

export function ThreadList({ grouped, threads, selectedKey, onSelect }: ThreadListProps) {
  if (!grouped) {
    return (
      <div style={{ overflow: 'hidden auto', height: '100%', fontFamily: FONT }}>
        <div style={{
          padding: '10px 16px',
          fontSize: 10, fontWeight: 600,
          letterSpacing: '0.12em', textTransform: 'uppercase',
          color: '#aaa', borderBottom: '1px solid #f0f0f0',
        }}>
          All Conversations
        </div>
        {threads.length === 0 && (
          <div style={{ padding: '20px 16px', fontSize: 12, color: '#aaa' }}>
            No conversations yet.
          </div>
        )}
        {threads.map(t => {
          const key = `${t.thread_type}_${t.thread_id}`;
          return (
            <ThreadRow
              key={key}
              thread={t}
              isActive={selectedKey === key}
              onSelect={() => onSelect(key)}
            />
          );
        })}
      </div>
    );
  }

  const editing = threads.filter(t => t.thread_type === 'editing');
  const booking = threads.filter(t => t.thread_type === 'booking');

  return (
    <div style={{ overflow: 'hidden auto', height: '100%', fontFamily: FONT }}>
      <div style={{
        padding: '10px 16px',
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#111', borderBottom: '1px solid #e5e7eb',
      }}>
        Editing Requests
      </div>
      {editing.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11, color: '#bbb' }}>No editing threads yet.</div>
      )}
      {editing.map(t => {
        const key = `editing_${t.thread_id}`;
        return (
          <ThreadRow key={key} thread={t} isActive={selectedKey === key} onSelect={() => onSelect(key)} />
        );
      })}

      <div style={{
        padding: '10px 16px',
        fontSize: 10, fontWeight: 700,
        letterSpacing: '0.12em', textTransform: 'uppercase',
        color: '#111', borderBottom: '1px solid #e5e7eb',
        borderTop: '1px solid #e5e7eb', marginTop: 4,
      }}>
        Bookings
      </div>
      {booking.length === 0 && (
        <div style={{ padding: '12px 16px', fontSize: 11, color: '#bbb' }}>No booking threads yet.</div>
      )}
      {booking.map(t => {
        const key = `booking_${t.thread_id}`;
        return (
          <ThreadRow key={key} thread={t} isActive={selectedKey === key} onSelect={() => onSelect(key)} />
        );
      })}
    </div>
  );
}
