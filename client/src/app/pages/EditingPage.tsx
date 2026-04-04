import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, apiPostForm } from '../lib/api';

interface UploadedFile {
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;  // 0-100 (simulated — fetch doesn't expose XHR progress)
  errorMsg?: string;
}

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.tiff', '.tif', '.cr2', '.nef', '.arw'];
const MAX_SIZE_MB  = 25;

function getExt(name: string) {
  return name.slice(name.lastIndexOf('.')).toLowerCase();
}

function validateFile(file: File): string | null {
  if (!ALLOWED_EXTS.includes(getExt(file.name))) {
    return `${file.name}: file type not allowed (accepted: JPG, PNG, TIFF, RAW)`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `${file.name}: exceeds ${MAX_SIZE_MB} MB limit`;
  }
  return null;
}

export function EditingPage() {
  const [styleNotes,  setStyleNotes]  = useState('');
  const [turnaround,  setTurnaround]  = useState('');
  const [files,       setFiles]       = useState<UploadedFile[]>([]);
  const [dragOver,    setDragOver]    = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate     = useNavigate();

  function addFiles(newFiles: FileList | File[]) {
    const additions: UploadedFile[] = [];
    for (const f of Array.from(newFiles)) {
      const err = validateFile(f);
      if (err) { toast.error(err); continue; }
      // Avoid duplicates by name+size
      if (files.some(u => u.file.name === f.name && u.file.size === f.size)) continue;
      additions.push({ file: f, status: 'pending', progress: 0 });
    }
    setFiles(prev => [...prev, ...additions]);
  }

  function removeFile(index: number) {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  }

  const canSubmit = styleNotes.trim() && turnaround.trim() && files.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      // Step 1: Create the editing request
      const { id } = await api.post<{ id: number; status: string }>(
        '/editing-requests/',
        { style_notes: styleNotes.trim(), turnaround: turnaround.trim() }
      );

      // Step 2: Upload each file in sequence
      for (let i = 0; i < files.length; i++) {
        setFiles(prev => prev.map((f, idx) =>
          idx === i ? { ...f, status: 'uploading', progress: 50 } : f
        ));
        try {
          const formData = new FormData();
          formData.append('file', files[i].file);
          await apiPostForm(`/editing-requests/${id}/files/`, formData);
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'done', progress: 100 } : f
          ));
        } catch {
          setFiles(prev => prev.map((f, idx) =>
            idx === i ? { ...f, status: 'error', progress: 0, errorMsg: 'Upload failed' } : f
          ));
        }
      }

      toast.success('Editing request submitted! Kay will review and send you a quote.');
      navigate('/dashboard');
    } catch {
      toast.error('Failed to submit request. Please try again.');
      setSubmitting(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 12px',
    border: '1px solid rgba(0,0,0,0.12)',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    fontSize: 13, color: '#111', outline: 'none',
    boxSizing: 'border-box' as const,
  };
  const labelStyle = {
    fontSize: 10, fontWeight: 600 as const, letterSpacing: '0.1em',
    textTransform: 'uppercase' as const, color: '#888',
    display: 'block' as const, marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#fafafa',
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      paddingTop: 80,
    }}>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '40px 24px' }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#aaa', margin: '0 0 8px' }}>
            Photo Editing
          </p>
          <h1 style={{ fontSize: 28, fontWeight: 300, color: '#111', margin: 0, letterSpacing: '-0.01em' }}>
            Submit photos for editing
          </h1>
        </div>

        <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Form */}
          <div style={{ flex: '1 1 480px', background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '28px 28px 24px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {/* Style notes */}
              <div>
                <label style={labelStyle}>Editing Style & Instructions</label>
                <textarea
                  value={styleNotes}
                  onChange={e => setStyleNotes(e.target.value)}
                  placeholder="Describe the look you're after — e.g. warm tones, black & white, natural light, remove blemishes…"
                  maxLength={2000}
                  rows={4}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Turnaround */}
              <div>
                <label style={labelStyle}>Turnaround Expectation</label>
                <input
                  type="text"
                  value={turnaround}
                  onChange={e => setTurnaround(e.target.value)}
                  placeholder="e.g. within 2 weeks, no rush, by 15 May"
                  maxLength={200}
                  style={inputStyle}
                />
              </div>

              {/* File upload */}
              <div>
                <label style={labelStyle}>Upload Photos</label>

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? '#111' : '#d1d5db'}`,
                    borderRadius: 4, padding: '28px 16px', textAlign: 'center',
                    background: dragOver ? '#f9f9f9' : '#fafafa',
                    cursor: 'pointer', marginBottom: 12,
                    transition: 'border-color 0.2s, background 0.2s',
                  }}
                >
                  <div style={{ fontSize: 22, marginBottom: 6 }}>📁</div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: '#555' }}>Drag & drop photos here</div>
                  <div style={{ fontSize: 11, color: '#aaa', marginTop: 3 }}>or click to browse</div>
                  <div style={{ fontSize: 10, color: '#bbb', marginTop: 6 }}>
                    JPG, PNG, TIFF, RAW · Max {MAX_SIZE_MB} MB per file
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={ALLOWED_EXTS.join(',')}
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }}
                />

                {/* File list */}
                {files.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {files.map((uf, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px',
                        background: uf.status === 'error' ? '#fef2f2' : uf.status === 'done' ? '#f0fdf4' : '#fff',
                        border: `1px solid ${uf.status === 'error' ? '#fca5a5' : uf.status === 'done' ? '#bbf7d0' : '#e5e7eb'}`,
                        borderRadius: 3, fontSize: 11,
                      }}>
                        <span style={{ color: uf.status === 'error' ? '#dc2626' : '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 280 }}>
                          📷 {uf.file.name}
                          <span style={{ color: '#aaa', marginLeft: 6 }}>· {(uf.file.size / 1024 / 1024).toFixed(1)} MB</span>
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {uf.status === 'uploading' && (
                            <div style={{ width: 60, height: 3, background: '#e5e7eb', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${uf.progress}%`, height: '100%', background: '#111', transition: 'width 0.3s' }} />
                            </div>
                          )}
                          {uf.status === 'done'     && <span style={{ color: '#22c55e', fontSize: 12 }}>✓</span>}
                          {uf.status === 'error'    && <span style={{ color: '#ef4444', fontSize: 11 }}>{uf.errorMsg}</span>}
                          {uf.status !== 'uploading' && uf.status !== 'done' && (
                            <button onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1 }}>✕</button>
                          )}
                        </div>
                      </div>
                    ))}
                    <p style={{ fontSize: 11, color: '#aaa', margin: '6px 0 0' }}>
                      {files.length} file{files.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                )}
              </div>

            </div>

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              style={{
                width: '100%', padding: '12px 0', marginTop: 24,
                background: canSubmit ? '#111' : '#e5e7eb',
                color: canSubmit ? '#fff' : '#aaa',
                border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed',
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
                fontSize: 12, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
                transition: 'background 0.2s',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit Editing Request'}
            </button>
          </div>

          {/* Sidebar */}
          <div style={{ flex: '0 0 240px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '20px 20px 18px' }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', margin: '0 0 14px' }}>What happens next</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  'Kay reviews your photos and style notes',
                  'You receive a price quote via message',
                  'Once agreed, editing begins',
                  'Edited photos delivered within your chosen turnaround',
                ].map((text, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <span style={{ width: 18, height: 18, background: '#111', color: '#fff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.06)', padding: '18px 20px', fontSize: 11, color: '#777', lineHeight: 1.6 }}>
              Prices are set by Kay based on the number of photos and complexity of edits. You'll receive a quote before any work begins.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
